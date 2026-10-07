import type { AvatarJobStatus } from '@at-sevdalisi/shared-types';
import { InvalidAvatarJobTransitionError } from './errors';

/**
 * AVATAR ÜRETİM İŞİ DURUM MAKİNESİ (07.10.2026, brief §41/§45) — saf.
 *
 *   requested → analyzing → generating → processing → ready
 *        ↘──────────↘────────────↘───────────↘→ failed | cancelled
 *
 * `ready`/`failed`/`cancelled` çıkışsızdır. `processing`ten `cancelled`a
 * geçilmez: model indirilip doğrulanırken iptal, yarım bir avatar geçişi
 * bırakabilirdi — o adım kısa sürer ve kendi sonucuyla biter.
 */
const TRANSITIONS: Record<AvatarJobStatus, readonly AvatarJobStatus[]> = {
  requested: ['analyzing', 'failed', 'cancelled'],
  analyzing: ['generating', 'processing', 'failed', 'cancelled'],
  generating: ['processing', 'failed', 'cancelled'],
  processing: ['ready', 'failed'],
  ready: [],
  failed: [],
  cancelled: [],
};

export const ACTIVE_AVATAR_JOB_STATUSES: readonly AvatarJobStatus[] = ['requested', 'analyzing', 'generating', 'processing'];

export function isTerminalAvatarJob(status: AvatarJobStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function canTransitionAvatarJob(from: AvatarJobStatus, to: AvatarJobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertAvatarJobTransition(from: AvatarJobStatus, to: AvatarJobStatus): void {
  if (!canTransitionAvatarJob(from, to)) throw new InvalidAvatarJobTransitionError(from, to);
}

/**
 * Sağlayıcıdan gelen modelin GLB (glTF 2.0 ikili) olduğunu doğrular:
 * sihirli sayı `glTF`, sürüm 2, başlıktaki uzunluk = dosya uzunluğu, ilk
 * parça JSON. Bozuk/başka bir dosya oyuncunun avatarı YAPILMAZ.
 */
export function isValidGlb(bytes: Uint8Array, maxBytes: number): boolean {
  if (bytes.length < 20 || bytes.length > maxBytes) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const length = view.getUint32(8, true);
  const firstChunkType = view.getUint32(16, true);
  return magic === 0x46546c67 && version === 2 && length === bytes.length && firstChunkType === 0x4e4f534a;
}
