import { describe, expect, it } from 'vitest';
import {
  PhotoRejectedError,
  prepareProfilePhoto,
  readExifOrientation,
  stripImageMetadata,
} from '../../../src/domain/avatar/profile-photo';

/**
 * Profil fotoğrafı (08.10.2026): herkese açık görüntüden KONUM (EXIF GPS) ve
 * diğer meta veri silinir; yön bilgisi korunur; sona eklenmiş bayt atılır;
 * hareketli görüntü reddedilir. Örnek dosyalar burada bayt bayt kurulur.
 */
const RULES = { maxUploadBytes: 1_000_000, acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'], minDimension: 64, maxDimension: 4096 };
const enc = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const SECRET = 'GPS 41.0082N 28.9784E';

function segment(marker: number, body: number[]): number[] {
  return [0xff, marker, ...u16(body.length + 2), ...body];
}

/** EXIF APP1: Orientation + GPS sanılabilecek bir metin (küçük-endian TIFF). */
function exifApp1(orientation: number): number[] {
  const tiff = [
    ...enc('II'), 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    ...enc(SECRET),
  ];
  return segment(0xe1, [...enc('Exif'), 0, 0, ...tiff]);
}

function jpeg(options: { orientation?: number; trailing?: number[] } = {}): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    ...segment(0xe0, [...enc('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(options.orientation !== undefined ? exifApp1(options.orientation) : []),
    ...segment(0xed, enc(`Photoshop IPTC ${SECRET}`)),
    ...segment(0xfe, enc(`yorum ${SECRET}`)),
    ...segment(0xdb, [0, ...new Array(64).fill(1)]),
    ...segment(0xc0, [8, ...u16(200), ...u16(300), 1, 1, 0x11, 0]),
    ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
    0x12, 0x34, 0xff, 0x00, 0x56,
    0xff, 0xd9,
    ...(options.trailing ?? []),
  ]);
}

function pngChunk(type: string, data: number[]): number[] {
  return [...u32be(data.length), ...enc(type), ...data, 0, 0, 0, 0];
}

function png(extra: number[][] = [], trailing: number[] = []): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk('IHDR', [...u32be(256), ...u32be(128), 8, 6, 0, 0, 0]),
    ...extra.flat(),
    ...pngChunk('IDAT', [1, 2, 3, 4]),
    ...pngChunk('IEND', []),
    ...trailing,
  ]);
}

function webpChunk(type: string, data: number[]): number[] {
  return [...enc(type), ...u32le(data.length), ...data, ...(data.length % 2 ? [0] : [])];
}

function webp(flags: number, extra: number[][] = [], trailing: number[] = []): Uint8Array {
  // VP8X: bayrak + 3 ayrılmış bayt + (genişlik−1) ve (yükseklik−1), 24-bit küçük-endian (300×200).
  const vp8x = webpChunk('VP8X', [flags, 0, 0, 0, 0x2b, 0x01, 0x00, 0xc7, 0x00, 0x00]);
  const body = [...enc('WEBP'), ...vp8x, ...extra.flat(), ...webpChunk('VP8 ', [1, 2, 3])];
  return Uint8Array.from([...enc('RIFF'), ...u32le(body.length), ...body, ...trailing]);
}

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

