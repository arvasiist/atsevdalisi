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
 * bulunması `wallet-history.spec.ts` tarafından ayrıca sabitlenir.
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
  /**
   * brief §42 PHASE 7.2 (29.09.2026) — tribün bileti İADESİ. Tek gerçek
   * fırlatıcısı `PostgresGrandstandRepository.refundTicket`'tır
   * (`DELETE /races/:id/tickets`).
   *
   * `grandstand_ticket`'in TAM karşıtıdır (aynı tutar, ters yön) ve
   * `race_entry_refund` ile AYNI gerekçeyle AYRI tutulur: cüzdan ekranında
   * "yarış girişi iadesi" ile "bilet iadesi" ayrımını kanonik tür değil
   * `type` alanı taşır. İkisi tek bir `REFUND` başlığı altında birleşseydi
   * "hangi iade neyin karşılığı" sorusu defterden cevaplanamazdı.
   *
   * Tutar biletin KENDİ `race_tickets.price` sütunundan okunur
   * (`races.tribune_fee`den DEĞİL) — bkz. `refundTicket` doc yorumu.
   */
  'grandstand_ticket_refund',
  'market_purchase_debit',
  'market_purchase_credit',
  'practice_race_entry_fee',
  'practice_race_prize',
  'lobby_race_entry_fee',
  /**
   * brief §42 PHASE 13.14 — ÖDÜLLÜ LOBİ YARIŞI ödülü. Tek gerçek
   * fırlatıcısı `postgres-race.repository.ts`'in `settleLobbyRace`'idir
   * (`POST /races/:id/settle`).
   *
   * `practice_race_prize`'ten AYRI tutulur (aynı `PRIZE` kanonik türüne
   * eşlenir): "bu para nereden geldi" sorusu tek bir defter sorgusuyla
   * cevaplanabilmelidir. Aynı tür altında toplanırsa ödüllü lobi ile
   * antrenman ödülü defterde birbirine karışır ve
   * `races.prize_pool` ile ödenen toplam uzlaştırılamaz.
   */
  'lobby_race_prize',
  /**
   * brief §20 DEPOSIT / §21 / §41, §42 PHASE 4b — SANAL (mock) para
   * yatırma. Tek gerçek fırlatıcısı `deposit-funds.use-case.ts`'tir ve o
   * use-case yalnızca `MockPaymentProvider` bağlıyken çalışır; yani bu
   * değerin üretimde GERÇEK para karşılığı YOKTUR. Adı bilerek
   * `'mock_deposit'`tir, `'deposit'` DEĞİL: gerçek bir sağlayıcı
   * (Stripe/iyzico) bağlandığında defterde "hangi yatırma gerçek, hangisi
   * oyuncak" ayrımı KAYBOLMAMALIDIR — bu ayrım olmadan geçmiş kayıtlar
   * muhasebe açısından zehirlenir (bkz. `docs/WALLET_SYSTEM.md`).
   */
  'mock_deposit',
  /**
   * brief §20 REFUND, §42 PHASE 4c — yarıştan AYRILMA + giriş ücreti
   * iadesi. Tek gerçek fırlatıcısı `leave-race.use-case.ts`'tir
   * (`POST /races/:id/leave`).
   *
   * Tutar `races.entry_fee`'den OKUNMAZ, defterin kendisinden okunur: aynı
   * oyuncunun aynı yarışa yaptığı `lobby_race_entry_fee` satırının ters
   * işaretli hâlidir. Gerekçe `LeaveLobbyRaceInput` doc yorumunda — kısaca,
   * ücret politikası değişse bile geçmiş bir katılımın iadesi o katılımın
   * GERÇEKTE ödediği tutar olmalıdır.
   */
  'race_entry_refund',
  /**
   * brief §13 JOKEY, §42 PHASE 6.2 (29.09.2026) — jokey kiralamasının tek
   * seferlik bedeli (`jockeys.salary`). Tek gerçek fırlatıcısı
   * `postgres-jockey.repository.ts`'in `hire`'ıdır
   * (`POST /jockeys/:jockeyId/hire`).
   *
   * **`salary = 0` OLABİLİR ve o zaman deftere HİÇ satır yazılmaz** —
   * `economy_transactions.amount <> 0` CHECK'i (migration 0019) sıfır
   * tutarlı bir "hareketi" reddeder ve bu doğrudur: muhasebe anlamında
   * gerçekleşmemiştir. Yani bu türü arayan bir sorgu, ücretsiz kiralamaları
   * BULMAZ; kiralama gerçeğinin tek kaynağı `jockeys.owner_id`dir.
   */
  'jockey_hire',
  'staff_contract',
  'season_reward',
  'auction_bid_hold',
  'auction_bid_refund',
  'auction_sale_credit',
  /** 02.10.2026 (Faz 11-B) — günlük/haftalık görev ödülü (tekil `quest_claims` satırına bağlı). */
  'quest_reward',
  /** 02.10.2026 (Faz 11-B) — yönetimin açtığı süreli etkinliğin ödülü. */
  'event_reward',
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
 * (`wallet-history.spec.ts`): brief'in istediği bir tür silinirse test
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
  // PHASE 7.2 — bilet iadesi, satın almanın AYNASI. `REFUND` (brief §20'nin
  // açıkça saydığı tür) seçildi, `SPECTATOR_FEE` DEĞİL: iade bir seyirci
  // ücreti TAHSİLİ değildir ve o başlık altında gösterilseydi cüzdan
  // ekranında "tribün gideri" ile "tribün iadesi" aynı kalemde toplanır,
  // net akış okunamaz hâle gelirdi.
  grandstand_ticket_refund: 'REFUND',
  market_purchase_debit: 'MARKET',
  market_purchase_credit: 'MARKET',
  practice_race_entry_fee: 'ENTRY_FEE',
  practice_race_prize: 'PRIZE',
  lobby_race_entry_fee: 'ENTRY_FEE',
  lobby_race_prize: 'PRIZE',
  mock_deposit: 'DEPOSIT',
  // brief §20 REFUND, §42 PHASE 4c — `lobby_race_entry_fee`'nin TAM
  // karşıtı: aynı tutar, ters yön. Ayrı bir kanonik tür uydurulmaz
  // (`REFUND` zaten `BRIEF_TRANSACTION_TYPES` içindedir ve brief §20 onu
  // açıkça sayar), çünkü cüzdan ekranında "giriş ücreti iadesi" ile
  // "başka bir iade" ayrımını kanonik tür değil `type` alanı taşır.
  race_entry_refund: 'REFUND',
  // PHASE 6.2 — jokey maaşı bir BAKIM/gider kalemidir (`stable_upgrade`,
  // `facility_*`, `feed_purchase` ile AYNI aile). `ENTRY_FEE` DEĞİL: jokey
  // kiralamak bir yarışa giriş değildir ve cüzdanda "giriş ücreti" başlığı
  // altında görünmesi oyuncuya yanlış bir tablo çizerdi.
  jockey_hire: 'UPKEEP',
  staff_contract: 'UPKEEP',
  season_reward: 'REWARD',
  // 02.10.2026 — müzayede emaneti: teklif tutulur (MARKET), geçilince ya da
  // satış gerçekleşmezse iade edilir (REFUND), satışta satıcıya geçer (MARKET).
  auction_bid_hold: 'MARKET',
  auction_bid_refund: 'REFUND',
  auction_sale_credit: 'MARKET',
  quest_reward: 'REWARD',
  event_reward: 'REWARD',
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
  /**
   * 30.09.2026 — sonraki sayfanın imleci (`?before=` ile gönderilir).
   * `hasMore` ise bu sayfanın SON satırının `id`si, değilse `null`.
   */
  nextCursor: string | null;
  /**
   * 02.10.2026 (Faz 13-A) — bu sunucuda para yatırma açık mı (config bayrağı
   * VE ortam; üretimde sahte yatırma her zaman kapalı). Ekran formu buna
   * göre gösterir — istemci config'inden tahmin ETMEZ.
   */
  depositAvailable: boolean;
}

