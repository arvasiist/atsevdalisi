import type { UUID } from './common';
import type { CurrencyAmount } from './currency';
import type { Horse, HorseStatus } from './horse';

/**
 * brief §11 Bakım Sistemi. `@at-sevdalisi/game-config`'in `CareActionType`'ı
 * ile AYNI değer kümesi — KASITLI bir tekrar (shared-types bağımlılıksızdır,
 * `@at-sevdalisi/game-config`'e bağımlı OLAMAZ; `TrainingType`/
 * `TrainingIntensity`'nin `config/training.config.json`'daki karşılığıyla
 * AYNI ilişkiyle birebir aynı desen, bkz. `horse.ts`).
 */
export type CareActionType = 'groom' | 'water' | 'clean' | 'vet' | 'farrier' | 'rest';

/**
 * brief §12 Besleme — `@at-sevdalisi/game-config`'in `FeedType`'ı ile AYNI
 * değer kümesi.
 *
 * DEĞİŞTİ (bu turda): önceden SOYUT besin türleriydi (`standard`/`energy`/
 * `protein`/`recovery`/`performance`); artık SOMUT yem kalemleridir.
 * `saman` stoklanmaz ve bedavadır (at başına günde 3), diğer dördü
 * (`arpa`/`mama`/`havuc`/`vitamin`) elmasla satın alınır ve envanterde
 * stoklanır — gerekçe `@at-sevdalisi/game-config` `FeedTypeEffect` doc
 * yorumunda.
 */
export type FeedType = 'saman' | 'arpa' | 'mama' | 'havuc' | 'vitamin';

/**
 * `HorseHealth`'in bakım eylemlerinden etkilenen alt kümesi — bkz.
 * `domain/care/care.ts` `CareableHealth` ile AYNI şekil (domain tipi
 * doğrudan shared-types'a SIZDIRILMAZ, bkz. docs/ARCHITECTURE.md §4).
 */
export interface CareableHealthView {
  injuryRisk: number;
  recoveryRate: number;
  jointCondition: number;
  weightCondition: number;
}

/**
 * `POST /horses/{id}/care` yanıtı (docs/API.md §4).
 *
 * AUDIT_REPORT.md H1 düzeltmesi (bu oturum): `newStatus` eklendi —
 * `injured` bir at, uygun bakım eylemiyle (bkz. `care.config.json`
 * `injuryRecovery`) `active`'e dönebildiği için, istemcinin bu geçişi
 * yanıttan doğrudan görebilmesi gerekir (önceden `PerformCareActionUseCase`
 * `horse.status`'a hiç dokunmuyordu — at `injured` olduktan sonra KALICI
 * olarak kullanılamaz kalıyordu).
 */
export interface PerformCareActionResult {
  horseId: UUID;
  actionType: CareActionType;
  newVitals: Pick<Horse, 'health' | 'fitness' | 'fatigue' | 'energy' | 'morale'>;
  newHealth: CareableHealthView;
  newStatus: HorseStatus;
}

/**
 * `POST /horses/{id}/feed` yanıtı (docs/API.md §4).
 *
 * DEĞİŞTİ (bu turda): `remainingToday`/`stockAfter` eklendi. İstemci bu
 * ikisini KENDİSİ HESAPLAMAZ (sunucu otoritesi) — "bugün kaç saman hakkın
 * kaldı" ve "stokta kaç arpa kaldı" bilgisi doğrudan yanıttan gelir.
 */
export interface FeedHorseResult {
  horseId: UUID;
  feedType: FeedType;
  newVitals: Pick<Horse, 'health' | 'fitness' | 'fatigue' | 'energy' | 'morale'>;
  newHealth: CareableHealthView;
  /**
   * Kalemin bu at için günlük sınırı varsa, beslemeden SONRA kalan hak.
   * Sınır yoksa `null` (örn. `arpa`).
   */
  remainingToday: number | null;
  /**
   * Beslemeden sonra envanterde kalan adet. Kalem stoklanmıyorsa (`saman`)
   * `null` — o kalem için stok kavramı yoktur.
   */
  stockAfter: number | null;
}

/**
 * Bir yem kaleminin oyuncuya/ata göre durumu — `GET /players/{id}/feed-inventory`
 * ve `GET /horses/{id}/feed-status` yanıtlarının ortak satırı.
 *
 * TÜM SAYILAR SUNUCUDAN gelir: fiyat, günlük sınır, stok ve bugün verilen
 * adet. İstemci hiçbir oran/tutar türetmez (CLAUDE.md "SUNUCU OTORİTESİ").
 */
export interface FeedItemView {
  type: FeedType;
  /** Satın alma fiyatı. `null` ise kalem satın ALINAMAZ (yalnızca bedava). */
  price: CurrencyAmount | null;
  /** `false` ise kalem stoklanmaz (her zaman verilebilir, `saman` gibi). */
  stocked: boolean;
  /** At başına günlük sınır; `null` ise sınırsız. */
  dailyLimit: number | null;
  /** Envanterdeki adet. Kalem stoklanmıyorsa `null`. */
  quantity: number | null;
  /**
   * Bu AT için son 24 saatte verilen adet. Yalnızca at bağlamında
   * (`GET /horses/{id}/feed-status`) doludur; oyuncu bağlamında `null`.
   */
  fedInWindow: number | null;
}

/** `GET /players/{id}/feed-inventory` yanıtı — oyuncunun yem envanteri + kalem kataloğu. */
export interface FeedInventoryView {
  playerId: UUID;
  items: FeedItemView[];
}

/** `GET /horses/{id}/feed-status` yanıtı — katalog + stok + bu atın günlük kullanımı. */
export interface FeedStatusView {
  horseId: UUID;
  items: FeedItemView[];
}

/** `POST /players/{id}/feed-inventory/{type}/buy` yanıtı. */
export interface BuyFeedResult {
  type: FeedType;
  /** Satın alma SONRASI envanterdeki toplam adet. */
  quantity: number;
  /** Satın alma SONRASI oyuncu bakiyesi (istemci bakiyeyi kendisi düşmez). */
  newBalance: { money: number; gems: number };
  /** Ödenen birim fiyat ve adet — makbuz niteliğinde. */
  price: CurrencyAmount;
  purchasedCount: number;
}
