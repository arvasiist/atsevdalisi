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

import type { Currency } from '../../domain/economy/wallet';
import type { LedgerTransactionType } from '@at-sevdalisi/shared-types';

export interface EconomyLedgerEntryInput {
  /**
   * Satırın UUID'si — **isteğe bağlı**, verilmezse veritabanı üretir
   * (`gen_random_uuid()`).
   *
   * NEDEN VAR (brief §22 "Transaction ID oluşturulmalı", §42 PHASE 4b):
   * `POST /players/:id/wallet/deposit` yanıtı, oluşturduğu defter
   * satırının kimliğini döndürmek ZORUNDADIR. Kimliği veritabanı üretirse
   * çağıran onu ancak satır yazıldıktan SONRA, geriye dönük bir okumayla
   * öğrenebilir — bu okuma ile yazma arasına başka bir para hareketi
   * girebilir ve "hangisi benim?" sorusu yarış koşuluna (race) açık kalır.
   * Kimliği ÇAĞIRANIN üretmesi bu belirsizliği tamamen ortadan kaldırır:
   * `result.transactionId` kilitten ÖNCE bilinir ve yazılan satırın
   * kimliğiyle YAPISAL olarak aynıdır.
   *
   * Diğer tüm çağrılar bu alanı kullanmaz — verilmediğinde davranış
   * DEĞİŞMEZ (`COALESCE($1::uuid, gen_random_uuid())`).
   */
  id?: string;
  playerId: string;
  /**
   * Defter kategori kimliği. **ARTIK SERBEST METİN DEĞİL** (brief §20,
   * §42 PHASE 4): `LedgerTransactionType` birleşimidir ve
   * `@at-sevdalisi/shared-types`'taki `LEDGER_TRANSACTION_TYPES`'tan
   * gelir. Eskiden `string` idi ve bir yazım hatası (`'daily-reward'`)
   * yalnızca üretimde, cüzdan ekranında görünürdü — şimdi derleme hatası.
   *
   * Yeni bir tür eklemek migration GEREKTİRMEZ (`economy_transactions.type`
   * hâlâ `TEXT`), ama ÜÇ yeri birlikte güncellemeyi gerektirir:
   * `LEDGER_TRANSACTION_TYPES` + `CANONICAL_BY_LEDGER_TYPE` (ikisi de
   * derleyici tarafından zorlanır) ve cüzdan ekranının etiket haritası.
   */
  type: LedgerTransactionType;
  /** İMZALI: negatif = düşüm (debit), pozitif = ekleme (credit). Asla sıfır olamaz (bkz. çağıranların "amount > 0 ise yaz" kontrolü). */
  amount: number;
  /**
   * Para birimi. Tip `domain/economy/wallet.ts`'teki `CURRENCIES`'ten
   * TÜRETİLİR (brief §14) — burada elle `'money' | 'gems'` yazmak,
   * ikinci bir doğruluk kaynağı üretiyordu. Migration'daki
   * `CHECK (currency IN ('money','gems'))` ile eşleşmesi
   * `apps/api/test/database/economy-currency.spec.ts` tarafından korunur.
   */
  currency: Currency;
  referenceType: string | null;
  referenceId: string | null;
  balanceBefore: number;
  balanceAfter: number;
  idempotencyKey: string | null;
}
