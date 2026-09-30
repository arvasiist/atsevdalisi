import { describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import type { RaceLobbyListItem } from '@at-sevdalisi/shared-types';
import {
  buildCreateRaceBody,
  defaultLobbyRaceForm,
  formatStartsIn,
  lobbyEntryActions,
  maxPlayersOptions,
  startDelayMinuteBounds,
} from '../../../src/features/race-lobby/lobby-logic';

/**
 * Lobi ekranının saf kuralları (30.09.2026). Seçenekler sunucuyla AYNI
 * config dosyasından okunur; burada sabitlenen şey, istemcinin sunucunun
 * `validateRaceCreation` kurallarıyla ÇELİŞMEMESİ ve düğme durumunun
 * yalnızca sunucudan gelen `myEntry`den türemesidir.
 */
const config = loadRaceLobbyConfig();

function race(overrides: Partial<RaceLobbyListItem> = {}): RaceLobbyListItem {
  return {
    id: 'race-1',
    name: 'Test',
    fieldSize: 12,
    maxPlayers: 8,
    joinedPlayers: 0,
    entryFee: 100,
    prizePool: 0,
    startTime: new Date().toISOString(),
    status: 'scheduled',
    raceType: 'paid',
    surface: 'grass',
    weather: 'sunny',
    distanceMeters: 1600,
    tribuneFee: 0,
    spectatorCapacity: 500,
    createdBy: null,
    createdAt: new Date().toISOString(),
    prizeMultiplier: null,
    myEntry: null,
    ...overrides,
  } as RaceLobbyListItem;
}

describe('maxPlayersOptions — sunucunun oyuncu tavanı kuralı', () => {
  it('alt sınır `minPlayers`, üst sınır min(fieldSize, maxPlayers)', () => {
    for (const fieldSize of config.fieldSizes) {
      const options = maxPlayersOptions(fieldSize, config);
      expect(options[0]).toBe(config.minPlayers);
      expect(options.at(-1)).toBe(Math.min(fieldSize, config.maxPlayers));
    }
  });
});

describe('buildCreateRaceBody', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');

  it('varsayılan form + geçerli ad → geçerli gövde; startTime = now + gecikme', () => {
    const form = { ...defaultLobbyRaceForm(config), name: 'Sabah Kupası' };
    const result = buildCreateRaceBody(form, now, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.raceType).toBe(form.entryFee > 0 ? 'paid' : 'free');
    const delayMs = new Date(result.body.startTime).getTime() - now.getTime();
    expect(delayMs / 1000).toBeGreaterThanOrEqual(config.startDelaySeconds.min);
  });

  it('ücret 0 ise tip `free` olur (sunucunun `races_race_type_matches_fee` kısıtı)', () => {
    const form = { ...defaultLobbyRaceForm(config), name: 'Bedava Kupa', entryFee: 0 };
    const result = buildCreateRaceBody(form, now, config);
    expect(result.ok && result.body.raceType).toBe('free');
  });

  it('kısa ad, geçersiz tavan, sınır dışı mesafe ve gecikme reddedilir', () => {
    const base = { ...defaultLobbyRaceForm(config), name: 'Geçerli Ad' };
    expect(buildCreateRaceBody({ ...base, name: 'ab' }, now, config).ok).toBe(false);
    expect(buildCreateRaceBody({ ...base, maxPlayers: config.minPlayers - 1 }, now, config).ok).toBe(false);
    expect(buildCreateRaceBody({ ...base, distanceMeters: config.distanceMeters.max + 1 }, now, config).ok).toBe(false);
    const bounds = startDelayMinuteBounds(config);
    expect(buildCreateRaceBody({ ...base, startDelayMinutes: bounds.min - 1 }, now, config).ok).toBe(false);
    expect(buildCreateRaceBody({ ...base, startDelayMinutes: bounds.max + 1 }, now, config).ok).toBe(false);
  });
});

describe('lobbyEntryActions — düğmeler YALNIZCA `myEntry`den türer', () => {
  it('katılım yok: yalnızca Katıl; dolu yarışta o da kapalı', () => {
    expect(lobbyEntryActions(race())).toEqual({ canJoin: true, canMarkReady: false, canMarkNotReady: false, canLeave: false });
    expect(lobbyEntryActions(race({ joinedPlayers: 8, maxPlayers: 8 })).canJoin).toBe(false);
  });

  it('waiting / not_ready: Hazırım + Ayrıl', () => {
    for (const status of ['waiting', 'not_ready'] as const) {
      expect(lobbyEntryActions(race({ myEntry: { status, horseId: 'h' } }))).toEqual({
        canJoin: false,
        canMarkReady: true,
        canMarkNotReady: false,
        canLeave: true,
      });
    }
  });

  it('ready: Hazır değilim + Ayrıl', () => {
    expect(lobbyEntryActions(race({ myEntry: { status: 'ready', horseId: 'h' } }))).toEqual({
      canJoin: false,
      canMarkReady: false,
      canMarkNotReady: true,
      canLeave: true,
    });
  });

  it('cancelled: hiçbir düğme — aynı yarışa yeniden katılınamaz', () => {
    expect(lobbyEntryActions(race({ myEntry: { status: 'cancelled', horseId: 'h' } }))).toEqual({
      canJoin: false,
      canMarkReady: false,
      canMarkNotReady: false,
      canLeave: false,
    });
  });
});

describe('formatStartsIn', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');
  it('dakika / saat+dakika / başlıyor', () => {
    expect(formatStartsIn('2026-09-30T12:12:30.000Z', now)).toBe('12 dk sonra');
    expect(formatStartsIn('2026-09-30T13:05:00.000Z', now)).toBe('1 sa 5 dk sonra');
    expect(formatStartsIn('2026-09-30T11:59:00.000Z', now)).toBe('başlıyor');
  });
});
