import { loadAvatarConfig } from '@at-sevdalisi/game-config';

/**
 * Profil fotoğrafı ön kontrolü (08.10.2026) — YALNIZCA kolaylık: sunucu
 * dosyanın baytlarından yeniden doğrular, meta veriyi siler ve karar verir.
 * Sınırlar koda gömülmez, sunucuyla AYNI config'ten okunur.
 */
export const PHOTO_RULES = loadAvatarConfig().photo;

export function photoPrecheckError(file: { size: number; type: string }): string | null {
  if (file.size === 0) return 'Dosya boş.';
  if (!PHOTO_RULES.acceptedTypes.includes(file.type)) return 'Yalnızca JPEG, PNG ya da WebP fotoğraf yükleyebilirsin.';
  if (file.size > PHOTO_RULES.maxUploadBytes) {
    return `Fotoğraf en fazla ${formatMegabytes(PHOTO_RULES.maxUploadBytes)} olabilir.`;
  }
  return null;
}

export function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}
