/**
 * 16.10.2026 — sosyal brief §7: arkadaş daveti + davet ödülü. Saf kurallar
 * (DB yok, rastgelelik dışarıdan verilir). Sorgular ve para yolu
 * `infrastructure/social/postgres-referral.repository.ts`te.
 */
import type { ReferralConfig } from '@at-sevdalisi/game-config';

/** Karışan karakterler yok (0/O, 1/I/L): kod elle de yazılabilsin. */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^[A-Z2-9]{6,16}$/;

/** Kod rastgele baytlardan üretilir (her bayt alfabeden bir harf seçer). */
export function referralCodeFromBytes(bytes: Uint8Array, length: number): string {
  if (bytes.length < length) throw new Error('Davet kodu için yeterli rastgele bayt yok.');
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += REFERRAL_CODE_ALPHABET[(bytes[index] ?? 0) % REFERRAL_CODE_ALPHABET.length];
  }
  return code;
}

/** Kullanıcı girdisini normalleştirir: boşluk/tire atılır, büyük harf; geçersizse `null`. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** Davetle gelen hesap kodu yalnızca açılıştan sonraki pencerede bağlayabilir. */
export function canAttachReferral(inviteeCreatedAt: Date, now: Date, attachWindowHours: number): boolean {
  return now.getTime() - inviteeCreatedAt.getTime() <= attachWindowHours * 3_600_000;
}

export interface ReferralProgressFacts {
  emailVerified: boolean;
  finishedRaces: number;
  inviteeDeleted: boolean;
  blockedBetween: boolean;
}

export interface ReferralQualification {
  qualified: boolean;
  emailVerified: boolean;
  finishedRaces: number;
  requiredRaces: number;
  emailRequired: boolean;
}

/** Ödül koşulları: e-posta doğrulaması (config'e göre) + bitmiş yarış sayısı; silinmiş/engelli çift asla. */
export function qualifyReferral(facts: ReferralProgressFacts, conditions: ReferralConfig['conditions']): ReferralQualification {
  const emailOk = !conditions.requireEmailVerified || facts.emailVerified;
  const racesOk = facts.finishedRaces >= conditions.minFinishedRaces;
  return {
    qualified: emailOk && racesOk && !facts.inviteeDeleted && !facts.blockedBetween,
    emailVerified: facts.emailVerified,
    finishedRaces: facts.finishedRaces,
    requiredRaces: conditions.minFinishedRaces,
    emailRequired: conditions.requireEmailVerified,
  };
}

/** Davet edenin bugün ve ömür boyu kalan ödül hakkı (ikisinden küçüğü). */
export function referralRewardAllowance(
  config: Pick<ReferralConfig, 'maxRewardedPerInviter' | 'maxRewardedPerInviterPerDay'>,
  rewardedLifetime: number,
  rewardedToday: number,
): number {
  return Math.max(
    0,
    Math.min(config.maxRewardedPerInviter - rewardedLifetime, config.maxRewardedPerInviterPerDay - rewardedToday),
  );
}

/** Açılışta: bozuk değerle API AÇILMAZ. */
export function validateReferralConfig(config: ReferralConfig): string[] {
  const problems: string[] = [];
  const positive = {
    codeLength: config.codeLength,
    attachWindowHours: config.attachWindowHours,
    maxRewardedPerInviter: config.maxRewardedPerInviter,
    maxRewardedPerInviterPerDay: config.maxRewardedPerInviterPerDay,
    historyLimit: config.historyLimit,
  };
  for (const [name, value] of Object.entries(positive)) {
    if (!Number.isInteger(value) || value <= 0) problems.push(`referral.${name} pozitif tam sayı olmalı (verilen: ${value}).`);
  }
  if (config.codeLength < 6 || config.codeLength > 16) problems.push('referral.codeLength 6..16 olmalı (DB CHECK ile aynı).');
  for (const [name, value] of Object.entries(config.rewards)) {
    if (!Number.isInteger(value) || value < 0) problems.push(`referral.rewards.${name} negatif olmayan tam sayı olmalı.`);
  }
  if (!Number.isInteger(config.conditions.minFinishedRaces) || config.conditions.minFinishedRaces < 1) {
    problems.push('referral.conditions.minFinishedRaces ≥ 1 olmalı (koşulsuz ödül sahte hesapla toplanırdı).');
  }
  if (config.maxRewardedPerInviterPerDay > config.maxRewardedPerInviter) {
    problems.push('referral.maxRewardedPerInviterPerDay ömür boyu tavandan büyük olamaz.');
  }
  return problems;
}
