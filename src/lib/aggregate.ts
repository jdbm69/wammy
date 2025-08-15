// Descargar URLs, calcular calidad, clusterizar con dHash+pHash (complete-linkage),
// elegir representativa útil, pasar por visión IA, agrupar por área,
// confirmar daño pre-dedupe, calcular métricas y devolver respuesta.

import pLimit from 'p-limit';
import crypto from 'crypto';
import { fetchJpeg } from './downloader';
import { dhash64, phash64, hammingHex } from './hash';
import { assessBasicQuality } from './quality';
import { analyzeImageWithVision, type VisionResult } from './vision';
import type { AreaKey, AreaEntry, SourceImagesMeta } from './response';

// Imagen
type PerImage = {
  url: string;
  dHash: string;         // HEX 64b
  pHash: string;         // HEX 64b
  contentSha1: string;   // debug
  basicQuality: number;
  unrelatedBasic: boolean;
  qualityNotes: string[];
  vision?: VisionResult;
};

// ========================= CONFIG =========================
// Umbrales de similitud (más robusto al combinar dHash+pHash)
const DTH = 1;  // dHash: 0=exacto, 1=near-dup muy similar
const PTH = 8;  // pHash: típico 8..12 para near-dup
const MAX_REP_CANDIDATES = 3; // máximo a probar por cluster
const DEBUG_CLUSTERING = false; // logs de hashes, distancias y clusters

