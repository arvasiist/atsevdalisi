import { readImageDimensions, validateSelfie, type SelfieRules, type SelfieType } from './selfie';
import { SelfieRejectedError, SELFIE_REJECTION_REASONS } from './errors';

/**
 * PROFİL FOTOĞRAFI (08.10.2026, sahibinin isteği: "avatar kısmına kişi
 * fotoğrafını ekleyebilsin") — saf, bağımlılıksız.
 *
 * Fotoğraf HERKESE AÇIK profilde görünür; bu yüzden saklamadan önce:
 *  1. Biçim/boyut/çözünürlük dosyanın BAYTLARINDAN doğrulanır (selfie ön
 *     kontrolüyle AYNI kural — istemcinin bildirdiği tür ya da dosya adı
 *     değil).
 *  2. Hareketli görüntü (APNG, hareketli WebP) reddedilir.
 *  3. META VERİ SİLİNİR: JPEG'in EXIF/XMP (APP1), IPTC (APP13), diğer APP
 *     bölümleri ve yorumları; PNG'nin metin/`eXIf`/zaman parçaları; WebP'nin
 *     `EXIF`/`XMP ` parçaları. EXIF telefonun KONUMUNU (GPS) taşır — profil
 *     fotoğrafı oyuncunun evinin adresini sızdırmamalı. Yalnızca JPEG YÖN
 *     bilgisi (Orientation) yeniden yazılır, yoksa telefon fotoğrafı yan
 *     görünürdü. Renk profili (ICC, APP2) ve JFIF/Adobe başlıkları kalır.
 *  4. Dosyanın SONUNA eklenmiş bayt (JPEG EOI / PNG IEND / RIFF boyu sonrası)
 *     atılır — görüntü + başka bir dosya "polyglot"u saklanmaz.
 */
export const PHOTO_REJECTION_REASONS = [...SELFIE_REJECTION_REASONS, 'ANIMATED_IMAGE'] as const;
export type PhotoRejectionReason = (typeof PHOTO_REJECTION_REASONS)[number];

const PHOTO_MESSAGES: Record<PhotoRejectionReason, string> = {
  EMPTY_FILE: 'Dosya boş.',
  FILE_TOO_LARGE: 'Fotoğraf çok büyük.',
  UNSUPPORTED_FORMAT: 'Yalnızca JPEG, PNG ya da WebP fotoğraf yükleyebilirsin.',
  TYPE_MISMATCH: 'Dosyanın içeriği bildirilen türle uyuşmuyor.',
  CORRUPT_IMAGE: 'Fotoğraf okunamadı; dosya bozuk olabilir.',
  IMAGE_TOO_SMALL: 'Fotoğraf çözünürlüğü çok düşük.',
  IMAGE_TOO_LARGE: 'Fotoğraf çözünürlüğü çok yüksek.',
  ANIMATED_IMAGE: 'Hareketli görüntü profil fotoğrafı olamaz.',
};

/** Profil fotoğrafı reddedildi (422 `PHOTO_REJECTED`); neden mesajdadır. */
export class PhotoRejectedError extends Error {
  constructor(readonly reason: PhotoRejectionReason) {
    super(PHOTO_MESSAGES[reason]);
    this.name = 'PhotoRejectedError';
  }
}

