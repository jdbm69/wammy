// Creación de huellas perceptuales y distancia Hamming (HEX).
// Implementa dHash (64 bits) y pHash (64 bits) para robustez al clusterizar.

import Jimp from 'jimp';

/** dHash 64 bits (HEX) */
export async function dhash64(buf: Buffer): Promise<string> {
  const img = await Jimp.read(buf);
  img.grayscale().resize(9, 8, Jimp.RESIZE_BILINEAR);
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const l = img.getPixelColor(x, y) & 0xff;
      const r = img.getPixelColor(x + 1, y) & 0xff;
      bits += l < r ? '1' : '0';
    }
  }
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

/** pHash 64 bits (HEX) — DCT basado */
export async function phash64(buf: Buffer): Promise<string> {
  const N = 32; // tamaño DCT base
  const img = await Jimp.read(buf);
  img.grayscale().resize(N, N, Jimp.RESIZE_BILINEAR);

  // matriz de luminancia
  const mat: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      mat[y][x] = img.getPixelColor(x, y) & 0xff;
    }
  }

  // DCT-2 2D rápida (separable)
  const c: number[] = Array(N).fill(1);
  c[0] = 1 / Math.sqrt(2);
  const cosTable: number[][] = Array.from({ length: N }, (_, u) =>
    Array.from({ length: N }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)))
  );

  // DCT filas
  const tmp: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < N; u++) {
      let sum = 0;
      for (let x = 0; x < N; x++) sum += mat[y][x] * cosTable[u][x];
      tmp[y][u] = sum * c[u];
    }
  }
  // DCT columnas
  const dct: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let v = 0; v < N; v++) {
    for (let u = 0; u < N; u++) {
      let sum = 0;
      for (let y = 0; y < N; y++) sum += tmp[y][u] * cosTable[v][y];
      dct[v][u] = sum * c[v] / 4; // factor escala no crítico
    }
  }

  // Tomamos submatriz 8x8 de bajas frecuencias (ignorando DC [0][0])
  const low: number[] = [];
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      if (u === 0 && v === 0) continue;
      low.push(dct[v][u]);
    }
  }
  // mediana
  const sorted = [...low].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // bits
  let bits = '0'; // reservamos bit 0 para DC (no usado); mantenemos 64 bits totales
  for (let i = 0; i < 63; i++) {
    bits += (low[i] > median ? '1' : '0');
  }

  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

/** Hamming entre dos HEX del mismo largo */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  const A = BigInt('0x' + a);
  const B = BigInt('0x' + b);
  let x = A ^ B;
  let count = 0;
  while (x) { x &= (x - 1n); count++; }
  return count;
}
