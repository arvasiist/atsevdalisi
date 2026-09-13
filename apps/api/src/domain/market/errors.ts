/** At Pazarı (market) domain'ine özgü hata tipleri (brief §30). */

export class InvalidListingPriceError extends Error {
  constructor(public readonly price: number) {
    super(`Geçersiz ilan fiyatı: ${price}. Fiyat sıfır veya pozitif bir tam sayı olmalıdır.`);
    this.name = 'InvalidListingPriceError';
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
