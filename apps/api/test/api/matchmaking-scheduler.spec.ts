import type { SchedulerLeaderService } from '../../src/infrastructure/scheduler/scheduler-leader';
import { afterEach, describe, expect, it } from 'vitest';
import type { JoinMatchmakingQueueUseCase } from '../../src/application/use-cases/join-matchmaking-queue.use-case';
import type { AppConfigService } from '../../src/infrastructure/config/config.service';
import { MatchmakingScheduler } from '../../src/infrastructure/scheduler/matchmaking.scheduler';

/**
 * `online.matchmaking.queueScan.enabled` GERÇEKTEN okunur (30.09.2026).
 * CLAUDE.md'nin ölü config kuralı: yeni bir config alanı, onu OKUYAN kod ve
 * onu DÜŞÜREN bir testle aynı dilimde gelir — `enabled=false` hiçbir şeyi
 * kapatmasaydı bu test kırmızıya döner.
 */

/** Tek örnek: lider kapısı her zaman açık (kapının kendisi `scheduler-leader.e2e-spec.ts`te). */
const alwaysLeader = { runIfLeader: <T>(work: () => Promise<T>) => work() } as unknown as SchedulerLeaderService;
function makeScheduler(enabled: boolean, nodeEnv: string): MatchmakingScheduler {
  const config = {
    env: { nodeEnv },
    online: { matchmaking: { queueScan: { enabled, tickSeconds: 60 } } },
  } as unknown as AppConfigService;
  const useCase = { scanQueue: async () => ({ matched: 0 }) } as unknown as JoinMatchmakingQueueUseCase;
  return new MatchmakingScheduler(alwaysLeader, useCase, config);
}

describe('MatchmakingScheduler — config kararı', () => {
  const created: MatchmakingScheduler[] = [];
  afterEach(() => {
    for (const scheduler of created.splice(0)) {
      scheduler.onModuleDestroy();
    }
  });

  it('enabled=true ve NODE_ENV≠test → zamanlayıcı kurulur', () => {
    const scheduler = makeScheduler(true, 'production');
    created.push(scheduler);
    scheduler.onModuleInit();
    expect(scheduler.isRunning()).toBe(true);
  });

  it('enabled=false → zamanlayıcı KURULMAZ', () => {
    const scheduler = makeScheduler(false, 'production');
    created.push(scheduler);
    scheduler.onModuleInit();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('NODE_ENV=test → zamanlayıcı KURULMAZ (testler tickNow çağırır)', () => {
    const scheduler = makeScheduler(true, 'test');
    created.push(scheduler);
    scheduler.onModuleInit();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('onModuleDestroy zamanlayıcıyı söker', () => {
    const scheduler = makeScheduler(true, 'production');
    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
    expect(scheduler.isRunning()).toBe(false);
  });
});
