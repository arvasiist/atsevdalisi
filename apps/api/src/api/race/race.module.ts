import { Module } from '@nestjs/common';
import { LEADERBOARD_REPOSITORY } from '../../application/ports/leaderboard.repository';
import { RACE_REPOSITORY } from '../../application/ports/race.repository';
import { HORSE_EQUIPMENT_REPOSITORY } from '../../application/ports/horse-equipment.repository';
import { CreateRaceUseCase } from '../../application/use-cases/create-race.use-case';
import { JoinRaceUseCase } from '../../application/use-cases/join-race.use-case';
import { LeaveRaceUseCase } from '../../application/use-cases/leave-race.use-case';
import { ListLobbyRacesUseCase } from '../../application/use-cases/list-lobby-races.use-case';
import { SetEntryReadyUseCase } from '../../application/use-cases/set-entry-ready.use-case';
import { SettleRaceUseCase } from '../../application/use-cases/settle-race.use-case';
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
import { RaceLobbyController } from './race-lobby.controller';
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
    // brief §1-§7, §42 PHASE 1 — oyuncunun kendi yarışını açması
    // (`POST /races`). `RaceTimelineController` ile AYNI `races` prefix'ini
    // paylaşır; tam yollar çakışmaz.
    RaceLobbyController,
    HorseMarketValueController,
    LeaderboardController,
  ],
  providers: [
    RunPracticeRaceUseCase,
    // brief §42 PHASE 1 — `CreateRaceUseCase` `RACE_REPOSITORY` (bu modülde
    // zaten kayıtlı) ve `AppConfigService` (`@Global()` `AppConfigModule`)
    // dışında hiçbir bağımlılık taşımaz; bu yüzden ek modül importu
    // GEREKMEZ.
    CreateRaceUseCase,
    // brief §42 PHASE 1b — ücretli yarışa KATILMA. `CreateRaceUseCase` ile
    // AYNI bağımlılık profili (`RACE_REPOSITORY`), ek modül importu
    // GEREKMEZ. `IdempotencyInterceptor` de ek bir provider değildir:
    // `@UseInterceptors` sınıfı doğrudan verir ve interceptor'ın kendi
    // bağımlılıkları (`REDIS_CLIENT`, `PG_POOL`, `AppConfigService`) kök
    // modülden çözülür (`grandstand.controller.ts` ile AYNI desen).
    JoinRaceUseCase,
    // brief §42 PHASE 3 — lobi listesi (`GET /races`). Bağımlılık profili
    // `CreateRaceUseCase` ile AYNIdır (`RACE_REPOSITORY` + `@Global()`
    // `AppConfigService`); ek modül importu GEREKMEZ.
    ListLobbyRacesUseCase,
    // brief §42 PHASE 3 — READY düğmesi (`POST /races/:id/ready`).
    // Yalnızca `RACE_REPOSITORY` taşır; `IdempotencyInterceptor` bilinçli
    // olarak YOKTUR (para yolu değildir, bkz. `SetEntryReadyUseCase`).
    SetEntryReadyUseCase,
    // brief §20 `REFUND`, §42 PHASE 4c — yarıştan ayrılma + giriş ücreti
    // iadesi (`POST /races/:id/leave`). Bağımlılık profili `JoinRaceUseCase`
    // ile AYNIdır (`RACE_REPOSITORY`); `IdempotencyInterceptor` burada da
    // ayrı bir provider DEĞİLDİR — `@UseInterceptors` sınıfı doğrudan verir
    // ve interceptor'ın kendi bağımlılıkları (`REDIS_CLIENT`, `PG_POOL`,
    // `AppConfigService`) kök modülden çözülür (`join` ile AYNI desen).
    LeaveRaceUseCase,
    // §42 PHASE 13.14 — ücretli lobi yarışını KOŞTURAN ve ödülleri
    // dağıtan use-case (`POST /races/:id/settle`). Bağımlılık profili
    // `RunPracticeRaceUseCase` ile AYNIdır (at + istatistik + ekipman +
    // `RACE_REPOSITORY`); hepsi bu modülde ya da `@Global()` modüllerde
    // (`DatabaseModule`/`AppConfigModule`) kayıtlıdır.
    SettleRaceUseCase,
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