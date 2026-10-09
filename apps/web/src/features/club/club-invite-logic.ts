import type { ClubRole } from '@at-sevdalisi/shared-types';

/**
 * Kulüp daveti ekran yardımcıları (09.10.2026). Saf. Yetki kararı SUNUCUDADIR
 * (subay/lider); buradaki `canInviteToClub` yalnızca formu gösterip
 * göstermemeyi seçer — gizli form çağrılsa 403 alır.
 */

/** Sunucuyla AYNI normalleştirme: boşluk, baştaki "@" ve büyük harf atılır. */
export function normalizeInviteUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function canInviteToClub(role: ClubRole | null | undefined): boolean {
  return role === 'leader' || role === 'officer';
}

const MS_PER_HOUR = 60 * 60 * 1_000;
const HOURS_PER_DAY = 24;
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;

/**
 * "7 gün kaldı" / "5 saat kaldı" / "1 saatten az kaldı"; süresi geçmişse
 * "süresi doldu". Gün EN YAKIN tama yuvarlanır: yeni açılmış 7 günlük davet
 * (birkaç ms eksik) "6 gün" demesin.
 */
export function describeInviteExpiry(expiresAt: string, now: Date): string {
  const remainingMs = new Date(expiresAt).getTime() - now.getTime();
  if (!(remainingMs > 0)) return 'süresi doldu';
  if (remainingMs >= MS_PER_DAY) return `${Math.round(remainingMs / MS_PER_DAY)} gün kaldı`;
  const hours = Math.floor(remainingMs / MS_PER_HOUR);
  if (hours >= 1) return `${hours} saat kaldı`;
  return '1 saatten az kaldı';
}
