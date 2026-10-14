import { describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { LockRaceUseCase } from '../../src/application/use-cases/lock-race.use-case';
import type { RaceRepository } from '../../src/application/ports/race.repository';
import type { EntrantSnapshotBuilder } from '../../src/application/services/entrant-snapshot.builder';
import type { AppConfigService } from '../../src/infrastructure/config/config.service';

/**
 * 14.10.2026 — kilitlenirken HATA veren yarış kuyruğu tıkamaz.
 *
 * Aday sorgusu en eski `batchSize` yarışı alır. Eskiden hata veren yarış her
 * 5 saniyede bir yeniden deneniyordu; bu tür yarışlar `batchSize` kadar
 * birikince arkadaki sağlıklı yarışlar HİÇ kilitlenmezdi (ödeme yapılmış
 * yarışlar `scheduled`da beklerdi). Artık hata veren yarış artan bir süre
 * (`lockScheduler.failureBackoffSeconds`) aday listesinden çıkarılır.
 */
const BACKOFF = loadRaceLobbyConfig().lockScheduler.failureBackoffSeconds;

function makeUseCase(broken: Set<string>, order: string[], batchSize: number) {
  const excludedPerTick: string[][] = [];
  const repository = {
    cancelEmptyDuePlayerRaces: async () => 0,
    findRacesDueForLock: async (input: { limit: number; excludeIds?: readonly string[] }) => {
      const excluded = [...(input.excludeIds ?? [])];
      excludedPerTick.push(excluded);
      return order.filter((id) => !excluded.includes(id)).slice(0, input.limit);
    },
    findTournamentInfo: async () => null,
    dropUnreadyLobbyEntries: async () => ({ raceCancelled: false }),
    findLobbySettlementContext: async (raceId: string) => {
      if (broken.has(raceId)) {
        throw new Error(`bozuk katılım: ${raceId}`);
      }
      // Sağlıklı ama bu testte bağlamı olmayan yarış: hata DEĞİL, atlama.
      return null;
    },
  } as unknown as RaceRepository;
  const config = {
    raceLobby: { lockScheduler: { batchSize, failureBackoffSeconds: BACKOFF } },
  } as unknown as AppConfigService;
  const useCase = new LockRaceUseCase(repository, {} as EntrantSnapshotBuilder, config);
  return { useCase, excludedPerTick };
}

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 14, 12, 0, 0) + seconds * 1_000);

describe('LockRaceUseCase — hata veren yarış için bekleme süresi', () => {
  it('config geçerli: başlangıç pozitif, tavan başlangıçtan küçük değil', () => {
    expect(BACKOFF.initial).toBeGreaterThan(0);
    expect(BACKOFF.max).toBeGreaterThanOrEqual(BACKOFF.initial);
  });

  it('kuyruğun başını tutan bozuk yarışlar sağlıklı yarışı ENGELLEMEZ', async () => {
    const { useCase } = makeUseCase(new Set(['bozuk-1', 'bozuk-2']), ['bozuk-1', 'bozuk-2', 'saglam'], 2);

    const first = await useCase.execute(at(0));
    expect(first.skipped.map((s) => s.raceId)).toEqual(['bozuk-1', 'bozuk-2']);

    // Bir sonraki tur: bozuklar bekleme süresinde, sağlam yarış artık işlenir.
    const second = await useCase.execute(at(5));
    expect(second.skipped).toEqual([{ raceId: 'saglam', reason: 'RACE_NOT_FOUND' }]);
  });

  it('bekleme süresi her hatada iki katına çıkar ve `max`ta durur', async () => {
    const { useCase, excludedPerTick } = makeUseCase(new Set(['bozuk']), ['bozuk'], 5);
    let clock = 0;
    let expectedWait = BACKOFF.initial;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await useCase.execute(at(clock));
      expect(result.skipped.map((s) => s.raceId)).toEqual(['bozuk']);
      // Süre dolmadan hemen önce denenmez…
      const early = await useCase.execute(at(clock + expectedWait - 1));
      expect(early.skipped).toEqual([]);
      expect(excludedPerTick.at(-1)).toEqual(['bozuk']);
      // …süre dolunca yeniden denenir.
      clock += expectedWait;
      expectedWait = Math.min(BACKOFF.max, expectedWait * 2);
    }
    expect(expectedWait).toBe(BACKOFF.max);
  });

  it('düzelen yarışın bekleme durumu silinir (sonraki turda hemen aday olur)', async () => {
    const broken = new Set(['gecici']);
    const { useCase, excludedPerTick } = makeUseCase(broken, ['gecici'], 5);

    await useCase.execute(at(0));
    broken.delete('gecici');
    const retried = await useCase.execute(at(BACKOFF.initial));
    expect(retried.skipped).toEqual([{ raceId: 'gecici', reason: 'RACE_NOT_FOUND' }]);

    await useCase.execute(at(BACKOFF.initial + 1));
    expect(excludedPerTick.at(-1)).toEqual([]);
  });
});
