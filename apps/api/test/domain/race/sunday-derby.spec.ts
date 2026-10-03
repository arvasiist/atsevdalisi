import { describe, expect, it } from 'vitest';
import { loadQuestsConfig, loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { computeCalendarSlotTimes } from '../../../src/domain/race/race-calendar';

/**
 * ÖZEL YARIŞ (02.10.2026, Faz 11) — haftalık Pazar Derbisi. Config ofseti
 * UTC epoch'una göredir (perşembe); bu test ofsetin GERÇEKTEN pazar 20:00
 * Türkiye saatine düştüğünü ve program ufkunun genel ufku ezdiğini kilitler.
 */
describe('Pazar Derbisi takvim programı', () => {
  const lobby = loadRaceLobbyConfig();
  const derby = lobby.calendar.programs.find((program) => program.id === 'sunday-derby')!;
  const tzMs = loadQuestsConfig().timezoneOffsetMinutes * 60_000;

  it('öne çıkan, kendi ufku genelden uzun', () => {
    expect(derby.featured).toBe(true);
    expect(derby.horizonHours).toBeGreaterThan(lobby.calendar.horizonHours);
  });

  it('her yuva pazar 20:00 (Türkiye saati) ve tam bir hafta arayla', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const slots = computeCalendarSlotTimes(now, derby, { ...lobby.calendar, horizonHours: 24 * 21 });
    expect(slots.length).toBeGreaterThanOrEqual(3);
    for (const slot of slots) {
      const local = new Date(slot.getTime() + tzMs);
      expect(local.getUTCDay()).toBe(0);
      expect(local.getUTCHours()).toBe(20);
      expect(local.getUTCMinutes()).toBe(0);
    }
    expect(slots[1]!.getTime() - slots[0]!.getTime()).toBe(7 * 24 * 3_600_000);
  });

  it('genel 3 saatlik ufukta açılmazdı, kendi 48 saatlik ufkunda açılır', () => {
    // Cumartesi 22:00 TR — derbiye 22 saat var.
    const now = new Date('2026-10-03T19:00:00Z');
    expect(computeCalendarSlotTimes(now, derby, lobby.calendar)).toEqual([]);
    expect(computeCalendarSlotTimes(now, derby, { ...lobby.calendar, horizonHours: derby.horizonHours! })).toHaveLength(1);
  });
});
