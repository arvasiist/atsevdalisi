/** Bakım (care) domain'ine özgü hata tipleri (brief §11). */

export class CareActionOnCooldownError extends Error {
  constructor(
    public readonly remainingMinutes: number,
  ) {
    super(`Bu bakım eylemi henüz tekrar kullanılamaz (${remainingMinutes} dakika kaldı).`);
    this.name = 'CareActionOnCooldownError';
  }
}

/**
 * FAZ 1 wiring, beşinci dilim — Antrenman diliminde CI'da yakalanan
 * Hata 7'nin (bkz. `docs/ARCHITECTURE.md` §9.1) dersi BAŞTAN uygulanır:
 * `POST /horses/:id/care`/`feed` DTO'larındaki `@IsIn(...)` kontrolü
 * NestJS'in `ValidationPipe`'ı Vitest/esbuild altında metatype'ı
 * çözemediğinde sessizce ATLANABİLİR — bu yüzden domain katmanı
 * `actionType`/`feedType`'ı KENDİSİ de bağımsız olarak doğrular.
 * `config/care.config.json`'da tanımsız bir değer verilirse fırlatılır.
 */
export class InvalidCareInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCareInputError';
  }
}

/**
 * Geçersiz yem kalemi (bu turda EKLENDİ). `InvalidCareInputError`'dan
 * AYRI tutulur çünkü HTTP eşlemesi farklıdır: bu, yol/gövde parametresinin
 * kendisinin geçersiz olduğu anlamına gelir (400), "config'te tanımsız bir
 * değer" durumundan (ki bu bir SUNUCU yapılandırma hatasıdır) bağımsızdır.
 *
 * Doğrulama DTO'ya değil DOMAIN'e aittir (CLAUDE.md "Kardeş tuzak":
 * `@IsIn` esbuild altında atlanır) — bkz. `validation.ts` `parseFeedType`.
 */
export class InvalidFeedTypeError extends Error {
  constructor(value: unknown) {
    super(`Geçersiz yem kalemi: "${String(value)}".`);
    this.name = 'InvalidFeedTypeError';
  }
}

/**
 * Kalem stokta yok (bu turda EKLENDİ) — `stocked: true` bir kalem
 * envanterde 0 iken beslenmeye çalışıldı. İstemci bunu "satın al"
 * çağrısıyla çözebileceği için AYRI bir hata tipidir (409 Conflict:
 * istek geçerli ama mevcut durumla çakışıyor).
 */
export class InsufficientFeedStockError extends Error {
  constructor(
    public readonly feedType: string,
    public readonly available: number,
  ) {
    super(`Stokta "${feedType}" yok (elde ${available} adet). Önce satın almalısın.`);
    this.name = 'InsufficientFeedStockError';
  }
}

/**
 * Günlük sınır doldu (bu turda EKLENDİ) — `dailyLimit` tanımlı bir kalem
 * (bugün için `saman`, günde 3) o at için sınırına ulaştı. Kayan 24 saat
 * penceresi kullanılır (takvim günü DEĞİL — bkz. `domain/economy/
 * daily-reward.ts` KAPSAM notu ve migration 0030 yorumu).
 */
export class DailyFeedLimitReachedError extends Error {
  constructor(
    public readonly feedType: string,
    public readonly dailyLimit: number,
    public readonly remainingMinutes: number,
  ) {
    super(
      `"${feedType}" için günlük sınır doldu (günde en fazla ${dailyLimit}). ` +
        `Yaklaşık ${remainingMinutes} dakika sonra tekrar verilebilir.`,
    );
    this.name = 'DailyFeedLimitReachedError';
  }
}

/**
 * `stocked: false` bir kalem SATIN ALINMAYA çalışıldı (bu turda EKLENDİ) —
 * örn. `saman`. Bu kalemin fiyatı yoktur; zaten bedava verilir. 400 döner
 * (istemci var olmayan bir işlem istiyor).
 */
export class FeedNotPurchasableError extends Error {
  constructor(
    public readonly feedType: string,
  ) {
    super(`"${feedType}" satın alınamaz (yalnızca bedava verilir).`);
    this.name = 'FeedNotPurchasableError';
  }
}

/**
 * Satın alma adedi geçersiz (bu turda EKLENDİ) — gövdedeki `count` pozitif
 * bir tamsayı değilse veya sunucudaki üst sınırı
 * (`care.config.json` `feedPurchaseMaxCount`) aşıyorsa fırlatılır.
 *
 * Bu kontrol DOMAIN'dedir çünkü gövde alanı serbest bir JSON değeridir:
 * DTO'daki `@IsInt`/`@Min` (CLAUDE.md "Kardeş tuzak") esbuild altında
 * atlanabilir ve doğrudan `price.amount * count` hesabına giren bir değerin
 * doğrulanmadan geçmesi, tek istekte dört haneli bir adetle stok/defter
 * yazımı tetikleyebilirdi.
 */
export class InvalidFeedPurchaseCountError extends Error {
  constructor(
    public readonly value: unknown,
    public readonly maxCount: number,
  ) {
    super(`Geçersiz yem adedi: "${String(value)}" (1 ile ${maxCount} arasında bir tamsayı olmalı).`);
    this.name = 'InvalidFeedPurchaseCountError';
  }
}
