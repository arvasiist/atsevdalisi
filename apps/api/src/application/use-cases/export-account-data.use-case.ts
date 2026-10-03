import { Inject, Injectable } from '@nestjs/common';
import type { AccountDataExport } from '@at-sevdalisi/shared-types';
import { loadAuthConfig } from '@at-sevdalisi/game-config';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { ACCOUNT_EXPORT_REPOSITORY, type AccountExportRepository } from '../ports/account-export.repository';

const config = loadAuthConfig().dataExport;

/**
 * KİŞİSEL VERİ DIŞA AKTARMA (02.10.2026, Faz 1 — KVKK md. 11 / GDPR md. 15, 20).
 * Yalnızca çağıranın KENDİ verisi; kimlik token'dan gelir.
 */
@Injectable()
export class ExportAccountDataUseCase {
  constructor(@Inject(ACCOUNT_EXPORT_REPOSITORY) private readonly repository: AccountExportRepository) {}

  async execute(playerId: string, now: Date = new Date()): Promise<AccountDataExport> {
    const sections = await this.repository.exportSections(playerId, config.maxRowsPerSection);
    if (sections === null) throw new PlayerNotFoundError(playerId);
    return { exportedAt: now.toISOString(), playerId, sections };
  }
}
