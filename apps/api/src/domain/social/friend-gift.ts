import type { FriendGiftConfig } from '@at-sevdalisi/game-config';

/**
 * DOSTLUK HEDİYESİ (08.10.2026, migration 0074) — saf. Sahibinin isteği:
 * "arkadaşlar birbirlerine tek tuşla bütün listesindekilere çok cüzi bir çip
 * hediye edebilsin ve toplayabilsin".
 *
 * - Gönderen HİÇBİR ŞEY ödemez; hediye oyunun verdiği küçük bir çiptir.
 * - Aynı kişiye oyun gününde (Türkiye saati, `quests.timezoneOffsetMinutes`)
 *   bir hediye — gün anahtarı `friendGiftDay`.
 * - Alıcı günde en fazla `dailyCollectLimit` hediye toplar; kalan yarına
 *   bekler. `expiryDays`tan eski hediye toplanamaz (süresiz birikip tek
 *   seferde büyük çip basılmasın).
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const ISO_DATE_LENGTH = 10;

/** Oyun gününün anahtarı (`YYYY-MM-DD`, oyun saat diliminde). */
export function friendGiftDay(now: Date, timezoneOffsetMinutes: number): string {
  return new Date(now.getTime() + timezoneOffsetMinutes * MS_PER_MINUTE).toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Oyun gününün başlangıcı (UTC anı) — "bugün toplananlar" bu andan sayılır. */
export function friendGiftDayStart(now: Date, timezoneOffsetMinutes: number): Date {
  const offsetMs = timezoneOffsetMinutes * MS_PER_MINUTE;
  const localDayStart = Math.floor((now.getTime() + offsetMs) / MS_PER_DAY) * MS_PER_DAY;
  return new Date(localDayStart - offsetMs);
}

/** Bu andan eski hediyeler toplanamaz. */
export function friendGiftExpiryCutoff(now: Date, expiryDays: number): Date {
  return new Date(now.getTime() - expiryDays * MS_PER_DAY);
}

export function remainingCollects(collectedToday: number, dailyCollectLimit: number): number {
  return Math.max(0, dailyCollectLimit - collectedToday);
}

/**
 * 16.10.2026 (brief §6.3–6.4) — GÖNDEREN ÖDER. Bu basışta kaç arkadaşa hediye
 * gidebilir: kalan günlük bütçe ve bakiye ikisi birden sınırlar. `limitedBy`
 * ekrana ve sonuca "neden herkese gitmedi" bilgisini taşır. Saf; repository
 * aynı fonksiyonu gönderenin satırı KİLİTLİYKEN çağırır.
 */
export interface FriendGiftSendPlan {
  maxRecipients: number;
  remainingBudget: number;
  limitedBy: 'none' | 'budget' | 'funds';
}

export function planFriendGiftSend(input: {
  amount: number;
  dailySendBudget: number;
  spentToday: number;
  balance: number;
  candidates: number;
}): FriendGiftSendPlan {
  const remainingBudget = Math.max(0, input.dailySendBudget - input.spentToday);
  const byBudget = Math.floor(remainingBudget / input.amount);
  const byFunds = Math.floor(Math.max(0, input.balance) / input.amount);
  const maxRecipients = Math.min(input.candidates, byBudget, byFunds);
  const limitedBy =
    maxRecipients >= input.candidates ? 'none' : byBudget <= byFunds ? 'budget' : 'funds';
  return { maxRecipients, remainingBudget, limitedBy };
}

export function validateFriendGiftConfig(config: FriendGiftConfig): string[] {
  const problems: string[] = [];
  const positive: Array<[string, number]> = [
    ['amount', config.amount],
    ['dailySendBudget', config.dailySendBudget],
    ['dailyCollectLimit', config.dailyCollectLimit],
    ['expiryDays', config.expiryDays],
    ['pendingListLimit', config.pendingListLimit],
  ];
  for (const [name, value] of positive) {
    if (!Number.isInteger(value) || value < 1) problems.push(`friendGift.${name} pozitif tam sayı olmalı.`);
  }
  if (problems.length === 0 && config.dailySendBudget < config.amount) {
    problems.push('friendGift.dailySendBudget en az bir hediye tutarı (amount) olmalı.');
  }
  return problems;
}
