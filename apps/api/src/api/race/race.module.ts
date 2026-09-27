import { Module } from '@nestjs/common';
import { LEADERBOARD_REPOSITORY } from '../../application/ports/leaderboard.repository';
import { RACE_REPOSITORY } from '../../application/ports/race.repository';
import { HORSE_EQUIPMENT_REPOSITORY } from '../../application/ports/horse-equipment.repository';
import { GetHorseMarketValueUseCase } from '../../application/use-cases/get-horse-market-value.use-case';
import { GetLeaderboardUseCase } from '../../application/use-cases/get-leaderboard.use-case';
import { GetRaceTimelineUseCase } from '../../application/use-cases/get-race-timeline.use-case';
import { GetRecentRaceResultsUseCase } from '../../application/use-cases/get-recent-race-results.use-case';
import { RunPracticeRaceUseCase } from '../../application/use-cases/run-practice-race.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PostgresLeaderboardRepository } from '../../infrastructure/leaderboard/postgres-leaderboard.repository';
import { PostgresRaceRepository } from '../../infrastructure/race/postgres-race.repository';
import { PostgresHorseEquipmentRepository } from '../../infrastructure/equipment/postgres-horse-equipment.repository';
import { HorseOwnerGuardByParam } from '../auth/horse-owner.guard';
import { GrandstandModule } from '../grandstand/grandstand.module';
import { HorseModule } from '../horse/horse.module';
import { LeaderboardController } from '../leaderboard/leaderboard.controller';
import { MarketModule } from '../market/market.module';
import { PlayerModule } from '../player/player.module';
import { HorseMarketValueController } from './horse-market-value.controller';
import { RaceController } from './race.controller';
import { RaceTimelineController } from './race-timeline.controller';
import { RecentRacesController } from './recent-races.controller';

@Module({
  // TRIBÜN (proje sahibinin açık talebi, 27.09.2026) — `GrandstandModule`
  // import edilir çünkü `GetRaceTimelineUseCase` artık `GRANDSTAND_REPOSITORY`
  // bağımlılığı taşıyor ("katılımcı VEYA bilet sahibi", bkz. o use-case'in
  // doc yorumu). `GrandstandModule` `RaceModule`'ü import ETMEZ → döngü YOK
  // (token'ı burada İKİNCİ kez kaydetmek yerine tek örneği paylaşmanın
  // gerekçesi `grandstand.module.ts` doc yorumunda).
  imports: [DatabaseModule, HorseModule, PlayerModule, MarketModule, GrandstandModule],
  controllers: [
    RaceController,
    RecentRacesController,
    RaceTimelineController,
    HorseMarketValueController,
    LeaderboardController,
  ],
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
    // brief §43 "Global sıralama" (bu turda EKLENDİ) — sıralama CANLI
    // hesaplanır; kalıcı `leaderboards` tablosu bilinçli olarak FAZ 7'ye
    // bırakılmıştır (bkz. `get-leaderboard.use-case.ts` doc yorumu).
    GetLeaderboardUseCase,
    { provide: RACE_REPOSITORY, useClass: PostgresRaceRepository },
    { provide: LEADERBOARD_REPOSITORY, useClass: PostgresLeaderboardRepository },
    // Ekipman (bu turda EKLENDİ) — `RunPracticeRaceUseCase`'in yeni bağımlılığı,
    // bkz. `equipment.module.ts` doc yorumundaki "token tekrarı" gerekçesi.
    { provide: HORSE_EQUIPMENT_REPOSITORY, useClass: PostgresHorseEquipmentRepository },
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