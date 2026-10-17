import type {
  BreedingAttemptView,
  BreedingOfferStatus,
  BreedingOfferView,
  PregnancyRiskLevel,
  PregnancyView,
} from '@at-sevdalisi/shared-types';
import { formatCurrency } from '../../lib/currency';

/**
 * 16.10.2026 — çiftleştirme merkezi metinleri (brief §4–§5). Saf: sayıların
 * hepsi sunucudan gelir (olasılık, süre, ücret, iade); burada yalnızca
 * biçimlendirilir. Yön metne gömülmez — `direction` sunucudandır.
 */
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

export function formatChance(chance: number): string {
  return `%${Math.round(chance * 100)}`;
}

export function describeAttempt(attempt: BreedingAttemptView): { title: string; detail: string } {
  if (attempt.outcome === 'conceived' && attempt.pregnancy) {
    return {
      title: `Döllenme tuttu — ${attempt.pregnancy.mareName} gebe.`,
      detail: `Olasılık ${formatChance(attempt.conceptionChance)} idi. ${attempt.pregnancy.foalName} yaklaşık ${formatDateTr(
        attempt.pregnancy.expectedBirthAt,
      )} tarihinde doğacak; veteriner kontrolü ve beslenme doğum riskini düşürür.`,
    };
  }
  return {
    title: 'Döllenme bu sefer tutmadı.',
    detail: `Olasılık ${formatChance(attempt.conceptionChance)} idi. Kısrak ${
      attempt.mareRestEndsAt ? formatDateTimeTr(attempt.mareRestEndsAt) : 'bir süre'
    } sonrasına kadar dinlenecek.`,
  };
}

export const OFFER_STATUS_LABELS: Record<BreedingOfferStatus, string> = {
  pending: 'Yanıt bekliyor',
  accepted: 'Kabul edildi',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
  expired: 'Süresi doldu',
};

export function describeOfferOutcome(offer: BreedingOfferView): string {
  if (offer.status === 'pending') {
    return `Ücret emanette: ${formatCurrency('money', offer.fee)} · son yanıt ${formatDateTimeTr(offer.expiresAt)}`;
  }
  if (offer.status === 'accepted') {
    return offer.outcome === 'conceived'
      ? 'Döllenme tuttu — gebelik kısrak sahibinin merkezinde.'
      : `Döllenme tutmadı — ${formatCurrency('money', offer.refundedAmount)} iade edildi.`;
  }
  return `${formatCurrency('money', offer.refundedAmount)} kısrak sahibine iade edildi.`;
}

export const RISK_LABELS: Record<PregnancyRiskLevel, string> = {
  low: 'Düşük risk',
  medium: 'Orta risk',
  high: 'Yüksek risk',
};

/** Doğuma kalan süre (sunucunun verdiği tarihten; `now` yalnızca gösterim). */
export function remainingUntilBirth(pregnancy: Pick<PregnancyView, 'expectedBirthAt' | 'status'>, now: Date): string {
  if (pregnancy.status === 'born') return 'Doğdu';
  const ms = new Date(pregnancy.expectedBirthAt).getTime() - now.getTime();
  if (ms <= 0) return 'Doğum an meselesi';
  const days = Math.floor(ms / MS_PER_DAY);
  if (days >= 1) return `${days} gün kaldı`;
  return `${Math.max(1, Math.ceil(ms / MS_PER_HOUR))} saat kaldı`;
}

export function formatDateTr(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTimeTr(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
