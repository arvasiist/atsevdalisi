import { Inject, Injectable } from '@nestjs/common';
import type { AdminTransactionListResult, AdminTransactionView } from '@at-sevdalisi/shared-types';
import { assertAdmin } from '../../domain/admin/moderation-queue';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { ADMIN_REPOSITORY, type AdminRepository } from '../ports/admin.repository';

/**
 * Ekonomi defteri. `GET /admin/transactions` (brief §34 "Admin: ...
 * Transactions ... Gifts ...", §42 PHASE 15-B).
 *
 * **AKIŞ `ListAdminReportsUseCase` İLE AYNIDIR:** yetki kapısı ÖNCE,
 * liste SONRA; limit config'ten.
 *
 * **BU EKRAN AYNI ZAMANDA "GIFTS"TIR.** Hediye ayrı bir defter değil,
 * `type = 'gift_send'` olan bir `economy_transactions` satırıdır
 * (migration 0034). Süzgeç İSTEMCİNİN işidir: sunucuda `type` süzgeci
 * açmak, `type`ın serbest metin olması yüzünden (migration 0019 notu —
 * yeni bir tür migration gerektirmez) sessizce EKSİK sonuç döndürürdü.
 * Denetim ekranında "eksik ama doğru görünen" bir liste, hiç liste
 * olmamasından kötüdür.
 *
 * **BU BİR YAZMA YOLU DEĞİLDİR.** Defter satırı buradan ÜRETİLMEZ;
 * `economy_transactions`a yalnızca para yolunun kendisi, kendi
 * transaction'ı içinde yazar (CLAUDE.md "PARA/MUTASYON YOLU"). Bu uca
 * bir "düzeltme" işlemi eklemek, defteri değiştirilebilir kılar ve
 * `balance_before`/`balance_after` zincirini koparırdı.
 */
@Injectable()
export class ListAdminTransactionsUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly adminRepository: AdminRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(adminId: string): Promise<AdminTransactionListResult> {
    assertAdmin(await this.adminRepository.isAdmin(adminId));

    const records = await this.adminRepository.listTransactions(
      this.config.admin.transactionListLimit,
    );

    return {
      transactions: records.map(
        (record): AdminTransactionView => ({
          transactionId: record.transactionId,
          player: { playerId: record.playerId, displayName: record.playerDisplayName },
          type: record.type,
          amount: record.amount,
          currency: record.currency,
          referenceType: record.referenceType,
          referenceId: record.referenceId,
          balanceBefore: record.balanceBefore,
          balanceAfter: record.balanceAfter,
          createdAt: record.createdAt.toISOString(),
        }),
      ),
    };
  }
}
