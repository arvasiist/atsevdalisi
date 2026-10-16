import { describe, expect, it } from 'vitest';
import { loadQuestsConfig } from '@at-sevdalisi/game-config';
import { InvalidLiveEventError } from '../../../src/domain/quests/errors';
import {
  eventClaimableUntil,
  isEventVisible,
  parseLiveEvent,
  questWindow,
  resolveQuest,
  validateQuestConfig,
} from '../../../src/domain/quests/quests';

const config = loadQuestsConfig();
const istanbul = { timezoneOffsetMinutes: 180, weekStartsOn: 1 };

describe('görev dönem penceresi (Faz 11-B)', () => {
  it('gün Türkiye saatiyle gece yarısı başlar, UTC ile değil', () => {
    // 02.10 22:30 UTC = 03.10 01:30 İstanbul → gün 03.10'dur.
    const window = questWindow('daily', new Date('2026-10-02T22:30:00Z'), istanbul);
    expect(window.start.toISOString()).toBe('2026-10-02T21:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-10-03T21:00:00.000Z');
    // 02.10 20:59 UTC = 23:59 İstanbul → hâlâ 02.10.
    expect(questWindow('daily', new Date('2026-10-02T20:59:00Z'), istanbul).start.toISOString()).toBe(
      '2026-10-01T21:00:00.000Z',
    );
  });

  it('hafta pazartesi başlar; pazar gecesi hâlâ önceki haftadır', () => {
    // 04.10.2026 Pazar 23:00 İstanbul (20:00 UTC) → hafta 28.09 Pazartesi.
    const sunday = questWindow('weekly', new Date('2026-10-04T20:00:00Z'), istanbul);
    expect(sunday.start.toISOString()).toBe('2026-09-27T21:00:00.000Z');
    expect(sunday.end.getTime() - sunday.start.getTime()).toBe(7 * 24 * 3600 * 1000);
    // 05.10 Pazartesi 00:30 İstanbul → yeni hafta.
    expect(questWindow('weekly', new Date('2026-10-04T21:30:00Z'), istanbul).start.toISOString()).toBe(
      '2026-10-04T21:00:00.000Z',
    );
  });

  it('pencere sınırında sıçrama yok: her an tam bir pencerenin içindedir', () => {
    for (let hour = 0; hour < 24 * 8; hour += 1) {
      const now = new Date(Date.UTC(2026, 9, 1) + hour * 3_600_000 + 1);
      for (const period of ['daily', 'weekly'] as const) {
        const window = questWindow(period, now, istanbul);
        expect(window.start.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(window.end.getTime()).toBeGreaterThan(now.getTime());
      }
    }
  });
});

describe('görev config bütünlüğü', () => {
  it('gerçek config geçerli (tekil anahtar, bilinen ölçüt, pozitif hedef/ödül)', () => {
    expect(validateQuestConfig(config)).toEqual([]);
  });

  it('bozuk tanımlar yakalanır', () => {
    const problems = validateQuestConfig({
      ...config,
      daily: [
        { key: 'a-b-c', metric: 'uydurma', target: 0, rewardMoney: 10 },
        { key: 'a-b-c', metric: 'trainings', target: 1, rewardMoney: 0 },
      ],
      weekly: [],
    });
    expect(problems.join('|')).toMatch(/bilinmeyen ölçüt/);
    expect(problems.join('|')).toMatch(/tekrar/);
    expect(problems.join('|')).toMatch(/hedef/);
    expect(problems.join('|')).toMatch(/ödül/);
  });

  it('istemci anahtarı yalnızca config listesinde aranır', () => {
    const first = config.daily[0]!;
    expect(resolveQuest(first.key, config)?.definition.rewardMoney).toBe(first.rewardMoney);
    expect(resolveQuest('../../etc', config)).toBeNull();
    expect(resolveQuest('olmayan-gorev', config)).toBeNull();
    expect(resolveQuest(42, config)).toBeNull();
  });
});

describe('etkinlik girdisi', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const valid = { title: 'Hafta sonu kupası', metric: 'race_wins', target: 2, rewardMoney: 900, endsAt: '2026-10-04T12:00:00Z' };

  it('geçerli girdi; başlangıç verilmezse şimdi', () => {
    const draft = parseLiveEvent(valid, config.events, now);
    expect(draft.startsAt).toEqual(now);
    expect(draft.metric).toBe('race_wins');
  });

  it.each([
    [{ ...valid, title: '' }],
    [{ ...valid, metric: 'para_bas' }],
    [{ ...valid, target: 0 }],
    [{ ...valid, target: 1.5 }],
    [{ ...valid, rewardMoney: config.events.maxRewardMoney + 1 }],
    [{ ...valid, rewardMoney: '900' }],
    [{ ...valid, endsAt: undefined }],
    [{ ...valid, endsAt: '2026-10-01T00:00:00Z' }],
    [{ ...valid, endsAt: 'yarın' }],
    [{ ...valid, endsAt: '2027-01-01T00:00:00Z' }],
  ])('reddedilir: %j', (raw) => {
    expect(() => parseLiveEvent(raw as Record<string, unknown>, config.events, now)).toThrow(InvalidLiveEventError);
  });

  it('bitmiş etkinlik talep süresi boyunca görünür, sonra kaybolur; arşiv hemen gizler', () => {
    const event = { startsAt: new Date('2026-10-01T00:00:00Z'), endsAt: new Date('2026-10-02T00:00:00Z'), archivedAt: null };
    const until = eventClaimableUntil(event.endsAt, config.events);
    expect(isEventVisible(event, new Date(until.getTime() - 1), config.events)).toBe(true);
    expect(isEventVisible(event, until, config.events)).toBe(false);
    expect(isEventVisible({ ...event, archivedAt: now }, now, config.events)).toBe(false);
    expect(isEventVisible(event, new Date('2026-09-30T00:00:00Z'), config.events)).toBe(false);
  });
});
