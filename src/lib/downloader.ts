// Funcion que descarga y valida cada imagen

export async function fetchJpeg(url: string): Promise<Buffer> {

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al descargar ${url}`);
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength === 0) {
    throw new Error(`Respuesta vacía para ${url}`);
  }
  return Buffer.from(ab);
}