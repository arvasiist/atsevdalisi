import { describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import type { RaceLobbyListItem } from '@at-sevdalisi/shared-types';
import { getRaceEntryBlocker } from '../../../src/features/race/race-entry';
import { loadEconomyConfig, loadRaceConfig } from '@at-sevdalisi/game-config';
import {
  LEVEL_BRACKET_OPTIONS,
  buildCreateRaceBody,
  defaultLobbyRaceForm,
  describeLevelBracket,
  horseFitsLevelBracket,
  QUICK_JOIN_CHOICES,
  describePrizeSplit,
  pickQuickJoinRace,
  pickQuickJoinRaces,
  raceFitForHorse,
  sortRacesForHorse,
} from '../../../src/features/race-lobby/lobby-logic';

/**
 * 08.10.2026 — "Hemen Katıl" + at seviyesine göre yarışlar (sahibinin
 * isteği). Kural sunucudadır; burada kilitlenen şey ekranın önerisinin
 * sunucu kuralıyla AYNI olması: giremeyeceği yarışı önermez, önce atın
 * seviyesine özel yarışı, sonra en yakın başlangıcı seçer.
 */
const NOW = new Date('2026-10-08T12:00:00Z');
const MIN_LEAD = 45_000;
const inMinutes = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const brackets = loadRaceLobbyConfig().horseLevelBrackets;
const rookie = brackets[0]!;
const master = brackets.find((bracket) => bracket.key === 'master')!;

function race(overrides: Partial<RaceLobbyListItem> = {}): RaceLobbyListItem {
  return {
    id: 'r',
    name: 'Test',
    fieldSize: 8,
    maxPlayers: 8,
    joinedPlayers: 0,
    entryFee: 50,
    prizePool: 0,
    startTime: inMinutes(10),
    status: 'scheduled',
    raceType: 'paid',
    surface: 'dirt',
    weather: 'sunny',
    distanceMeters: 1200,
    tribuneFee: 0,
    spectatorCapacity: 500,
    createdBy: null,
    createdAt: NOW.toISOString(),
    prizeMultiplier: null,
    myEntry: null,
    tournament: null,
    calendar: null,
    playerControl: false,
    breedClass: null,
    hippodrome: 'veliefendi',
    horseLevelBracket: null,
    ...overrides,
  } as RaceLobbyListItem;
}

const starter = { id: 'h1', breed: 'hinis', level: 1 };

describe('at seviyesi uygunluğu', () => {
  it('aralıksız yarış herkese; aralıklı yarış yalnızca aralıktaki ata; bilinmeyen aralık kapalı', () => {
    expect(horseFitsLevelBracket(null, 40)).toBe(true);
    expect(horseFitsLevelBracket(rookie.key, rookie.maxLevel)).toBe(true);
    expect(horseFitsLevelBracket(rookie.key, rookie.maxLevel + 1)).toBe(false);
    expect(horseFitsLevelBracket('uydurma', 1)).toBe(false);
  });

  it('uygunluk: ata özel aralık 0, açık yarış 1, giremez 2 (ırk ya da seviye)', () => {
    expect(raceFitForHorse(race({ horseLevelBracket: rookie.key }), starter)).toBe(0);
    expect(raceFitForHorse(race(), starter)).toBe(1);
    expect(raceFitForHorse(race({ horseLevelBracket: master.key }), starter)).toBe(2);
    expect(raceFitForHorse(race({ breedClass: 'thoroughbred' }), starter)).toBe(2);
  });

  it('liste ata göre sıralanır: uygun olan önce, eşitlikte sunucu sırası korunur', () => {
    const list = [
      race({ id: 'a', horseLevelBracket: master.key }),
      race({ id: 'b' }),
      race({ id: 'c', horseLevelBracket: rookie.key }),
      race({ id: 'd' }),
    ];
    expect(sortRacesForHorse(list, starter).map((item) => item.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(sortRacesForHorse(list, null).map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('rozet ve seçenekler config aralıklarından', () => {
    expect(describeLevelBracket(race({ horseLevelBracket: rookie.key }))).toContain(rookie.name);
    expect(describeLevelBracket(race())).toBeNull();
    expect(LEVEL_BRACKET_OPTIONS.map((option) => option.key)).toEqual(brackets.map((bracket) => bracket.key));
  });

  it('form aralığı gönderir; boşsa alan hiç gitmez', () => {
    const lobby = loadRaceLobbyConfig();
    const form = { ...defaultLobbyRaceForm(lobby), name: 'Çaylak Kupası' };
    const plain = buildCreateRaceBody(form, NOW, lobby);
    expect(plain.ok && 'horseLevelBracket' in plain.body).toBe(false);
    const bracketed = buildCreateRaceBody({ ...form, horseLevelBracket: rookie.key }, NOW, lobby);
    expect(bracketed.ok && bracketed.body.horseLevelBracket).toBe(rookie.key);
  });
});

describe('Hemen Katıl seçimi', () => {
  it('ata özel aralıklı yarışı açık yarışa tercih eder; sonra en yakın başlangıç', () => {
    const picked = pickQuickJoinRace(
      [
        race({ id: 'open-soon', startTime: inMinutes(3) }),
        race({ id: 'rookie-later', horseLevelBracket: rookie.key, startTime: inMinutes(20) }),
        race({ id: 'rookie-soon', horseLevelBracket: rookie.key, startTime: inMinutes(8) }),
      ],
      starter,
      5000,
      NOW,
      MIN_LEAD,
    );
    expect(picked?.id).toBe('rookie-soon');
  });

  it('giremeyeceği, dolu, parası yetmeyen, katıldığı ya da hemen başlayan yarışı önermez', () => {
    const picked = pickQuickJoinRace(
      [
        race({ id: 'master', horseLevelBracket: master.key }),
        race({ id: 'full', joinedPlayers: 8 }),
        race({ id: 'pricey', entryFee: 1000 }),
        race({ id: 'too-soon', startTime: new Date(NOW.getTime() + 20_000).toISOString() }),
        race({ id: 'thoroughbred', breedClass: 'thoroughbred' }),
        race({ id: 'ok', startTime: inMinutes(30) }),
      ],
      starter,
      500,
      NOW,
      MIN_LEAD,
    );
    expect(picked?.id).toBe('ok');
  });

  it('at zaten açık bir yarıştaysa öneri yok (sunucu HORSE_IN_ACTIVE_RACE verirdi)', () => {
    const picked = pickQuickJoinRace(
      [race({ id: 'joined', myEntry: { status: 'ready', horseId: 'h1' } }), race({ id: 'other' })],
      starter,
      5000,
      NOW,
      MIN_LEAD,
    );
    expect(picked).toBeNull();
    expect(pickQuickJoinRace([race()], null, 5000, NOW, MIN_LEAD)).toBeNull();
  });
});

describe('16.10.2026 — brief §7.1/§7.2: seçenekli Hemen Katıl + ödül kuralı', () => {
  it('birden çok uygun yarış varsa en fazla QUICK_JOIN_CHOICES seçenek, en uygunu başta (tek öneriyle aynı)', () => {
    const races = Array.from({ length: 6 }, (_, index) => race({ id: `r${index}`, startTime: inMinutes(10 + index) }));
    const choices = pickQuickJoinRaces(races, starter, 10_000, NOW, MIN_LEAD);
    expect(choices).toHaveLength(QUICK_JOIN_CHOICES);
    expect(choices.map((choice) => choice.id)).toEqual(['r0', 'r1', 'r2']);
    expect(pickQuickJoinRace(races, starter, 10_000, NOW, MIN_LEAD)?.id).toBe(choices[0]!.id);
    expect(pickQuickJoinRaces([race({ joinedPlayers: 8 })], starter, 10_000, NOW, MIN_LEAD)).toEqual([]);
  });

  it('atın kendisi yarışamıyorsa (yorgun/enerjisiz/tay) Hemen Katıl önce onu söyler — sunucunun sırası', () => {
    const { maxFatigue, minEnergy, minAgeMonths } = loadRaceConfig().readiness;
    const fit = { status: 'active' as const, health: 100, fatigue: 0, energy: 100, ageMonths: minAgeMonths };
    expect(getRaceEntryBlocker(fit)).toBeNull();
    expect(getRaceEntryBlocker({ ...fit, fatigue: maxFatigue + 1 })).toBe('HORSE_TOO_TIRED');
    expect(getRaceEntryBlocker({ ...fit, energy: minEnergy - 1 })).toBe('INSUFFICIENT_ENERGY');
    expect(getRaceEntryBlocker({ ...fit, ageMonths: minAgeMonths - 1, fatigue: maxFatigue + 1 })).toBe('HORSE_TOO_YOUNG');
  });

  it('masasız ücretli yarışta ödül dağılımı sunucunun config paylarından yazılır; masalı/ücretsiz/turnuvada yazılmaz', () => {
    const lobby = loadRaceLobbyConfig();
    const shares = loadEconomyConfig().prizeDistributions.find((item) => item.id === lobby.prizeDistributionId)!.shares;
    const text = describePrizeSplit(race())!;
    expect(text).toContain(`ilk ${shares.length} sıraya`);
    expect(text).toContain('komisyon %10');
    expect(describePrizeSplit(race({ entryFee: 0 }))).toBeNull();
    expect(describePrizeSplit(race({ tournament: { tier: 'bronze', minPlayerLevel: 1 } }))).toBeNull();
    expect(describePrizeSplit(race({ table: { id: 'local' } as never }))).toBeNull();
  });
});
