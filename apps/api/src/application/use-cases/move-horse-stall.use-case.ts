import { Inject, Injectable } from '@nestjs/common';
import type { StableLayoutView } from '@at-sevdalisi/shared-types';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { STABLE_LAYOUT_REPOSITORY, type StableLayoutRepository } from '../ports/stable-layout.repository';

/**
 * AHIR DÜZENİ (16.10.2026) — atı başka bir bölmeye taşır; bölme doluysa iki
 * at yer değiştirir. Para hareketi YOK. Kilitli bölme 409 `STALL_LOCKED`,
 * başkasının atı 404. Kural `domain/stable/layout.ts`'te.
 */
@Injectable()
export class MoveHorseStallUseCase {
  constructor(
    @Inject(STABLE_LAYOUT_REPOSITORY) private readonly layoutRepository: StableLayoutRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  execute(playerId: string, horseId: string, stallNumber: unknown): Promise<StableLayoutView> {
    return this.layoutRepository.moveHorse(playerId, horseId, stallNumber, this.config.stable);
  }
}
