/**
 * `POST /market/listings` (docs/API.md §5) `expiresInHours` doğrulaması
 * için TEK doğruluk kaynağı — DTO (`api/market/dto/create-market-listing.dto.ts`)
 * bu sabitleri TEKRAR YAZMAZ, buradan içe aktarır (`domain/training/validation.ts`
 * `MAX_TRAINING_DURATION_MINUTES` ile AYNI desen, docs/CODING_CONVENTIONS.md #6/7
 * "magic number yasak, config/sabit kullan").
 *
 * FAZ 1 wiring, on üçüncü dilim (bu oturum) — daha önce `createListingDraft`
 * `expiresInHours` kabul etse de (`domain/market/market.ts` FAZ 0'dan beri
 * hazır), HİÇBİR API katmanı bunu dışa açmıyordu (bkz.
 * `CreateMarketListingUseCase`'in eski "expiresInHours YOK" notu) — ilanlar
 * fiilen HER ZAMAN süresizdi. Bu dilim bunu ilk kez dışa açıyor.
 */

/** Alt sınır — `0`/negatif bir süre anlamsızdır. */
export const MIN_LISTING_EXPIRY_HOURS = 1;

/**
 * KARAR (bu dilim, bilinçli): `config/economy.config.json` bir üst sınır
 * TANIMLAMAZ — bu, `domain/training/validation.ts`'teki
 * `MAX_TRAINING_DURATION_MINUTES` ile AYNI gerekçeyle (aşırı/istismar
 * amaçlı değerlerin — ör. 100 yıl — reddedilmesi) burada tanımlanan bir
 * GÜVENLİK sınırıdır, gerçek bir oyun/ekonomi kuralı DEĞİLDİR. 720 saat
 * = 30 gün. İleride gerekirse `economy.config.json`'a taşınabilir.
 */
export const MAX_LISTING_EXPIRY_HOURS = 720;
