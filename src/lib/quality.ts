// Revision de imagen y puntua segun: oscuridad, desenfoque, uniformidad

import Jimp from 'jimp';

export type QualityResult = {
  qualityScore: number;    
  isLowLight: boolean;
  isBlurry: boolean;
  likelyUnrelated: boolean;
  notes: string[];
};

function luminance(r: number, g: number, b: number): number {
  // luminancia perceptual simple 0..255
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export async function assessBasicQuality(buf: Buffer): Promise<QualityResult> {
  const img = await Jimp.read(buf);
  const { width, height } = img.bitmap;

  if (img.bitmap.width * img.bitmap.height < 200 * 200) {
    return {
      qualityScore: 0.2,
      isLowLight: false,
      isBlurry: true,
      likelyUnrelated: true,
      notes: ['Resolución muy baja']
    };
  }

  // -------- 1) Brillo promedio --------
  let sumLum = 0;
  let count = 0;

  // Iteramos por una rejilla (downsample) para no recorrer cada píxel si la imagen es muy grande
  const step1 = Math.max(1, Math.floor(Math.min(width, height) / 256));
  for (let y = 0; y < height; y += step1) {
    for (let x = 0; x < width; x += step1) {
      const rgba = Jimp.intToRGBA(img.getPixelColor(x, y));
      sumLum += luminance(rgba.r, rgba.g, rgba.b);
      count++;
    }
  }
  const avgLum = count ? sumLum / count : 0; // 0..255

  // -------- 2) Detección de blur básica (gradiente local) --------
  const gray = img.clone().grayscale(); // cada canal ≈ luminancia
  let edgeSum = 0;
  let samples = 0;
  const step2 = Math.max(1, Math.floor(Math.min(width, height) / 256));
  for (let y = 1; y < height - 1; y += step2) {
    for (let x = 1; x < width - 1; x += step2) {
      const c = Jimp.intToRGBA(gray.getPixelColor(x, y)).r;       // ya en gris
      const up = Jimp.intToRGBA(gray.getPixelColor(x, y - 1)).r;
      const down = Jimp.intToRGBA(gray.getPixelColor(x, y + 1)).r;
      const left = Jimp.intToRGBA(gray.getPixelColor(x - 1, y)).r;
      const right = Jimp.intToRGBA(gray.getPixelColor(x + 1, y)).r;
      const gx = Math.abs(right - left);
      const gy = Math.abs(down - up);
      edgeSum += gx + gy;
      samples++;
    }
  }
  const edgeMean = samples ? edgeSum / samples : 0;

  // -------- 3) Varianza (uniformidad) --------
  let varianceSum = 0;
  let vcount = 0;
  const step3 = Math.max(1, Math.floor(Math.min(width, height) / 64));
  for (let y = 0; y < height; y += step3) {
    for (let x = 0; x < width; x += step3) {
      const g = Jimp.intToRGBA(gray.getPixelColor(x, y)).r;
      const diff = g - avgLum;
      varianceSum += diff * diff;
      vcount++;
    }
  }
  const variance = vcount ? varianceSum / vcount : 0;

  // -------- Umbrales heurísticos (ajustables) --------
  const isLowLight = avgLum < 60;   // muy oscuro
  const isBlurry  = edgeMean < 12;  // poco contraste local
  const lowVar    = variance < 300; // demasiado uniforme

  const notes: string[] = [];
  if (isLowLight) notes.push('Foto muy oscura');
  if (isBlurry)   notes.push('Posible blur / fuera de foco');
  if (lowVar)     notes.push('Baja textura / uniforme');

  // Calidad 0..1 (combinación simple)
  let qualityScore = 1.0;
  if (isLowLight) qualityScore -= 0.4;
  if (isBlurry)   qualityScore -= 0.4;
  if (lowVar)     qualityScore -= 0.2;
  qualityScore = Math.max(0, Math.min(1, qualityScore));

  const likelyUnrelated = isLowLight && lowVar;

  return { qualityScore, isLowLight, isBlurry, likelyUnrelated, notes };
}