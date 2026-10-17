import { Module } from '@nestjs/common';
import { TRIBUNE_GIFT_REPOSITORY } from '../../application/ports/tribune-gift.repository';
import { TribuneGiftUseCase } from '../../application/use-cases/tribune-gift.use-case';
import { PostgresTribuneGiftRepository } from '../../infrastructure/grandstand/postgres-tribune-gift.repository';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RaceModule } from '../race/race.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TribuneGiftController, TribuneGiftInboxController } from './tribune-gift.controller';

/**
 * TRİBÜN HEDİYESİ (08.10.2026). `RaceModule` → izleme yetki kapısı
 * (`GetRaceTimelineUseCase.assertCanWatch`), `RealtimeModule` → yarış
 * odasına yayın (`TRIBUNE_GIFT_NOTIFIER`). Döngü YOK: ikisi de bu modülü
 * import etmez.
 */
@Module({
  imports: [RaceModule, RealtimeModule],
  controllers: [TribuneGiftController, TribuneGiftInboxController],
  providers: [
    TribuneGiftUseCase,
    IdempotencyInterceptor,
    { provide: TRIBUNE_GIFT_REPOSITORY, useClass: PostgresTribuneGiftRepository },
  ],
})
export class TribuneGiftModule {}