/**
 * `POST /players/{id}/wallet/deposit` yanıtı (brief §20 DEPOSIT, §21
 * "Gerçek para entegrasyonunu şimdilik doğrudan hard-code etme", §41
 * "Sistemi önce Virtual Coin / Mock Wallet olarak geliştir", §42 PHASE 4b).
 *
 * ## Neden iki ayrı kimlik döner
 *
 * `transactionId` — DEFTER satırının UUID'si (brief §22 "Transaction ID
 * oluşturulmalı"). Kalıcı, değişmez, `GET /wallet`'ta da görünen
 * kimliktir; bir uyuşmazlıkta oyuncunun "şu işlem" diye işaret edeceği şey.
 *
 * `providerReference` — ÖDEME SAĞLAYICISININ kendi referansı. Mock
 * sağlayıcıda üretilmiş bir yer tutucudur (`mock_<uuid>`), ama gerçek bir
 * sağlayıcıda Stripe/iyzico tarafındaki işlem numarası olurdu ve
 * mutabakat (reconciliation) YALNIZCA onunla yapılabilir. İkisini tek
 * alanda birleştirmek, sağlayıcı değiştiğinde geriye dönük izlenebilirliği
 * yok ederdi.
 *
 * `newBalance` — sunucunun hesapladığı YENİ bakiye. İstemci bakiyeyi
 * kendisi toplamaz (brief §22 "Tüm finansal hesaplamalar backend'de
 * yapılmalı").
 */
export interface WalletDepositResult {
  transactionId: string;
  amount: number;
  currency: Currency;
  newBalance: Pick<Player, 'money' | 'gems'>;
  /** Sağlayıcının kimliği — şu an her zaman `'mock'`. Gerçek sağlayıcı eklendiğinde ayırt edici alan budur. */
  providerId: string;
  providerReference: string;
}
