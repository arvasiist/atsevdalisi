import { Inject, Injectable } from '@nestjs/common';
import type { AdminHorseView, BalanceAdjustmentResult } from '@at-sevdalisi/shared-types';
import { loadModerationConfig } from '@at-sevdalisi/game-config';
import {
  assertAdjustmentTarget,
  assertStaffPermission,
  parseBalanceAdjustment,
  parseHorseQuery,
} from '../../domain/admin/staff';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { ADMIN_OPS_REPOSITORY, type AdminOpsRepository } from '../ports/admin-ops.repository';
import { MODERATION_REPOSITORY, type ModerationRepository } from '../ports/moderation.repository';

const config = loadModerationConfig();

/**
 * YÖNETİM İŞLEMLERİ (02.10.2026, Faz 10): bakiye düzeltmesi + at araması.
 * Yetki her çağrıda DB'den ve VERİ OKUMADAN ÖNCE (403 önce, 404 sonra).
 */
@Injectable()
export class AdminOpsUseCase {
  constructor(
    @Inject(ADMIN_OPS_REPOSITORY) private readonly repository: AdminOpsRepository,
    @Inject(MODERATION_REPOSITORY) private readonly moderation: ModerationRepository,
  ) {}

  async adjustBalance(
    actorId: string,
    playerId: string,
    raw: { currency?: unknown; amount?: unknown; reason?: unknown },
    idempotencyKey: string | null,
  ): Promise<BalanceAdjustmentResult> {
    assertStaffPermission(await this.moderation.findRole(actorId), 'economy.adjust');
    const draft = parseBalanceAdjustment(raw, config.economyAdjustment);
    assertAdjustmentTarget(actorId, playerId, await this.moderation.findRole(playerId));
    const result = await this.repository.adjustBalance({ actorId, playerId, ...draft, idempotencyKey });
    if (result === null) throw new PlayerNotFoundError(playerId);
    return result;
  }

  async searchHorses(actorId: string, rawQuery: unknown): Promise<AdminHorseView[]> {
    assertStaffPermission(await this.moderation.findRole(actorId), 'horses.view');
    const query = parseHorseQuery(rawQuery, config.horseSearch.queryMaxLength);
    if (query === null) return [];
    return this.repository.searchHorses(query, config.horseSearch.limit);
  }
}
