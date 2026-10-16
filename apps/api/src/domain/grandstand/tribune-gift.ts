import type { TribuneGiftItemConfig, TribuneGiftsConfig } from '@at-sevdalisi/game-config';

/**
 * TRİBÜN HEDİYESİ (08.10.2026, migration 0075) — saf. Sahibinin isteği:
 * "tribündeki kişiler istedikleri at sahiplerine hediye gönderebilsinler".
 *
 * - Hediye config kataloğundan seçilir; istemci yalnızca ANAHTAR gönderir
 *   (fiyat ve pay sunucudadır — CLAUDE.md kural 1).
 * - Alıcı atı o yarışta KOŞTURAN oyuncudur (`race_entries.player_id`), atın
 *   şimdiki sahibi DEĞİL (CLAUDE.md (55)); botun sahibi yoktur.
 * - Gönderen fiyatı öder, alıcı `ownerSharePercent` payını alır (aşağı
 *   yuvarlanır); kalan oyun ekonomisinden çıkar.
 */

const PERCENT = 100;
const MS_PER_HOUR = 3_600_000;
const GIFT_KEY_PATTERN = /^[a-z0-9-]{2,32}$/;

/** Unicode karşılığı olmayan, istemcinin kendi çizdiği hediyeler. */
export const CLIENT_DRAWN_TRIBUNE_GIFTS: readonly string[] = ['horseshoe'];

export type TribuneGiftRejection = 'self' | 'no_owner' | 'horse_not_in_race' | 'race_closed';

const REJECTION_MESSAGES: Record<TribuneGiftRejection, string> = {
  self: 'Kendi atına tribün hediyesi gönderemezsin.',
  no_owner: 'Bu atın bir sahibi yok (yapay zekâ atı) — hediye gönderilemez.',
  horse_not_in_race: 'Bu at bu yarışta koşmuyor.',
  race_closed: 'Bu yarışa artık hediye gönderilemez.',
};

export class TribuneGiftNotAllowedError extends Error {
  constructor(public readonly reason: TribuneGiftRejection) {
    super(REJECTION_MESSAGES[reason]);
    this.name = 'TribuneGiftNotAllowedError';
  }
}

export class InvalidTribuneGiftError extends Error {
  constructor() {
    super('Geçersiz tribün hediyesi.');
    this.name = 'InvalidTribuneGiftError';
  }
}

export class TribuneGiftDailyLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Bugün en fazla ${limit} tribün hediyesi gönderebilirsin.`);
    this.name = 'TribuneGiftDailyLimitError';
  }
}

export function resolveTribuneGift(rawKey: unknown, config: Pick<TribuneGiftsConfig, 'items'>): TribuneGiftItemConfig | null {
  if (typeof rawKey !== 'string' || !GIFT_KEY_PATTERN.test(rawKey)) return null;
  return config.items.find((item) => item.key === rawKey) ?? null;
}

export function tribuneGiftOwnerShare(price: number, ownerSharePercent: number): number {
  return Math.floor((price * ownerSharePercent) / PERCENT);
}

/**
 * Hediye penceresi: iptal edilmemiş yarış, başlangıcından en fazla
 * `giftWindowHours` sonra (kayıt açıkken, koşu sırasında ve tekrar izlenirken).
 */
export function isRaceOpenForTribuneGifts(
  status: string,
  startTime: Date,
  now: Date,
  giftWindowHours: number,
): boolean {
  if (status === 'cancelled') return false;
  return now.getTime() <= startTime.getTime() + giftWindowHours * MS_PER_HOUR;
}

export function validateTribuneGiftsConfig(config: TribuneGiftsConfig): string[] {
  const problems: string[] = [];
  const integers: Array<[string, number]> = [
    ['dailyLimit', config.dailyLimit],
    ['giftWindowHours', config.giftWindowHours],
    ['recentLimit', config.recentLimit],
  ];
  for (const [name, value] of integers) {
    if (!Number.isInteger(value) || value < 1) problems.push(`tribuneGifts.${name} pozitif tam sayı olmalı.`);
  }
  if (!Number.isInteger(config.ownerSharePercent) || config.ownerSharePercent < 1 || config.ownerSharePercent > PERCENT) {
    problems.push('tribuneGifts.ownerSharePercent 1..100 olmalı.');
  }
  if (config.items.length === 0) problems.push('tribuneGifts.items boş olamaz.');
  const keys = new Set<string>();
  for (const item of config.items) {
    if (!GIFT_KEY_PATTERN.test(item.key) || keys.has(item.key)) problems.push(`Hediye anahtarı geçersiz/tekrarlı: ${item.key}.`);
    keys.add(item.key);
    if (!item.name) problems.push(`Hediye adı boş: ${item.key}.`);
    if (!item.emoji && !CLIENT_DRAWN_TRIBUNE_GIFTS.includes(item.key)) problems.push(`Hediye simgesi yok: ${item.key}.`);
    if (!Number.isInteger(item.price) || item.price < 1) problems.push(`Hediye fiyatı pozitif tam sayı olmalı: ${item.key}.`);
    // Pay sıfıra yuvarlanırsa alıcıya hiçbir şey gitmez (defter tutarı 0 olamaz).
    else if (tribuneGiftOwnerShare(item.price, config.ownerSharePercent) < 1) {
      problems.push(`Hediye fiyatı çok düşük (alıcı payı 0): ${item.key}.`);
    }
  }
  return problems;
}
