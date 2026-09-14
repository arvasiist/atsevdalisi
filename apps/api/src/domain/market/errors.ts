import { MAX_LISTING_EXPIRY_HOURS, MIN_LISTING_EXPIRY_HOURS } from './validation';

/** At Pazarı (market) domain'ine özgü hata tipleri (brief §30). */

export class InvalidListingPriceError extends Error {
  constructor(public readonly price: number) {
    super(`Geçersiz ilan fiyatı: ${price}. Fiyat sıfır veya pozitif bir tam sayı olmalıdır.`);
    this.name = 'InvalidListingPriceError';
  }
}

/**
 * FAZ 1 wiring, on üçüncü dilim (bu oturum) — `InvalidListingPriceError`
 * ile AYNI desen/gerekçe (Hata 7, docs/ARCHITECTURE.md §9.1): DTO'nun
 * FORMAT ön-kontrolünden BAĞIMSIZ olarak `createListingDraft`'ın kendisi
 * de `expiresInHours`'ı doğrular.
 */
export class InvalidListingExpiryError extends Error {
  constructor(public readonly expiresInHours: number) {
    super(
      `Geçersiz ilan süresi: ${expiresInHours} saat. ${MIN_LISTING_EXPIRY_HOURS}-${MAX_LISTING_EXPIRY_HOURS} saat aralığında bir tam sayı olmalıdır.`,
    );
    this.name = 'InvalidListingExpiryError';
  }
}

export class ListingNotActiveError extends Error {
  constructor(public readonly listingId: string, public readonly status: string) {
    super(`İlan (${listingId}) aktif değil (durum: ${status}) — satın alınamaz.`);
    this.name = 'ListingNotActiveError';
  }
}

export class ListingExpiredError extends Error {
  constructor(public readonly listingId: string) {
    super(`İlan (${listingId}) süresi dolmuş.`);
    this.name = 'ListingExpiredError';
  }
}

export class CannotBuyOwnListingError extends Error {
  constructor() {
    super('Kendi ilanınızı satın alamazsınız.');
    this.name = 'CannotBuyOwnListingError';
  }
}

/**
 * FAZ 1 wiring, on birinci dilim — `errors.ts`'teki DİĞER dört sınıftan
 * FARKLI olarak `domain/market/market.ts` içindeki hiçbir SAF fonksiyon
 * bunu fırlatmaz (o dosya `PurchaseListingResult`/`purchaseListing` bir
 * `MarketListing` NESNESİ üzerinde çalışır, "id'ye göre bul" hiç
 * bilmez — bu, `application` katmanının, repository `null` döndüğünde
 * fırlattığı bir hatadır; `PlayerNotFoundError`/`HorseNotFoundError` ile
 * AYNI kategori). Yine de burada, DOMAIN katmanında tanımlanır (API
 * katmanında DEĞİL) — `errors.ts`'teki diğer market hatalarıyla AYNI
 * dosyada, `ErrorCode.ListingNotFound`'un (FAZ 0'dan beri taslakta
 * duran) İLK gerçek kullanıcısı olarak.
 */
export class ListingNotFoundError extends Error {
  constructor(public readonly listingId: string) {
    super(`İlan (${listingId}) bulunamadı.`);
    this.name = 'ListingNotFoundError';
  }
}

/**
 * FAZ 1 wiring, on birinci dilim — bir atın aynı anda yalnızca TEK bir
 * aktif ilanı olabilir (aksi halde ilk alıcı atı aldıktan sonra, atın
 * SAHİBİ artık değişmiş olsa bile, aynı ata ait DİĞER "aktif" ilan(lar)
 * hâlâ satın alınabilir kalırdı — bu, ikinci bir alıcının artık satıcıya
 * ait OLMAYAN bir atı "satın almasına" yol açardı). Bu kural
 * `createListingDraft`'ın KENDİSİNDE değil, application katmanında
 * (`CreateMarketListingUseCase`, mevcut ilanları sorgulayarak)
 * uygulanır — `createListingDraft` saf bir fonksiyondur, veritabanı
 * sorgusu yapamaz.
 */
export class HorseAlreadyListedError extends Error {
  constructor(public readonly horseId: string) {
    super(`At (${horseId}) zaten aktif bir pazar ilanına sahip.`);
    this.name = 'HorseAlreadyListedError';
  }
}

/**
 * AUDIT_REPORT.md Bulgu D2 (High) — `PostgresMarketPurchaseRepository.
 * executePurchase` artık, atın GERÇEK `owner_id`'sinin hâlâ ilanın
 * `sellerId`'siyle eşleştiğini (satırlar kilitliyken) doğruluyor. Bu, D1
 * ile birlikte ele alınması gereken bir riski kapatır: D1'in düzeltmesi
 * (migration 0023'teki kısmi UNIQUE index) YENİ bir ikinci aktif ilanın
 * OLUŞTURULMASINI engeller, ama D1'DEN ÖNCE (veya ondan bağımsız, örn.
 * manuel bir veri düzeltmesiyle) zaten var olabilecek "stale" bir ilanın
 * SATIN ALINMASINI ayrıca engellemek için bu ikinci, bağımsız savunma
 * hattı gerekir — at zaten başka bir sahibe geçmişse (örn. D1 öncesi bir
 * yarış koşulunda), bu ilan üzerinden yapılan bir satın alma artık
 * sessizce yanlış tarafı ödeyip atı "geri almak" yerine açıkça reddedilir.
 */
export class ListingStaleOwnerError extends Error {
  constructor(public readonly listingId: string, public readonly horseId: string) {
    super(
      `İlan (${listingId}) artık geçerli değil: at (${horseId}) ilanın satıcısına ait değil (muhtemelen at başka bir işlemle el değiştirdi).`,
    );
    this.name = 'ListingStaleOwnerError';
  }
}
