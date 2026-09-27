import { Module } from '@nestjs/common';
import { CHAT_REPOSITORY } from '../../application/ports/chat.repository';
import { ListRaceMessagesUseCase } from '../../application/use-cases/list-race-messages.use-case';
import { SendRaceMessageUseCase } from '../../application/use-cases/send-race-message.use-case';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PostgresChatRepository } from '../../infrastructure/chat/postgres-chat.repository';

/**
 * Yarış sohbeti (brief §13, proje sahibinin açık talebi, 27.09.2026).
 *
 * **NEDEN AYRI MODÜL:** sohbetin TEK tüketicisi `RaceGateway`'dir ama
 * `RealtimeModule`'e doğrudan gömmek, "WebSocket taşıma katmanı" ile
 * "sohbet iş kuralları"nı aynı dosyada birleştirirdi. `GrandstandModule`
 * ile AYNI desen: modül yalnızca port + use-case'leri sağlar, DIŞARI
 * `exports` eder, hiçbir controller barındırmaz.
 *
 * `DatabaseModule` AÇIKÇA import edilir (`@Global()` olduğu hâlde) —
 * `GrandstandModule`/`RaceModule`'ün AYNI tercihi: `@Global()`'e güvenmek
 * modülün bağımlılığını dosyada GÖRÜNMEZ kılar; burada bağımlılık
 * okunabilir olmalıdır.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    SendRaceMessageUseCase,
    ListRaceMessagesUseCase,
    { provide: CHAT_REPOSITORY, useClass: PostgresChatRepository },
  ],
  exports: [SendRaceMessageUseCase, ListRaceMessagesUseCase],
})
export class ChatModule {}
