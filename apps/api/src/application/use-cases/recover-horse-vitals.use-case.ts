import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_RECOVERY_REPOSITORY, type HorseRecoveryRepository } from '../ports/horse-recovery.repository';

/**
 * 15.10.2026 — ZAMANLA TOPARLANMA (S3). Yarış artık atın enerjisini yakıp
 * yorgunluk ekliyor; at `care.passiveRecovery` hızıyla kendiliğinden toparlanır.
 * Zamanlayıcı (`HorseRecoveryScheduler`) ve e2e (`tickNow`) bunu çağırır.
 */
@Injectable()
export class RecoverHorseVitalsUseCase {
  constructor(
    @Inject(HORSE_RECOVERY_REPOSITORY) private readonly repository: HorseRecoveryRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(now: Date): Promise<{ recovered: number }> {
    return { recovered: await this.repository.recoverDue(now, this.config.care, this.config.stable) };
  }
}
