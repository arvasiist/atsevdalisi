import { assertStaffPermission } from '../../domain/admin/staff';
import { MODERATION_REPOSITORY, type ModerationRepository } from '../ports/moderation.repository';
import { Inject, Injectable } from '@nestjs/common';
import type { AdminPlayerAccountView, AdminPlayerListResult } from '@at-sevdalisi/shared-types';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { ADMIN_REPOSITORY, type AdminRepository } from '../ports/admin.repository';

/**
 * Oyuncu listesi. `GET /admin/players` (brief §34 "Admin: Users ... Wallet
 * ... görebilmeli", §42 PHASE 15-B).
 *
 * **AKIŞ — SIRA `ListAdminReportsUseCase` İLE AYNIDIR:**
 *   1. `isAdmin` VERİTABANINDAN okunur (önbellek YOK).
 *   2. `assertAdmin` — değilse `AdminRequiredError` (403 `ADMIN_REQUIRED`).
 *      Bu kapı `listPlayerAccounts`'tan ÖNCEdir: aksi hâlde yetkisiz bir
 *      çağıran listeyi (ve dolayısıyla herkesin BAKİYESİNİ) görebilirdi.
 *   3. Liste — limit CONFIG'ten gelir (CLAUDE.md "SİHİRLİ SAYI YOK").
 *
 * **BU BİR PARA YOLU DEĞİLDİR.** Hiçbir şey yazılmaz, `economy_transactions`
 * geçmez, kilit alınmaz. Bu uç BAKİYE GÖSTERİR ama bakiye HAREKET ETTİRMEZ
 * — ikisini karıştırıp buraya bir yazma yolu eklemek, defterin tek işi olan
 * "her hareket bir satırdır" kuralını bozardı (bkz. `docs/ECONOMY.md`).
 *
 * **BU EKRAN AYNI ZAMANDA "WALLET"TIR.** Cüzdan ayrı bir varlık değil,
 * `players.money`/`players.gems` kolonlarıdır; ayrı bir uç nokta açmak
 * aynı satırları iki yanıttan sunmak ve ikisinin kaymasına izin vermek
 * olurdu (bkz. `AdminPlayerAccountView` doc yorumu).
 */
@Injectable()
export class ListAdminPlayersUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
    @Inject(MODERATION_REPOSITORY) private readonly moderationRepository: ModerationRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(adminId: string): Promise<AdminPlayerListResult> {
    // 02.10.2026 (Faz 10) — moderatör de yetkili; rol her çağrıda DB'den.
    assertStaffPermission(await this.moderationRepository.findRole(adminId), 'players.view');

    const records = await this.adminRepository.listPlayerAccounts(
      this.config.admin.playerListLimit,
    );

    return {
      players: records.map(
        (record): AdminPlayerAccountView => ({
          playerId: record.playerId,
          username: record.username,
          displayName: record.displayName,
          level: record.level,
          xp: record.xp,
          money: record.money,
          gems: record.gems,
          reputation: record.reputation,
          isAdmin: record.isAdmin,
          isModerator: record.isModerator,
          activeSanction:
            record.activeSanction === null
              ? null
              : {
                  id: record.activeSanction.id,
                  kind: record.activeSanction.kind,
                  expiresAt: record.activeSanction.expiresAt?.toISOString() ?? null,
                },
          createdAt: record.createdAt.toISOString(),
        }),
      ),
    };
  }
}
