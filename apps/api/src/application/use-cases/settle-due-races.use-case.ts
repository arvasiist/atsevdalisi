import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { RACE_REPOSITORY, type RaceRepository } from '../ports/race.repository';
import { SettleRaceUseCase } from './settle-race.use-case';

export interface SettleDueRacesResult {
  settled: string[];
  skipped: { raceId: string; reason: string }[];
}

/**
 * OTOMATİK KESİNLEŞME (30.09.2026). `RaceLockScheduler` bir yarışı
 * `locking`e geçirdikten sonra ödülü dağıtan hiçbir iş yoktu:
 * `POST /races/:id/settle` bir "crank"ti ve onu çağıran istemci de yoktu.
 * Sonuç: kilitlenen yarışlar `locking`de kalıyor, giriş ücretleri havuzda
 * süresiz bekliyordu. Bu use-case o boşluğu kapatır; HTTP crank'i aynen
 * yaşamaya devam eder (ikisi de aynı `SettleRaceUseCase`i çağırır).
 *
 * **ÇİFT ÖDEME YAPISAL OLARAK İMKÂNSIZ:** tekrar koruması
 * `settleLobbyRace`in kilit altındaki `locking → finished` geçişidir; bir
 * crank ile zamanlayıcı aynı yarışa aynı anda gelirse ikincisi 409
 * `RACE_NOT_SETTLEABLE` alır ve burada `skipped`e düşer.
 *
 * **HATA YARIŞ BAŞINA YAKALANIR** (`LockRaceUseCase` ile AYNI): tek bir
 * bozuk yarış, sıradaki yarışların kesinleşmesini durdurmamalıdır.
 */
@Injectable()
export class SettleDueRacesUseCase {
  private readonly logger = new Logger(SettleDueRacesUseCase.name);

  constructor(
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(SettleRaceUseCase) private readonly settleRaceUseCase: SettleRaceUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(): Promise<SettleDueRacesResult> {
    const dueIds = await this.raceRepository.findRacesDueForSettle({
      limit: this.config.raceLobby.lockScheduler.batchSize,
    });
    const result: SettleDueRacesResult = { settled: [], skipped: [] };
    for (const raceId of dueIds) {
      try {
        await this.settleRaceUseCase.execute(raceId);
        result.settled.push(raceId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.skipped.push({ raceId, reason: message });
        this.logger.error(`Yarış ${raceId} kesinleştirilemedi: ${message}`);
      }
    }
    return result;
  }
}
