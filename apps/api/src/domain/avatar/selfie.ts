import { SelfieRejectedError } from './errors';

/**
 * SELFIE ÖN KONTROLÜ (07.10.2026, brief §39) — saf, bağımlılıksız.
 *
 * Burada YALNIZCA dosyanın kendisinden kesin olarak bilinenler denetlenir:
 * boş/boyut, gerçek biçim (uzantı ya da istemcinin bildirdiği tür DEĞİL,
 * dosyanın ilk baytları), bildirilen türle uyum ve çözünürlük (başlıktan).
 * Yüz görünürlüğü, yüz boyutu, çoklu kişi, ışık ve bulanıklık piksel
 * analizi ister; bunlar sağlayıcının ANALİZ adımında yapılır ve iş
 * `failed` + neden koduyla döner (uydurma bir "yüz bulundu" yazılmaz).
 */
export type SelfieType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface SelfieRules {
  maxUploadBytes: number;
  acceptedTypes: readonly string[];
  minDimension: number;
  maxDimension: number;
}

export function detectImageType(bytes: Uint8Array): SelfieType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

/** Başlıktan genişlik/yükseklik; okunamazsa `null` (bozuk ya da kesik dosya). */
export function readImageDimensions(bytes: Uint8Array, type: SelfieType): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png') {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null;
    return positive(view.getUint32(16), view.getUint32(20));
  }
  if (type === 'image/webp') {
    if (bytes.length < 30) return null;
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8 ') return positive(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (chunk === 'VP8L') {
      if (bytes[20] !== 0x2f) return null;
      const b = view.getUint32(21, true);
      return positive((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8X') {
      const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
      const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
      return positive(width, height);
    }
    return null;
  }
  // JPEG: SOF işaretçisine kadar segmentleri yürü.
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 9 > bytes.length) return null;
      return positive(view.getUint16(offset + 7), view.getUint16(offset + 5));
    }
    if (marker === 0xda || marker === 0xd9) return null;
    offset += 2 + length;
  }
  return null;
}

/**
 * Selfie'yi doğrular; geçerse GERÇEK türü döner (depolama uzantısı buradan
 * seçilir, istemcinin dosya adından DEĞİL — brief: dosya adı path olmaz).
 */
export function validateSelfie(bytes: Uint8Array, declaredType: string | undefined, rules: SelfieRules): SelfieType {
  if (bytes.length === 0) throw new SelfieRejectedError('EMPTY_FILE');
  if (bytes.length > rules.maxUploadBytes) throw new SelfieRejectedError('FILE_TOO_LARGE');
  const type = detectImageType(bytes);
  if (type === null || !rules.acceptedTypes.includes(type)) throw new SelfieRejectedError('UNSUPPORTED_FORMAT');
  if (declaredType !== undefined && declaredType !== type) throw new SelfieRejectedError('TYPE_MISMATCH');
  const size = readImageDimensions(bytes, type);
  if (size === null) throw new SelfieRejectedError('CORRUPT_IMAGE');
  if (Math.min(size.width, size.height) < rules.minDimension) throw new SelfieRejectedError('IMAGE_TOO_SMALL');
  if (Math.max(size.width, size.height) > rules.maxDimension) throw new SelfieRejectedError('IMAGE_TOO_LARGE');
  return type;
}

export const SELFIE_EXTENSIONS: Record<SelfieType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function positive(width: number, height: number): { width: number; height: number } | null {
  return width > 0 && height > 0 ? { width, height } : null;
}
