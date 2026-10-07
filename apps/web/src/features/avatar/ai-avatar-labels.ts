/**
 * AI AVATAR METİNLERİ (07.10.2026, Faz 8-B) — saf veri. Durum kümesi
 * sunucudaki `AVATAR_JOB_STATUSES` ile birebir (Record → eksik anahtar derleme hatası).
 */
import type { AvatarJobStatus } from '@at-sevdalisi/shared-types';

export const AVATAR_JOB_STATUS_LABELS: Record<AvatarJobStatus, string> = {
  requested: 'Sırada',
  analyzing: 'Fotoğraf inceleniyor',
  generating: 'Avatar oluşturuluyor',
  processing: 'Model hazırlanıyor',
  ready: 'Hazır',
  failed: 'Başarısız',
  cancelled: 'İptal edildi',
};

const ERROR_LABELS: Record<string, string> = {
  TIMEOUT: 'İşlem çok uzun sürdü.',
  INVALID_MODEL: 'Oluşan model doğrulanamadı.',
  SELFIE_MISSING: 'Fotoğraf bulunamadı.',
  FACE_NOT_FOUND: 'Fotoğrafta yüz bulunamadı.',
  MULTIPLE_FACES: 'Fotoğrafta birden fazla kişi var.',
  LOW_QUALITY: 'Fotoğraf yeterince net ya da aydınlık değil.',
};

/** Bilinmeyen kod genel bir metne düşer (sağlayıcı kodları ham gösterilmez). */
export function avatarJobErrorText(code: string | null): string {
  if (code === null) return '';
  return ERROR_LABELS[code] ?? 'Avatar oluşturulamadı; farklı bir fotoğrafla yeniden dene.';
}

export function isActiveAvatarJob(status: AvatarJobStatus): boolean {
  return status === 'requested' || status === 'analyzing' || status === 'generating' || status === 'processing';
}
