import type { ReferralRowView } from '@at-sevdalisi/shared-types';

/**
 * 16.10.2026 — davet ekranının saf yardımcıları. Bağlantı istemcinin kendi
 * adresinden kurulur (`/?ref=KOD`); kod ve kurallar sunucudadır.
 */
export const REFERRAL_STORAGE_KEY = 'ats.referralCode';
const CODE_PATTERN = /^[A-Za-z2-9-]{6,20}$/;

export function referralLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`;
}

export function whatsappShareUrl(link: string): string {
  const text = `At Sevdalısı'nda kendi ahırını kur, benimle yarış! Davet bağlantım: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Adres çubuğundaki `?ref=` değerini okur; biçimsizse `null` (sunucu yine doğrular). */
export function referralCodeFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('ref');
  return value !== null && CODE_PATTERN.test(value) ? value : null;
}

export function describeReferralStatus(row: ReferralRowView): string {
  switch (row.status) {
    case 'rewarded':
      return 'Ödül alındı';
    case 'ready':
      return 'Ödül hazır';
    case 'capped':
      return 'Koşul tamam — günlük/toplam ödül sınırı doldu';
    case 'pending': {
      const missing: string[] = [];
      if (row.emailRequired && !row.emailVerified) missing.push('e-posta doğrulaması');
      if (row.finishedRaces < row.requiredRaces) missing.push(`${row.finishedRaces}/${row.requiredRaces} yarış`);
      return missing.length > 0 ? `Bekleniyor: ${missing.join(', ')}` : 'Bekleniyor';
    }
  }
}
