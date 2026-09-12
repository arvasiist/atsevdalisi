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
