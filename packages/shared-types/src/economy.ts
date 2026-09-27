import type { FeedType } from './care';
import type { Currency } from './currency';
import type { Player } from './player';

/**
 * FAZ 1 wiring, yedinci dilim — `POST /players/{id}/daily-reward` yanıtı
 * (brief §37 "GÜNLÜK OYUN DÖNGÜSÜ"). `newBalance`, `stable.ts`'teki
 * `StableUpgradeResult.newBalance` ile AYNI `Pick` deseni.
 */
export interface ClaimDailyRewardResult {
  amount: number;
  currency: Currency;
  newBalance: Pick<Player, 'money' | 'gems'>;
  /** Bir sonraki talebin uygun olacağı zaman (ISO 8601) — UI'ın geri sayım gösterebilmesi için. */
  nextClaimAvailableAt: string;
  /**
   * Günlük ödülle BİRLİKTE verilen bedava yem kalemleri (bu turda EKLENDİ).
   * Kaynak `config/care.config.json` → `feedDailyGift`; içerik boşsa boş
   * dizidir. Her satır, hediyeden SONRA envanterdeki toplam adedi taşır —
   * istemci stoğu kendisi toplamaz.
   */
  grantedFeed: { type: FeedType; count: number; quantityAfter: number }[];
}

/**
 * CÜZDAN + İŞLEM TÜRLERİ (brief §20 "WALLET SYSTEM", §42 PHASE 4).
 *
 * ## Neden bu taksonomi var
 *
 * Brief §20 şunu ister: "Transaction sistemi: DEPOSIT, ENTRY_FEE, PRIZE,
 * GIFT, SPECTATOR_FEE, REFUND gibi transaction type'larını desteklesin.
 * Her para hareketi immutable transaction olarak kaydedilmeli."
 *
 * Defter (migration 0019) zaten VAR ve `type` kolonu serbest metindir —
 * yani brief'in saydığı türler ile kodun yazdığı 15 AYRI değer
 * (`practice_race_entry_fee`, `market_purchase_debit`, ...) arasında
 * GÖRÜNMEZ bir boşluk vardı: "bu hareket brief'in hangi türü?" sorusunun
 * cevabı hiçbir yerde yazılı değildi.
 *
 * ÇÖZÜM İKİ KATMANLI:
 *
 *  1. `LedgerTransactionType` — deftere YAZILABİLEN her `type` değerinin
 *     birleşimi. `EconomyLedgerEntryInput.type` artık `string` DEĞİL bu
 *     birleşimdir, yani yeni/yanlış bir değer yazmak DERLEME hatası verir
 *     (sessiz kayma imkansız hale gelir).
 *  2. `CANONICAL_BY_LEDGER_TYPE` — her ince türü brief'in ailesine
 *     eşleyen TEK harita. `Record<LedgerTransactionType, ...>` olduğundan
 *     yeni bir tür eklenip eşlemesi yazılmazsa derleyici uyarır.
 *
 * ## Neden brief'in 6 türü YETMİYOR (dürüstlük notu)
 *
 * Brief "gibi" der — sayılan 6 tür ÖRNEKTİR, kapanmış bir küme değil.
 * Oyunun ZATEN para hareketi üreten yolları (pazar alım-satımı, damızlık
 * ücreti, yem alımı, tesis yükseltmesi, günlük ödül) bu altısından
 * hiçbirine DÜRÜSTÇE sığmaz. Hepsini zorla 'DEPOSIT' saymak, cüzdan
 * ekranında "yem aldın" satırını "para yatırdın" diye göstermek olurdu.
 * Bu yüzden brief'in 6 türü AYNEN korunur ve oyunun gerçek ihtiyaçları
 * için 4 aile daha eklenir. Brief'in saydığı 6 türün HEPSİNİN bu listede
 * bulunması `wallet-taxonomy.spec.ts` tarafından ayrıca sabitlenir.
 */
export const LEDGER_TRANSACTION_TYPES = [
  'daily_reward',
  'stable_upgrade',
  'facility_build',
  'facility_upgrade',
  'feed_purchase',
  'breeding_stud_fee_debit',
  'breeding_stud_fee_credit',
  'gift_send_debit',
  'gift_send_credit',
  'grandstand_ticket',
  'market_purchase_debit',
  'market_purchase_credit',
  'practice_race_entry_fee',
  'practice_race_prize',
  'lobby_race_entry_fee',
] as const;

export type LedgerTransactionType = (typeof LEDGER_TRANSACTION_TYPES)[number];

export const CANONICAL_TRANSACTION_TYPES = [
  'DEPOSIT',
  'ENTRY_FEE',
  'PRIZE',
  'GIFT',
  'SPECTATOR_FEE',
  'REFUND',
  'MARKET',
  'BREEDING',
  'UPKEEP',
  'REWARD',
] as const;

export type CanonicalTransactionType = (typeof CANONICAL_TRANSACTION_TYPES)[number];

/**
 * Brief §20'nin AÇIKÇA saydığı türler — bu liste ile
 * `CANONICAL_TRANSACTION_TYPES` arasındaki ilişki testle sabitlenir
 * (`wallet-taxonomy.spec.ts`): brief'in istediği bir tür silinirse test
 * kırılır.
 */
export const BRIEF_TRANSACTION_TYPES = [
  'DEPOSIT',
  'ENTRY_FEE',
  'PRIZE',
  'GIFT',
  'SPECTATOR_FEE',
  'REFUND',
] as const satisfies readonly CanonicalTransactionType[];

export const CANONICAL_BY_LEDGER_TYPE: Record<LedgerTransactionType, CanonicalTransactionType> = {
  daily_reward: 'REWARD',
  stable_upgrade: 'UPKEEP',
  facility_build: 'UPKEEP',
  facility_upgrade: 'UPKEEP',
  feed_purchase: 'UPKEEP',
  breeding_stud_fee_debit: 'BREEDING',
  breeding_stud_fee_credit: 'BREEDING',
  gift_send_debit: 'GIFT',
  gift_send_credit: 'GIFT',
  grandstand_ticket: 'SPECTATOR_FEE',
  market_purchase_debit: 'MARKET',
  market_purchase_credit: 'MARKET',
  practice_race_entry_fee: 'ENTRY_FEE',
  practice_race_prize: 'PRIZE',
  lobby_race_entry_fee: 'ENTRY_FEE',
};

/**
 * Cüzdan ekranındaki TEK bir hareket. Defter satırının (migration 0019)
 * API sınırını geçen hâli — `id` brief §22'nin istediği **transaction
 * ID**'dir ve asla yeniden üretilmez, satırın kendi UUID'sidir.
 *
 * `amount` İMZALIDIR: negatif = düşüm (debit), pozitif = ekleme (credit).
 * İstemci bunu KENDİ hesaplamaz, sunucudan okur (brief §22 "Tüm finansal
 * hesaplamalar backend'de yapılmalı").
 */
export interface WalletTransaction {
  id: string;
  type: LedgerTransactionType;
  canonicalType: CanonicalTransactionType;
  amount: number;
  currency: Currency;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

/**
 * `GET /players/{id}/wallet` yanıtı (brief §20, §42 PHASE 4).
 *
 * `hasMore` sunucudan gelir — istemcinin "daha var mı?" sorusunu
 * sayfa boyutundan TAHMİN etmesi (klasik "length === limit" yanılgısı,
 * tam bölünen sonuçlarda fazladan boş bir istek üretir) gerekmez.
 */
export interface WalletView {
  playerId: string;
  money: number;
  gems: number;
  transactions: WalletTransaction[];
  hasMore: boolean;
}
