import type { AccountDeletionBlocker } from '../../domain/account/account-deletion';

/**
 * HESAP SİLME (02.10.2026, migration 0059). Silme TEK transaction'dır:
 * engeller kilit altında yeniden denetlenir (ön kontrolden sonra açılan bir
 * teklif silmeyi yarıda bırakmasın), sonra kişisel veri silinir, oyuncu
 * anonimleşir, oturumlar kapanır.
 */
export interface AccountDeletionRepository {
  /** Ön kontrol (kilitsiz) — ekranın "neden silinemez" göstermesi için. */
  findBlockers(playerId: string): Promise<AccountDeletionBlocker[]>;
  /**
   * Engel varsa HİÇBİR ŞEY yazmadan engelleri döner; yoksa siler ve boş
   * dizi döner.
   */
  deleteAccount(input: {
    playerId: string;
    anonymousUsername: string;
    anonymousDisplayName: string;
    now: Date;
  }): Promise<AccountDeletionBlocker[]>;
}

export const ACCOUNT_DELETION_REPOSITORY = Symbol('ACCOUNT_DELETION_REPOSITORY');
