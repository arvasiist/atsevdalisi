import { Module } from '@nestjs/common';
import { LOBBY_NOTIFIER } from '../../application/ports/lobby-notifier';
import { RaceModule } from '../race/race.module';
import { RaceGateway } from './race.gateway';

/**
 * AUDIT_REPORT.md Bulgu F2 (bu oturum) — bkz. `race.gateway.ts` doc
 * yorumu. `RaceModule`'ü import eder (yalnızca `GetRaceTimelineUseCase`
 * için — `RaceModule`'ün diğer sağlayıcılarına/controller'larına
 * dokunulmaz). `TOKEN_SERVICE` `@Global()` `TokenModule`'den geldiğinden
 * (bkz. `app.module.ts`) burada AYRICA import edilmesine GEREK YOK.
 *
 * `lobby.update` (bu turda EKLENDİ) — `RaceGateway`, `LobbyNotifier`
 * portunu implemente eder (bkz. o dosyanın "`lobby.update`" doc bölümü).
 * `{ provide: LOBBY_NOTIFIER, useExisting: RaceGateway }`, `RaceGateway`'in
 * ZATEN sağlanmış TEK instance'ını AYRICA `LOBBY_NOTIFIER` token'ı
 * altında da erişilebilir kılar — `useClass` KULLANILMAZ, aksi halde
 * YENİ/AYRI bir `RaceGateway` instance'ı (kendi `raceSessions`/oda
 * durumu OLMAYAN) yaratılırdı. `exports`'a eklenir ki `MatchmakingModule`
 * bunu import edip `JoinMatchmakingQueueUseCase`'e enjekte edebilsin
 * (bkz. o modülün import listesi).
 */
@Module({
  imports: [RaceModule],
  providers: [RaceGateway, { provide: LOBBY_NOTIFIER, useExisting: RaceGateway }],
  exports: [LOBBY_NOTIFIER],
})
export class RealtimeModule {}
