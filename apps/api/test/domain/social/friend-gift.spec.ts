import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGiftConfig, loadQuestsConfig } from '@at-sevdalisi/game-config';
import { QUEST_METRICS } from '@at-sevdalisi/shared-types';
import {
  friendGiftDay,
  friendGiftDayStart,
  friendGiftExpiryCutoff,
  planFriendGiftSend,
  remainingCollects,
  validateFriendGiftConfig,
} from '../../../src/domain/social/friend-gift';

/**
 * DOSTLUK HEDİYESİ (08.10.2026, migration 0074) — saf kurallar + görev
 * ölçütü CHECK'inin `QUEST_METRICS` ile birebir olduğu (yeni ölçüt etkinlik
 * olarak açılırken çalışma anında reddedilmesin).
 */
const offset = loadQuestsConfig().timezoneOffsetMinutes;
const MIGRATIONS = join(__dirname, '../../../../../database/migrations');

describe('dostluk hediyesi — gün ve sınırlar', () => {
  it('oyun günü Türkiye saatiyle döner (UTC 21:00 = TR gece yarısı)', () => {
    expect(friendGiftDay(new Date('2026-10-08T20:59:00Z'), offset)).toBe('2026-10-08');
    expect(friendGiftDay(new Date('2026-10-08T21:00:00Z'), offset)).toBe('2026-10-09');
    expect(friendGiftDayStart(new Date('2026-10-08T20:59:00Z'), offset).toISOString()).toBe('2026-10-07T21:00:00.000Z');
    expect(friendGiftDayStart(new Date('2026-10-08T21:00:00Z'), offset).toISOString()).toBe('2026-10-08T21:00:00.000Z');
  });

  it('son kullanma ve kalan toplama hakkı', () => {
    expect(friendGiftExpiryCutoff(new Date('2026-10-08T12:00:00Z'), 7).toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(remainingCollects(0, 20)).toBe(20);
    expect(remainingCollects(19, 20)).toBe(1);
    expect(remainingCollects(25, 20)).toBe(0);
  });

  it('config geçerli; bozuk değerler yakalanır', () => {
    const config = loadGiftConfig().friendGift;
    expect(validateFriendGiftConfig(config)).toEqual([]);
    // "Çok cüzi" — tek hediye günlük görev ödülünden küçük kalmalı.
    expect(config.amount).toBeLessThanOrEqual(25);
    expect(validateFriendGiftConfig({ ...config, amount: 0 })).toHaveLength(1);
    expect(validateFriendGiftConfig({ ...config, dailyCollectLimit: 1.5, expiryDays: -1 })).toHaveLength(2);
    expect(validateFriendGiftConfig({ ...config, dailySendBudget: config.amount - 1 })).not.toEqual([]);
  });

  it('16.10.2026 — brief başlangıç dengesi: 2 çip, günlük 20 çip bütçe (10 arkadaş)', () => {
    const config = loadGiftConfig().friendGift;
    expect(config.amount).toBe(2);
    expect(config.dailySendBudget).toBe(20);
  });
});

describe('gönderen öder — gönderim planı (bütçe + bakiye)', () => {
  const base = { amount: 2, dailySendBudget: 20, spentToday: 0, balance: 1_000, candidates: 3 };

  it('bütçe ve bakiye yeterse herkese gider', () => {
    expect(planFriendGiftSend(base)).toEqual({ maxRecipients: 3, remainingBudget: 20, limitedBy: 'none' });
  });

  it('bütçe sınırlar: 20 çip / 2 = en çok 10 kişi; harcanan düşülür', () => {
    expect(planFriendGiftSend({ ...base, candidates: 15 })).toMatchObject({ maxRecipients: 10, limitedBy: 'budget' });
    expect(planFriendGiftSend({ ...base, spentToday: 18 })).toMatchObject({ maxRecipients: 1, remainingBudget: 2, limitedBy: 'budget' });
    expect(planFriendGiftSend({ ...base, spentToday: 20 })).toMatchObject({ maxRecipients: 0, remainingBudget: 0 });
    expect(planFriendGiftSend({ ...base, spentToday: 25 }).remainingBudget).toBe(0);
  });

  it('bakiye sınırlar; eksi bakiye hiçbir şey göndermez', () => {
    expect(planFriendGiftSend({ ...base, balance: 3 })).toEqual({ maxRecipients: 1, remainingBudget: 20, limitedBy: 'funds' });
    expect(planFriendGiftSend({ ...base, balance: -5 }).maxRecipients).toBe(0);
  });
});

describe('görev ölçütü CHECK kısıtı', () => {
  it('live_events metric CHECK\'ini yazan EN SON migration QUEST_METRICS ile birebir', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith('.up.sql'))
      .sort()
      .filter((file) => /live_events[\s\S]*metric[\s\S]*CHECK|CHECK \(metric IN/.test(readFileSync(join(MIGRATIONS, file), 'utf8')));
    const latest = readFileSync(join(MIGRATIONS, files.at(-1)!), 'utf8');
    const listed = [...latest.matchAll(/metric IN \(([^)]*)\)/g)].at(-1)![1]!;
    const keys = [...listed.matchAll(/'([a-z_0-9]+)'/g)].map((match) => match[1]);
    expect([...keys].sort()).toEqual([...QUEST_METRICS].sort());
  });
});
