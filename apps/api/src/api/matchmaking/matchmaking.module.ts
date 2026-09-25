import { Module } from '@nestjs/common';
import { MATCHMAKING_TICKET_REPOSITORY } from '../../application/ports/matchmaking-ticket.repository';
import { HORSE_STATS_REPOSITORY } from '../../application/ports/horse-stats.repository';
import { RACE_REPOSITORY } from '../../application/ports/race.repository';
import { JoinMatchmakingQueueUseCase } from '../../application/use-cases/join-matchmaking-queue.use-case';
import { LeaveMatchmakingQueueUseCase } from '../../application/use-cases/leave-matchmaking-queue.use-case';
import { PostgresHorseStatsRepository } from '../../infrastructure/horse/postgres-horse-stats.repository';
import { PostgresMatchmakingTicketRepository } from '../../infrastructure/online/postgres-matchmaking-ticket.repository';
import { PostgresRaceRepository } from '../../infrastructure/race/postgres-race.repository';
import { HorseOwnerGuardByBodyField, HorseOwnerGuardByQueryField } from '../auth/horse-owner.guard';
import { HorseModule } from '../horse/horse.module';
import { PlayerModule } from '../player/player.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchmakingController } from './matchmaking.controller';

/**
 * FAZ 1 wiring, on dördüncü dilim — brief §41 PvP Eşleştirme. `HorseModule`/
 * `PlayerModule`'ü `MarketModule`/`RaceModule` ile AYNI gerekçeyle import
 * eder (`HORSE_REPOSITORY`/`PLAYER_REPOSITORY`). Kendi `MATCHMAKING_TICKET_
 * REPOSITORY`/`HORSE_STATS_REPOSITORY`/`RACE_REPOSITORY` bağlamalarını
 * `RaceModule` ile AYNI gerekçeyle KENDİSİ sağlar (hiçbir modül bunları
 * `exports` etmiyor).
 *
 * `lobby.update` (bu turda EKLENDİ) — `RealtimeModule`'ü SADECE onun
 * `exports` ettiği `LOBBY_NOTIFIER`'ı (bkz. o modülün doc yorumu) almak
 * için import eder; `RealtimeModule`'ün KENDİSİ `MatchmakingModule`'e
 * bağımlı DEĞİLDİR (`RaceModule`'e bağımlıdır), bu yüzden döngüsel bir
 * modül bağımlılığı OLUŞMAZ.
 */
@Module({
  imports: [HorseModule, PlayerModule, RealtimeModule],
  controllers: [MatchmakingController],
  providers: [
    JoinMatchmakingQueueUseCase,
    LeaveMatchmakingQueueUseCase,
    { provide: HORSE_STATS_REPOSITORY, useClass: PostgresHorseStatsRepository },
    { provide: RACE_REPOSITORY, useClass: PostgresRaceRepository },
    { provide: MATCHMAKING_TICKET_REPOSITORY, useClass: PostgresMatchmakingTicketRepository },
    // AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — bkz. `horse-owner.guard.ts` doc yorumu.
    HorseOwnerGuardByBodyField,
    HorseOwnerGuardByQueryField,
  ],
})
export class MatchmakingModule {}