describe('profil fotoğrafı — meta veri temizliği', () => {
  it('JPEG: EXIF/IPTC/yorum silinir, yön korunur, sona eklenen bayt atılır, boyut okunur', () => {
    const source = jpeg({ orientation: 6, trailing: enc('<script>gizli</script>') });
    expect(text(source)).toContain(SECRET);
    const prepared = prepareProfilePhoto(source, 'image/jpeg', RULES);
    expect(prepared.type).toBe('image/jpeg');
    expect(text(prepared.bytes)).not.toContain(SECRET);
    expect(text(prepared.bytes)).not.toContain('<script>');
    expect(text(prepared.bytes)).toContain('JFIF');
    expect({ width: prepared.width, height: prepared.height }).toEqual({ width: 300, height: 200 });
    // Yeni EXIF yalnızca Orientation taşır ve JFIF'in hemen ardındadır.
    const bytes = prepared.bytes;
    const app1 = text(bytes).indexOf('Exif');
    expect(app1).toBeGreaterThan(text(bytes).indexOf('JFIF'));
    expect(readExifOrientation(bytes.subarray(app1, app1 + 30))).toBe(6);
    expect(bytes[bytes.length - 2]).toBe(0xff);
    expect(bytes[bytes.length - 1]).toBe(0xd9);
  });

  it('JPEG: yön 1 (normal) ya da EXIF yoksa yeni EXIF YAZILMAZ', () => {
    for (const source of [jpeg({ orientation: 1 }), jpeg()]) {
      expect(text(stripImageMetadata(source, 'image/jpeg'))).not.toContain('Exif');
    }
  });

  it('PNG: metin/eXIf/zaman parçaları ve IEND sonrası silinir; APNG reddedilir', () => {
    const source = png(
      [pngChunk('tEXt', enc(`Comment\0${SECRET}`)), pngChunk('eXIf', enc(SECRET)), pngChunk('tIME', [7, 0xea, 10, 8, 1, 2, 3])],
      enc('PK-zip'),
    );
    const prepared = prepareProfilePhoto(source, 'image/png', RULES);
    expect(text(prepared.bytes)).not.toContain(SECRET);
    expect(text(prepared.bytes)).not.toContain('tIME');
    expect(text(prepared.bytes)).not.toContain('PK-zip');
    expect(text(prepared.bytes)).toContain('IDAT');
    expect({ width: prepared.width, height: prepared.height }).toEqual({ width: 256, height: 128 });

    const animated = png([pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0])]);
    expect(() => prepareProfilePhoto(animated, 'image/png', RULES)).toThrowError(PhotoRejectedError);
  });

  it('WebP: EXIF/XMP parçaları ve bayrakları silinir, RIFF boyu düzeltilir; hareketli reddedilir', () => {
    const source = webp(0x08 | 0x04 | 0x20, [webpChunk('EXIF', enc(SECRET)), webpChunk('XMP ', enc(SECRET))], enc('ek'));
    const prepared = prepareProfilePhoto(source, 'image/webp', RULES);
    expect({ width: prepared.width, height: prepared.height }).toEqual({ width: 300, height: 200 });
    const cleaned = prepared.bytes;
    expect(text(cleaned)).not.toContain(SECRET);
    expect(text(cleaned).endsWith('ek')).toBe(false);
    const view = new DataView(cleaned.buffer);
    expect(view.getUint32(4, true)).toBe(cleaned.length - 8);
    expect(cleaned[20]! & 0x0c).toBe(0); // EXIF + XMP bayrakları kalktı
    expect(cleaned[20]! & 0x20).toBe(0x20); // ICC bayrağı korundu

    const animated = webp(0x02);
    expect(() => stripImageMetadata(animated, 'image/webp')).toThrowError(PhotoRejectedError);
  });

  it('biçim kontrolü baytlardan; reddedilen fotoğraf PhotoRejectedError (nedenli) atar', () => {
    const cases: Array<[Uint8Array, string | undefined, string]> = [
      [new Uint8Array(), 'image/jpeg', 'EMPTY_FILE'],
      [Uint8Array.from(enc('GIF89a....')), 'image/gif', 'UNSUPPORTED_FORMAT'],
      [jpeg(), 'image/png', 'TYPE_MISMATCH'],
      [jpeg(), 'image/jpeg', 'IMAGE_TOO_SMALL'],
    ];
    for (const [bytes, declared, reason] of cases) {
      const rules = reason === 'IMAGE_TOO_SMALL' ? { ...RULES, minDimension: 512 } : RULES;
      try {
        prepareProfilePhoto(bytes, declared, rules);
        throw new Error(`beklenen hata yok: ${reason}`);
      } catch (error) {
        expect(error).toBeInstanceOf(PhotoRejectedError);
        expect((error as PhotoRejectedError).reason).toBe(reason);
      }
    }
  });

  it('kesik JPEG (EOI yok) bozuk sayılır', () => {
    const source = jpeg();
    expect(() => stripImageMetadata(source.subarray(0, source.length - 2), 'image/jpeg')).toThrowError(PhotoRejectedError);
  });
});
