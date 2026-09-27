import type { Facility, FacilityType, Player } from '@at-sevdalisi/shared-types';
import type { EconomyLedgerEntryInput } from './economy-ledger';

/**
 * `FacilityRepository` — Çiftlik tesislerinin (brief §32) Infrastructure'a
 * bağlandığı PORT. Bkz. `player.repository.ts`'in dosya başı doc yorumu:
 * Application bu interface'i KULLANIR ama İMPLEMENTE ETMEZ.
 *
 * NEDEN AYRI BİR REPOSITORY (neden `PlayerRepository`'ye eklenmedi):
 * tesisler `facilities` tablosunda yaşar, oyuncunun parası ise `players`
 * satırında. İkisi AYNI transaction içinde değişmek ZORUNDADIR
 * (docs/SECURITY.md §5) — bu yüzden kilitleme + iki tabloyu yazma işi TEK
 * bir metotta, TEK bir portta toplanır. `PlayerRepository`'ye bir
 * `facilityUpdate` alanı eklemek, oyuncu portuna çiftlik kavramını
 * sızdırırdı (katman/domain ayrımı bozulurdu).
 */
export interface FacilityRepository {
  /**
   * Oyuncunun İNŞA EDİLMİŞ tesisleri. `level: 0` (inşa edilmemiş) tesisler
   * burada BİR SATIR OLARAK BULUNMAZ — `facilities.level` kolonu
   * `CHECK (level >= 1)` ile korunur. Çağıran (`GetFarmSummaryUseCase`)
   * eksik tipleri `level: 0` kabul eder ve yedi tesisin TAMAMINI gösterir.
   */
  findByOwnerId(ownerId: string): Promise<Facility[]>;

  /**
   * Bir tesisi bir sonraki seviyeye çıkarır (level 0 → 1 dahil, yani İLK
   * inşa da bu metottan geçer) ve oyuncunun parasını AYNI transaction'da
   * düşer.
   *
   * KİLİT SIRASI: önce `players` satırı `SELECT ... FOR UPDATE` ile
   * kilitlenir, SONRA `facilities` satırı okunur. Bu sıra ZORUNLUDUR —
   * `players` kilidi aynı oyuncunun TÜM para işlemlerini serileştirdiği
   * için, alttaki tesis okuması her zaman COMMIT EDİLMİŞ güncel durumu
   * görür ve iki eşzamanlı "inşa et" isteği aynı tesisi iki kez inşa
   * edemez (`UNIQUE (owner_id, type)` kısıtı ayrıca ikinci bir güvencedir).
   *
   * `mutate`, kilitli oyuncuyla ve tesisin MEVCUT hâliyle çağrılır
   * (`null` = henüz inşa edilmemiş). `updateWithLock` ile AYNI sözleşme:
   * `mutate` içinde fırlatılan bir domain hatası (`InsufficientFundsError`,
   * `MaxFacilityLevelReachedError`) transaction'ı ROLLBACK eder — ne para
   * düşer ne tesis yazılır. Oyuncu bulunamazsa `mutate` hiç ÇAĞRILMAZ ve
   * `null` döner (çağıran `PlayerNotFoundError` fırlatır).
   *
   * `ledgerEntries` `updateWithLock` ile AYNI taşıyıcı tiptir ve AYNI
   * transaction'da yazılır (bkz. `ports/economy-ledger.ts`).
   */
  upgradeWithLock<T>(
    ownerId: string,
    type: FacilityType,
    mutate: (
      player: Player,
      facility: Facility | null,
    ) => { player: Player; facility: Facility; result: T; ledgerEntries?: EconomyLedgerEntryInput[] },
  ): Promise<T | null>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const FACILITY_REPOSITORY = Symbol('FACILITY_REPOSITORY');
