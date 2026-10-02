import { describe, expect, it } from 'vitest';
import type { RaceTimeline } from '@at-sevdalisi/shared-types';
import { loadInteractiveRaceConfig } from '@at-sevdalisi/game-config';
import { BoundedCache } from '../../src/application/services/bounded-cache';
import { LobbyLiveRaceUseCase } from '../../src/application/use-cases/lobby-live-race.use-case';
import type { LobbySettlementContext } from '../../src/application/ports/race.repository';

/**
 * CANLI GÖRÜNÜM SİMÜLASYON ÖNBELLEĞİ (02.10.2026). Sürücü ve tribün her
 * saniye yoklar; önbellek olmadan her yoklama yarışı baştan koşturuyordu.
 *
 * **KANITLANAN:** aynı komutlarla simülasyon BİR kez koşar; komut değişince
 * yeniden koşar (eski sonuç asla dönmez); tohum ya da dondurulmuş snapshot
 * yoksa önbellek kullanılmaz; boyut `liveRunCacheEntries`ten okunur (0 kapatır).
 */
const PLAYER = 'player-1';
const HORSE = '11111111-1111-4111-8111-111111111111';

function makeContext(overrides: Partial<LobbySettlementContext> = {}): LobbySettlementContext {
  return {
    raceId: 'race-1',
    raceName: 'Önbellek',
    status: 'locking',
    startTime: new Date(),
    joinedPlayers: 1,
    entryFee: 0,
    prizePool: 0,
    fieldSize: 8,
    maxPlayers: 8,
    surface: 'grass',
    weather: 'sunny',
    distanceMeters: 1600,
    temperatureC: null,
    windKmh: null,
    humidityPct: null,
    createdBy: null,
    createdAt: new Date(),
    simulationSeed: 'seed-1',
    playerControl: true,
    liveStartsAt: new Date(Date.now() - 1000),
    entrants: [
      {
        entryId: 'entry-1',
        playerId: PLAYER,
        horseId: HORSE,
        horseName: 'Kaplan',
        tacticalStyle: 'mid_pack',
        riskLevel: 'normal',
        gatePosition: 1,
        horseSnapshot: { horseId: HORSE } as never,
        jockeyId: null,
        playerCommands: {},
      },
    ],
    ...overrides,
  } as LobbySettlementContext;
}

const TIMELINE = {
  finalResult: [{ horseId: HORSE }],
  segments: [{ raceEntryId: HORSE, timestampMs: 10_000 }],
} as unknown as RaceTimeline;

function setup(context: { current: LobbySettlementContext }, cacheEntries?: number) {
  let simulations = 0;
  const config = loadInteractiveRaceConfig();
  const useCase = new LobbyLiveRaceUseCase(
    {
      findLobbySettlementContext: async () => context.current,
      findTournamentInfo: async () => null,
    } as never,
    {
      buildRun: async () => {
        simulations += 1;
        return { timeline: TIMELINE };
      },
    } as never,
    {
      interactiveRace: { ...config, liveRunCacheEntries: cacheEntries ?? config.liveRunCacheEntries },
      progression: { xpRewards: { player: {} } },
    } as never,
    {} as never,
  );
  return { useCase, simulations: () => simulations };
}

describe('Canlı görünüm simülasyon önbelleği', () => {
  it('aynı komutlarla tek simülasyon; komut değişince yeniden', async () => {
    const context = { current: makeContext() };
    const { useCase, simulations } = setup(context);
    await useCase.view(PLAYER, 'race-1');
    await useCase.view(PLAYER, 'race-1');
    await useCase.view(PLAYER, 'race-1');
    expect(simulations()).toBe(1);

    context.current = makeContext({
      entrants: [
        { ...context.current.entrants[0], playerCommands: { '2': { whips: 1, laneShift: 0, ease: false } } },
      ],
    });
    await useCase.view(PLAYER, 'race-1');
    expect(simulations()).toBe(2);
  });

  it('tohum ya da dondurulmuş snapshot yoksa önbellek kullanılmaz', async () => {
    const noSeed = { current: makeContext({ simulationSeed: null }) };
    const a = setup(noSeed);
    await a.useCase.view(PLAYER, 'race-1');
    await a.useCase.view(PLAYER, 'race-1');
    expect(a.simulations()).toBe(2);

    const unfrozen = makeContext();
    unfrozen.entrants = [{ ...unfrozen.entrants[0], horseSnapshot: null }];
    const b = setup({ current: unfrozen });
    await b.useCase.view(PLAYER, 'race-1');
    await b.useCase.view(PLAYER, 'race-1');
    expect(b.simulations()).toBe(2);
  });

  it("boyut config'ten: 0 önbelleği kapatır", async () => {
    expect(loadInteractiveRaceConfig().liveRunCacheEntries).toBeGreaterThan(0);
    const { useCase, simulations } = setup({ current: makeContext() }, 0);
    await useCase.view(PLAYER, 'race-1');
    await useCase.view(PLAYER, 'race-1');
    expect(simulations()).toBe(2);
  });

  it('BoundedCache en eski kullanılanı atar', () => {
    const cache = new BoundedCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // a artık en yeni
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });
});