export async function aggregateClaim(images: string[]): Promise<{
  source_images: SourceImagesMeta;
  areas: AreaEntry[];
  overall_damage_severity: number;
  data_gaps: string[];
  confidence: number;
}> {
  const limit = pLimit(5);
  const perImage: PerImage[] = [];

  // 1) Descargar + hashes + calidad
  await Promise.all(
    images.map((url) =>
      limit(async () => {
        try {
          const buf = await fetchJpeg(url);
          const contentSha1 = crypto.createHash('sha1').update(buf).digest('hex');
          const [d, p, q] = await Promise.all([dhash64(buf), phash64(buf), assessBasicQuality(buf)]);
          perImage.push({
            url,
            dHash: d,
            pHash: p,
            contentSha1,
            basicQuality: q.qualityScore,
            unrelatedBasic: q.likelyUnrelated,
            qualityNotes: q.notes,
          });
        } catch {}
      })
    )
  );

  if (DEBUG_CLUSTERING) {
    console.log('--- DEBUG perImage ---');
    perImage.forEach((p, i) => {
      console.log(
        `[${i}] sha1=${p.contentSha1.slice(0,8)} d=${p.dHash} p=${p.pHash} q=${p.basicQuality.toFixed(2)} url=${p.url}`
      );
    });
  }

  // 2) Matrices de distancias (dHash y pHash)
  const n = perImage.length;
  const distD: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const distP: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = hammingHex(perImage[i].dHash, perImage[j].dHash);
      const p = hammingHex(perImage[i].pHash, perImage[j].pHash);
      distD[i][j] = distD[j][i] = d;
      distP[i][j] = distP[j][i] = p;
    }
  }

  // Si dHash parece colisionar (todas distancias d <=1), confía más en pHash
  const allD = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) allD.push(distD[i][j]);
  const dSuspicious = allD.length > 0 && allD.every((d) => d <= 1);
  const effDTH = dSuspicious ? 0 : DTH;

  function fitsCluster(i: number, clusterIdxs: number[]) {
    // complete-linkage: similar a TODOS los miembros
    return clusterIdxs.every((j) => distD[i][j] <= effDTH && distP[i][j] <= PTH);
  }

  // 3) Clustering por índices
  const clustersIdx: number[][] = [];
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (const c of clustersIdx) {
      if (fitsCluster(i, c)) { c.push(i); placed = true; break; }
    }
    if (!placed) clustersIdx.push([i]);
  }
  const clusters: PerImage[][] = clustersIdx.map((c) => c.map((i) => perImage[i]));

  if (DEBUG_CLUSTERING) {
    console.log('--- DEBUG clustering ---');
    console.log('effDTH=', effDTH, 'PTH=', PTH, 'clustersCount=', clusters.length);
    clusters.forEach((c, k) => console.log(`cluster ${k}:`, c.map(x => x.contentSha1.slice(0,8)).join(',')));
  }

  // 4) Métrica de descartes básicos
  const bestPerCluster = clusters.map((c) => c.slice().sort((a, b) => b.basicQuality - a.basicQuality)[0]);
  const repsPassingBasic = bestPerCluster.filter((i) => !i.unrelatedBasic);
  const discarded_low_quality = bestPerCluster.length - repsPassingBasic.length;

  // 5) Elegir representativa real por cluster (con fallback)
  type RepWithVision = PerImage & { vision: VisionResult };
  const chosenReps: RepWithVision[] = [];

  await Promise.all(
    clusters.map((cluster) =>
      limit(async () => {
        const candidates = cluster
          .slice()
          .sort((a, b) => b.basicQuality - a.basicQuality)
          .filter((c) => !c.unrelatedBasic)
          .slice(0, MAX_REP_CANDIDATES);

        let picked: RepWithVision | null = null;
        let pickedWind: RepWithVision | null = null;
        let fallbackRelated: RepWithVision | null = null;

        for (const c of candidates) {
          const v = await analyzeImageWithVision(c.url);
          const related = !v.unrelated_or_low_quality;

          if (related && v.is_wind_damage && (v.severity ?? 0) >= 2) {
            picked = { ...c, vision: v }; break;
          }
          if (related && v.is_wind_damage && !pickedWind) {
            pickedWind = { ...c, vision: v };
          }
          if (related && !fallbackRelated) {
            fallbackRelated = { ...c, vision: v };
          }
        }
        const finalRep = picked ?? pickedWind ?? fallbackRelated;
        if (finalRep) chosenReps.push(finalRep);
      })
    )
  );

  // 6) Expandir etiquetas desde la representativa al resto del cluster (pre-dedupe)
  type ExpandedImg = PerImage & {
    expandedArea?: AreaKey;
    expandedSeverity?: number;
    expandedQuality?: number;
    expandedConfidence?: number;
    expandedIsWind?: boolean;
  };

  const expandedImages: ExpandedImg[] = [];
  for (const cluster of clusters) {
    const repsSorted = cluster
      .slice()
      .sort((a, b) => b.basicQuality - a.basicQuality)
      .filter((c) => !c.unrelatedBasic)
      .slice(0, MAX_REP_CANDIDATES);

    const repChosen = repsSorted
      .map((c) => chosenReps.find((r) => r.url === c.url))
      .find(Boolean) as RepWithVision | undefined;

    if (!repChosen) continue;
    const v = repChosen.vision;

    const area = ([
      'roof', 'siding', 'garage', 'windows', 'doors', 'fences',
      'gutters', 'solar_panels', 'chimney', 'porch', 'deck',
      'pool_area', 'landscape', 'other'
    ].includes(v.area) ? (v.area as AreaKey) : 'other');

    for (const m of cluster) {
      if (m.unrelatedBasic) continue;
      expandedImages.push({
        ...m,
        expandedArea: area,
        expandedSeverity: v.severity ?? 0,
        expandedQuality: v.quality ?? 0.5,
        expandedConfidence: v.confidence ?? 0.5,
        expandedIsWind: !!v.is_wind_damage,
      });
    }
  }

  // 7) Agrupar por área (pre-dedupe) y representativas (post-dedupe)
  const emptyAreasArr = {
    roof: [], siding: [], garage: [], windows: [], doors: [],
    fences: [], gutters: [], solar_panels: [], chimney: [],
    porch: [], deck: [], pool_area: [], landscape: [], other: []
  } as const;

  const byAreaExpanded: Record<AreaKey, ExpandedImg[]> = {
    roof: [], siding: [], garage: [], windows: [], doors: [],
    fences: [], gutters: [], solar_panels: [], chimney: [],
    porch: [], deck: [], pool_area: [], landscape: [], other: []
  };
  for (const img of expandedImages) {
    const area = img.expandedArea ?? 'other';
    byAreaExpanded[area].push(img);
  }

  const byAreaReps: Record<AreaKey, RepWithVision[]> = {
    roof: [], siding: [], garage: [], windows: [], doors: [],
    fences: [], gutters: [], solar_panels: [], chimney: [],
    porch: [], deck: [], pool_area: [], landscape: [], other: []
  };
  for (const rep of chosenReps) {
    const v = rep.vision;
    if (v.unrelated_or_low_quality) continue;
    const area = ([
      'roof', 'siding', 'garage', 'windows', 'doors', 'fences',
      'gutters', 'solar_panels', 'chimney', 'porch', 'deck',
      'pool_area', 'landscape', 'other'
    ].includes(v.area) ? (v.area as AreaKey) : 'other');
    byAreaReps[area].push(rep);
  }

  // 8) Construcción de áreas
  const areas: AreaEntry[] = (Object.keys(byAreaExpanded) as AreaKey[])
    .map((area) => {
      const imgsExpanded = byAreaExpanded[area];
      const reps = byAreaReps[area];

      const evidenceCount = imgsExpanded.filter(
        (x) => (x.expandedSeverity ?? 0) >= 2 && x.expandedIsWind
      ).length;
      const damage_confirmed = evidenceCount >= 2;

      const count = reps.length;

      const anyWind = imgsExpanded.some((x) => x.expandedIsWind === true);
      const primary_peril = anyWind ? 'wind' as const : 'no wind' as const;

      const avgSeverity = reps.length
        ? Number((reps.reduce((s, x) => s + (x.vision?.severity ?? 0), 0) / reps.length).toFixed(2))
        : 0;

      const repUrl = reps
        .slice()
        .sort((a, b) => {
          const qa = 0.5 * a.basicQuality + 0.5 * (a.vision?.quality ?? 0.5);
          const qb = 0.5 * b.basicQuality + 0.5 * (b.vision?.quality ?? 0.5);
          return qb - qa;
        })[0]?.url;

      const bestNotes =
        reps
          .slice()
          .sort((a, b) => (b.vision?.confidence ?? 0.5) - (a.vision?.confidence ?? 0.5))[0]
          ?.vision?.notes || '';

      return {
        area,
        damage_confirmed,
        primary_peril,
        count,
        avg_severity: avgSeverity,
        representative_images: repUrl ? [repUrl] : [],
        notes: bestNotes,
      } as AreaEntry;
    })
    .filter((a) => a.count > 0);

  // 9) Severidad global (ponderada) con representativas
  const keptRepsForOverall = Object.values(byAreaReps).flat();
  const denom = keptRepsForOverall.reduce((s, x) => s + (x.vision?.quality ?? 0.5), 0);
  const num = keptRepsForOverall.reduce((s, x) => s + ((x.vision?.severity ?? 0) * (x.vision?.quality ?? 0.5)), 0);
  const overall_damage_severity = denom ? Number((num / denom).toFixed(2)) : 0;

  // 10) Confianza global
  const confBase = keptRepsForOverall.length
    ? keptRepsForOverall.reduce((s, x) => s + (x.vision?.confidence ?? 0.5), 0) / keptRepsForOverall.length
    : 0.4;
  const volumeBoost = Math.min(1, keptRepsForOverall.length / 10);
  const confidence = Number((confBase * (0.7 + 0.3 * volumeBoost)).toFixed(2));

  // 11) Data gaps
  const data_gaps: string[] = [];
  if (byAreaExpanded.roof.length === 0) data_gaps.push('No roof photos');
  if (byAreaExpanded.siding.length === 0) data_gaps.push('No siding photos');
  if (byAreaExpanded.garage.length === 0) data_gaps.push('No garage photos');
  if (expandedImages.length < 3) data_gaps.push('Low photo count');

  // 12) Fuente
  const source_images: SourceImagesMeta = {
    total: images.length,
    analyzed: perImage.length,
    discarded_low_quality,
    clusters: clusters.length,
  };

  return { source_images, areas, overall_damage_severity, data_gaps, confidence };
}