export interface PreparedProfilePhoto {
  type: SelfieType;
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Doğrular, meta veriyi siler; saklanacak baytları döner. */
export function prepareProfilePhoto(
  bytes: Uint8Array,
  declaredType: string | undefined,
  rules: SelfieRules,
): PreparedProfilePhoto {
  let type: SelfieType;
  try {
    type = validateSelfie(bytes, declaredType, rules);
  } catch (error) {
    if (error instanceof SelfieRejectedError) throw new PhotoRejectedError(error.reason);
    throw error;
  }
  const cleaned = stripImageMetadata(bytes, type);
  const size = readImageDimensions(cleaned, type);
  if (size === null) throw new PhotoRejectedError('CORRUPT_IMAGE');
  return { type, bytes: cleaned, width: size.width, height: size.height };
}

export function stripImageMetadata(bytes: Uint8Array, type: SelfieType): Uint8Array {
  if (type === 'image/jpeg') return stripJpeg(bytes);
  if (type === 'image/png') return stripPng(bytes);
  return stripWebp(bytes);
}

// ---------------------------------------------------------------- JPEG

const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee]); // JFIF, ICC profili, Adobe

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [];
  let orientation: number | null = null;
  let offset = 2;
  let scanStart = -1;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new PhotoRejectedError('CORRUPT_IMAGE');
    // Dolgu baytları (art arda 0xFF) atlanır.
    while (offset + 1 < bytes.length && bytes[offset + 1] === 0xff) offset += 1;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda) {
      scanStart = offset;
      break;
    }
    if (marker === 0xd9) throw new PhotoRejectedError('CORRUPT_IMAGE');
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) throw new PhotoRejectedError('CORRUPT_IMAGE');
    const length = view.getUint16(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) throw new PhotoRejectedError('CORRUPT_IMAGE');
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (marker === 0xe1) {
      orientation ??= readExifOrientation(bytes.subarray(offset + 4, end));
    } else if (marker === 0xfe || (isApp && !JPEG_KEEP_APP.has(marker))) {
      // yorum / IPTC / diğer uygulama bölümleri — atılır
    } else {
      kept.push(bytes.subarray(offset, end));
    }
    offset = end;
  }
  if (scanStart < 0) throw new PhotoRejectedError('CORRUPT_IMAGE');
  // Görüntü verisi son EOI'ye kadar; sonrası (eklenmiş dosya) atılır.
  let eoi = -1;
  for (let i = bytes.length - 2; i >= scanStart; i -= 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      eoi = i + 2;
      break;
    }
  }
  if (eoi < 0) throw new PhotoRejectedError('CORRUPT_IMAGE');

  const segments: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)];
  const orientationSegment =
    orientation !== null && orientation >= 2 && orientation <= 8 ? exifOrientationSegment(orientation) : null;
  if (orientationSegment && kept[0]?.[1] === 0xe0) {
    segments.push(kept[0], orientationSegment, ...kept.slice(1));
  } else {
    if (orientationSegment) segments.push(orientationSegment);
    segments.push(...kept);
  }
  segments.push(bytes.subarray(scanStart, eoi));
  return concat(segments);
}

/** APP1 gövdesinden (uzunluk alanından sonrası) EXIF Orientation; yoksa/bozuksa `null`. */
export function readExifOrientation(app1: Uint8Array): number | null {
  if (app1.length < 14 || ascii(app1, 0, 4) !== 'Exif' || app1[4] !== 0 || app1[5] !== 0) return null;
  const tiff = app1.subarray(6);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const little = order === 'II';
  if (view.getUint16(2, little) !== 0x2a) return null;
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.length) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    if (view.getUint16(entry, little) === 0x0112 && view.getUint16(entry + 2, little) === 3) {
      return view.getUint16(entry + 8, little);
    }
  }
  return null;
}

/** Yalnızca Orientation etiketini taşıyan en küçük EXIF APP1 bölümü (büyük-endian TIFF). */
function exifOrientationSegment(orientation: number): Uint8Array {
  return Uint8Array.of(
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 @ 8
    0x00, 0x01, // 1 kayıt
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // sonraki IFD yok
  );
}

// ---------------------------------------------------------------- PNG

const PNG_DROP_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new PhotoRejectedError('CORRUPT_IMAGE');
    const chunk = ascii(bytes, offset + 4, 4);
    if (chunk === 'acTL') throw new PhotoRejectedError('ANIMATED_IMAGE');
    if (!PNG_DROP_CHUNKS.has(chunk)) kept.push(bytes.subarray(offset, end));
    offset = end;
    if (chunk === 'IEND') {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) throw new PhotoRejectedError('CORRUPT_IMAGE');
  return concat(kept);
}

// ---------------------------------------------------------------- WebP

const WEBP_DROP_CHUNKS = new Set(['EXIF', 'XMP ']);
const VP8X_FLAG_ANIMATION = 0x02;
const VP8X_FLAG_XMP = 0x04;
const VP8X_FLAG_EXIF = 0x08;

function stripWebp(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffEnd = 8 + view.getUint32(4, true);
  if (riffEnd > bytes.length || riffEnd < 12) throw new PhotoRejectedError('CORRUPT_IMAGE');
  const kept: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= riffEnd) {
    const chunk = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > riffEnd) throw new PhotoRejectedError('CORRUPT_IMAGE');
    if (chunk === 'ANIM' || chunk === 'ANMF') throw new PhotoRejectedError('ANIMATED_IMAGE');
    if (chunk === 'VP8X') {
      const copy = bytes.slice(offset, Math.min(end, riffEnd));
      if (copy.length < 9) throw new PhotoRejectedError('CORRUPT_IMAGE');
      if ((copy[8]! & VP8X_FLAG_ANIMATION) !== 0) throw new PhotoRejectedError('ANIMATED_IMAGE');
      copy[8] = copy[8]! & ~(VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
      kept.push(copy);
    } else if (!WEBP_DROP_CHUNKS.has(chunk)) {
      kept.push(bytes.subarray(offset, Math.min(end, riffEnd)));
    }
    offset = end;
  }
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return out;
}

// ---------------------------------------------------------------- yardımcılar

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
