import { afterEach, describe, expect, it } from 'vitest';
import type { ScheduleTournamentsUseCase } from '../../src/application/use-cases/schedule-tournaments.use-case';
import type { AppConfigService } from '../../src/infrastructure/config/config.service';
import { TournamentScheduler } from '../../src/infrastructure/scheduler/tournament.scheduler';

/** `online.tournament.schedule.enabled` GERÇEKTEN okunur (ölü config kuralı). */
function makeScheduler(enabled: boolean, nodeEnv: string): TournamentScheduler {
  const config = {
    env: { nodeEnv },
    online: { tournament: { schedule: { enabled, tickSeconds: 60, registrationHours: 6 } } },
  } as unknown as AppConfigService;
  const useCase = { execute: async () => ({ opened: [], cancelledEmpty: 0 }) } as unknown as ScheduleTournamentsUseCase;
  return new TournamentScheduler(useCase, config);
}

describe('TournamentScheduler — config kararı', () => {
  const created: TournamentScheduler[] = [];
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
