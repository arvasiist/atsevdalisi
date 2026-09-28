import { Module } from '@nestjs/common';
import { GRANDSTAND_REPOSITORY } from '../../application/ports/grandstand.repository';
import { ListMyTicketsUseCase } from '../../application/use-cases/list-my-tickets.use-case';
import { ListWatchableRacesUseCase } from '../../application/use-cases/list-watchable-races.use-case';
import { PurchaseRaceTicketUseCase } from '../../application/use-cases/purchase-race-ticket.use-case';
import { RefundRaceTicketUseCase } from '../../application/use-cases/refund-race-ticket.use-case';
import { PostgresGrandstandRepository } from '../../infrastructure/grandstand/postgres-grandstand.repository';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { PlayerModule } from '../player/player.module';
import { GrandstandController } from './grandstand.controller';
import { MyTicketsController } from './my-tickets.controller';

/**
 * Tribün modülü (proje sahibinin açık talebi, 27.09.2026).
 *
 * `PlayerModule` import edilir çünkü üç use-case de "oyuncu var mı" sorusunu
 * `PLAYER_REPOSITORY` ile sorar (o modül token'ı zaten `exports` ediyor).
 * `DatabaseModule` `@Global()` olduğundan `PG_POOL` burada ayrıca import
 * edilmez (`PlayerModule` doc yorumuyla AYNI not).
 *
 * **`GRANDSTAND_REPOSITORY` EXPORT edilir** — `RaceModule` bunu
 * `GetRaceTimelineUseCase` için import eder (bkz. aşağıdaki "neden export"
 * notu). `IdempotencyInterceptor` yalnızca bilet satın alma rotasında
 * kullanıldığından bu modülün provider'ıdır (`MarketModule` ile AYNI desen).
 *
 * **NEDEN EXPORT (neden `RaceModule`'de İKİNCİ bir kayıt DEĞİL):** Bu
 * kod tabanında aynı token'ın birden çok modülde kaydedildiği bir desen
 * VAR (`HORSE_EQUIPMENT_REPOSITORY`, `FEED_INVENTORY_REPOSITORY`) — ama o
 * kayıtlar bir modülün diğerini import ETMESİNİN döngüsel bağımlılık
 * yaratacağı durumlar içindi. Burada öyle bir engel YOK: `GrandstandModule`
 * yalnızca `PlayerModule`'ü import eder, `RaceModule`'ü ASLA — yani
 * `RaceModule → GrandstandModule` yönünde bir döngü oluşmaz. İkinci bir
 * örnek oluşturmak yerine tek örneği paylaşmak, ileride repository'ye
 * durum (ör. bir cache) eklenirse iki kopyanın AYRIŞMASI riskini de
 * ortadan kaldırır.
 */
@Module({
  imports: [PlayerModule],
  controllers: [GrandstandController, MyTicketsController],
  providers: [
    ListWatchableRacesUseCase,
    PurchaseRaceTicketUseCase,
    RefundRaceTicketUseCase,
    ListMyTicketsUseCase,
    IdempotencyInterceptor,
    { provide: GRANDSTAND_REPOSITORY, useClass: PostgresGrandstandRepository },
  ],
  exports: [GRANDSTAND_REPOSITORY],
})
export class GrandstandModule {}
