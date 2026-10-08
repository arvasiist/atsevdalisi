/** Avatar testleri için en küçük GERÇEK biçimli baytlar (başlıklar elle kurulur). */
export function pngBytes(width: number, height: number, extra = 64): Uint8Array {
  const bytes = new Uint8Array(33 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

export function jpegBytes(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

export function webpVp8xBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
  return bytes;
}

/** Geçerli en küçük GLB: başlık + JSON parçası (4 bayta hizalı). */
export function glbBytes(json: object = { asset: { version: '2.0' } }): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += ' ';
  const total = 12 + 8 + text.length;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, text.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(new TextEncoder().encode(text), 20);
  return bytes;
}

/**
 * Telefon fotoğrafı gibi bir JPEG (08.10.2026, profil fotoğrafı): JFIF + EXIF
 * (Orientation + içinde `secret` geçen GPS benzeri metin) + niceleme + SOF0 +
 * SOS + veri + EOI. Meta veri temizliğinin `secret`i sildiği bayt düzeyinde
 * sınanır.
 */
export function phoneJpegBytes(width: number, height: number, secret: string, orientation = 6): Uint8Array {
  const enc = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
  const segment = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const tiff = [
    ...enc('II'), 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    ...enc(secret),
  ];
  return Uint8Array.from([
    0xff, 0xd8,
    ...segment(0xe0, [...enc('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...enc('Exif'), 0, 0, ...tiff]),
    ...segment(0xdb, [0, ...new Array(64).fill(1)]),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
    0x12, 0x34, 0xff, 0x00, 0x56,
    0xff, 0xd9,
  ]);
}

/** Eksiksiz PNG (IHDR + IDAT + IEND) — profil fotoğrafı IEND'siz (kesik) dosyayı reddeder. */
export function completePngBytes(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: number[]) => [
    (data.length >>> 24) & 0xff, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff,
    ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0,
  ];
  const be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [...be(width), ...be(height), 8, 2, 0, 0, 0]),
    ...chunk('IDAT', [0x78, 0x9c, 0x01, 0x00]),
    ...chunk('IEND', []),
  ]);
}
