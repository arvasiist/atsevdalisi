import type { SchedulerLeaderService } from '../../src/infrastructure/scheduler/scheduler-leader';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScheduleRaceCalendarUseCase } from '../../src/application/use-cases/schedule-race-calendar.use-case';
import type { AppConfigService } from '../../src/infrastructure/config/config.service';
import { RaceCalendarScheduler } from '../../src/infrastructure/scheduler/race-calendar.scheduler';

/** `raceLobby.calendar.enabled` GERÇEKTEN okunur (ölü config kuralı). */

/** Tek örnek: lider kapısı her zaman açık (kapının kendisi `scheduler-leader.e2e-spec.ts`te). */
const alwaysLeader = { runIfLeader: <T>(work: () => Promise<T>) => work() } as unknown as SchedulerLeaderService;
function makeScheduler(enabled: boolean, nodeEnv: string): RaceCalendarScheduler {
  const config = {
    env: { nodeEnv },
    raceLobby: { calendar: { enabled, tickSeconds: 60 } },
  } as unknown as AppConfigService;
  const useCase = {
    execute: async () => ({ opened: [], cancelledEmpty: 0, rejected: 0 }),
  } as unknown as ScheduleRaceCalendarUseCase;
  return new RaceCalendarScheduler(alwaysLeader, useCase, config);
}

describe('RaceCalendarScheduler — config kararı', () => {
  const created: RaceCalendarScheduler[] = [];
  afterEach(() => {
    for (const scheduler of created.splice(0)) {
      scheduler.onModuleDestroy();
    }
  });

  it('enabled=true ve NODE_ENV≠test → kurulur', () => {
    const scheduler = makeScheduler(true, 'production');
    created.push(scheduler);
    scheduler.onModuleInit();
    expect(scheduler.isRunning()).toBe(true);
  });

  it('enabled=false → KURULMAZ', () => {
    const scheduler = makeScheduler(false, 'production');
    created.push(scheduler);
    scheduler.onModuleInit();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('NODE_ENV=test → KURULMAZ', () => {
    const scheduler = makeScheduler(true, 'test');
    created.push(scheduler);
    scheduler.onModuleInit();
    expect(scheduler.isRunning()).toBe(false);
  });
});
