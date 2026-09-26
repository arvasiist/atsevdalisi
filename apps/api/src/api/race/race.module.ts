import { Module } from '@nestjs/common';
import { RACE_REPOSITORY } from '../../application/ports/race.repository';
import { GetHorseMarketValueUseCase } from '../../application/use-cases/get-horse-market-value.use-case';
import { GetRaceTimelineUseCase } from '../../application/use-cases/get-race-timeline.use-case';
import { GetRecentRaceResultsUseCase } from '../../application/use-cases/get-recent-race-results.use-case';
import { RunPracticeRaceUseCase } from '../../application/use-cases/run-practice-race.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PostgresRaceRepository } from '../../infrastructure/race/postgres-race.repository';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { HorseModule } from '../horse/horse.module';
import { MarketModule } from '../market/market.module';
import { PlayerModule } from '../player/player.module';
import { HorseMarketValueController } from './horse-market-value.controller';
import { RaceController } from './race.controller';
import { RaceTimelineController } from './race-timeline.controller';
import { RecentRacesController } from './recent-races.controller';

@Module({
  imports: [DatabaseModule, HorseModule, PlayerModule, MarketModule],
  controllers: [RaceController, RecentRacesController, RaceTimelineController, HorseMarketValueController],
  providers: [
    RunPracticeRaceUseCase,
    GetRecentRaceResultsUseCase,
    // AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — bkz. `get-race-timeline.use-case.ts` doc yorumu.
    GetRaceTimelineUseCase,
    // docs/AUDIT_REPORT.md "§25" bulgusu (bu oturum) — bkz.
    // `get-horse-market-value.use-case.ts` dosya başı doc yorumu (bu
    // use-case'in neden burada, `HorseModule`/`MarketModule`'de DEĞİL,
    // yaşadığının döngüsel-bağımlılık gerekçesi).
    GetHorseMarketValueUseCase,
    { provide: RACE_REPOSITORY, useClass: PostgresRaceRepository },
    // AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — bkz. `horse-owner.guard.ts` doc yorumu.
    HorseOwnerGuardByParam,
  ],
  // AUDIT_REPORT.md Bulgu F2 (bu oturum) — `GetRaceTimelineUseCase` artık
  // ayrıca `RealtimeModule`'ün `RaceGateway`'i tarafından da kullanılıyor
  // (canlı yarış WebSocket yayını, bkz. `api/realtime/race.gateway.ts` doc
  // yorumu) — aynı yetkilendirme mantığını (bkz. bu use-case'in kendi doc
  // yorumu) HTTP dışında bir yol için TEKRAR KULLANMAK amacıyla export
  // edildi, YENİDEN YAZILMADI.
  exports: [RunPracticeRaceUseCase, GetRaceTimelineUseCase, RACE_REPOSITORY],
})
export class RaceModule {}