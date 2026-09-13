/**
 * AUDIT_AND_HARDENING — Öncelik 2: Economy Ledger (bu oturum, proje
 * sahibinin talebiyle). `database/migrations/0019_add_economy_ledger`'daki
 * `economy_transactions` tablosuna yazılacak TEK bir hareketin şekli.
 *
 * Bu tip BİLEREK `@at-sevdalisi/shared-types`'ta DEĞİL, burada (Application
 * katmanında) tanımlıdır — API sınırını hiç geçmez (henüz bir "işlem
 * geçmişi" endpoint'i YOK, bkz. `docs/ROADMAP.md`'deki KAPSAM DIŞI notu);
 * yalnızca Application (`*.use-case.ts`'in `mutate` callback'i) ile
 * Infrastructure (`PostgresPlayerRepository`/`PostgresMarketPurchaseRepository`)
 * arasında, `PlayerRepository.updateWithLock`/`updateTwoWithLock`'un
 * TAŞIDIĞI bir taşıyıcı (carrier) tiptir.
 *
 * `playerId` her girişte AÇIKÇA bulunur (örtük/bağlamsal DEĞİL) çünkü
 * `updateTwoWithLock`'un TEK bir çağrısı hem alıcı HEM satıcı için birer
 * giriş üretebilir — bkz. `PostgresPlayerRepository`'nin ledger yazma
 * mantığı.
 */
export interface EconomyLedgerEntryInput {
  playerId: string;
  /**
   * Serbest metin kategori — örn. 'market_purchase_debit',
   * 'market_purchase_credit', 'daily_reward', 'stable_upgrade',
   * 'practice_race_entry_fee', 'practice_race_prize'. Yeni bir tür
   * eklemek migration GEREKTİRMEZ (bkz. migration dosyasının doc yorumu).
   */
  type: string;
  /** İMZALI: negatif = düşüm (debit), pozitif = ekleme (credit). Asla sıfır olamaz (bkz. çağıranların "amount > 0 ise yaz" kontrolü). */
  amount: number;
  currency: 'money' | 'gems';
  referenceType: string | null;
  referenceId: string | null;
  balanceBefore: number;
  balanceAfter: number;
  idempotencyKey: string | null;
}
