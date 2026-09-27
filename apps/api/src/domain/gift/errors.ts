/**
 * Hediye gönderimi domain hataları (proje sahibinin açık talebi, 27.09.2026
 * — üç parçanın üçüncüsü).
 *
 * `domain/social/errors.ts` ile AYNI ilke: bu sınıflar NestJS/HTTP BİLMEZ
 * (framework'süz saf TS — `CLAUDE.md` "KATMAN YÖNÜ TEK YÖNLÜ"), HTTP durum
 * kodlarına eşleme TEK bir yerde, `api/middleware/http-exception.filter.ts`'te
 * yapılır.
 *
 * **BU BİR PARA YOLUDUR:** aşağıdaki hataların hiçbiri "para kayboldu" gibi
 * bir duruma karşılık GELMEZ — hepsi yazma denenmeden ÖNCE fırlatılır ve
 * `withTransaction` ROLLBACK yapar. `InsufficientFundsError` bilinçli olarak
 * BURADA YENİDEN TANIMLANMAZ: `domain/economy/errors.ts`'teki sınıf zaten
 * `INSUFFICIENT_FUNDS`'a eşlenmiştir ve hediye yolunda da AYNI anlamı taşır
 * (brief §29 "duplicate economy implementation oluşturma").
 */

/**
 * Kendine hediye gönderilemez. 400 — kalıcı bir GİRDİ hatasıdır.
 *
 * `gift_sends_not_self` CHECK'inin (`migration 0034`) uygulama tarafındaki
 * karşılığıdır. `CannotMessageSelfError`/`CannotFriendSelfError`'dan AYRI
 * bir koddur: kullanıcıya söylenen şey farklıdır ve istemci bu üçünü ayrı
 * metinlerle gösterebilmelidir.
 */
export class CannotGiftSelfError extends Error {
  constructor() {
    super('Kendinize hediye gönderemezsiniz.');
    this.name = 'CannotGiftSelfError';
  }
}

/**
 * Hediye miktarı geçersiz. 400.
 *
 * `reason` alanı, `RaceNotWatchableError`/`InvalidMessageBodyError`'daki AYNI
 * desenle, çağıranın kullanıcıya AYRI bir açıklama gösterebilmesi içindir —
 * ama tek bir kod (`INVALID_GIFT_AMOUNT`) altında döner, çünkü kullanıcıya
 * söylenen şey aynıdır: "bu miktar gönderilemez".
 *
 * `min`/`max` config'ten gelir (`config/gift.config.json`) ve mesaja GÖMÜLÜR:
 * kullanıcı sınırı öğrenmek için ikinci bir istek atmak zorunda kalmaz.
 */
export class InvalidGiftAmountError extends Error {
  constructor(
    public readonly reason: 'NOT_AN_INTEGER' | 'BELOW_MIN' | 'ABOVE_MAX',
    public readonly min: number,
    public readonly max: number,
  ) {
    super(
      reason === 'NOT_AN_INTEGER'
        ? 'Hediye miktarı tam sayı olmalıdır.'
        : `Hediye miktarı ${min} ile ${max} arasında olmalıdır.`,
    );
    this.name = 'InvalidGiftAmountError';
  }
}

/**
 * Bu para birimi hediye olarak gönderilemez. 400.
 *
 * Kaynak `config/gift.config.json → allowedCurrencies`. Brief §13/§14'ün
 * ("etkinlik para birimi ana Çip ile karıştırılmamalı", "bütün currency'ler
 * ayrı tutulmalı") hediye yolundaki karşılığıdır: ileride eklenen bir birim
 * bu listeye AÇIKÇA eklenmedikçe hediye edilemez.
 *
 * `allowed` alanı hata mesajında listelenir — bu, bir OPERATÖR hatası
 * (config'e geçersiz bir değer yazılması) ile kullanıcı hatasını ayırt
 * etmeyi kolaylaştırır.
 */
export class GiftCurrencyNotAllowedError extends Error {
  constructor(
    public readonly currency: string,
    public readonly allowed: readonly string[],
  ) {
    super(`Bu para birimi hediye olarak gönderilemez: "${currency}". İzinli birimler: ${allowed.join(', ')}.`);
    this.name = 'GiftCurrencyNotAllowedError';
  }
}

/**
 * Hediye göndermek için arkadaş olmak gerekir. 403.
 *
 * **NEDEN 403 (400/409 DEĞİL):** bu bir GİRDİ hatası değil (gövde geçerli),
 * geçici bir durum da değil — istek sahibinin o kaynağa YETKİSİ yoktur
 * (`NotFriendsError` ile AYNI kategori). Arkadaşlık kurulduğunda AYNI istek
 * başarılı olur, yani istemci için "izin iste" anlamı taşır.
 *
 * **NEDEN `NotFriendsError` YENİDEN KULLANILMADI:** o sınıfın mesajı
 * mesaja özgüdür ("Mesaj gönderebilmek için..."); hediye ekranında aynı
 * metni göstermek yanıltıcı olurdu. İki ayrı kod, istemcinin hediye
 * ekranını "önce arkadaş ekle" akışına yönlendirmesini de mümkün kılar.
 *
 * Bu kural, istenmeyen para transferlerini YAPISAL olarak engeller: bir
 * oyuncuya hediye gönderebilmek için o oyuncunun isteği KABUL etmiş olması
 * gerekir — yani rastgele hesaplara para yağdırma (ve dolayısıyla
 * "para aklama"/rahatsız etme) mümkün değildir.
 */
export class GiftRequiresFriendshipError extends Error {
  constructor(public readonly recipientId: string) {
    super('Hediye gönderebilmek için önce arkadaş olmanız gerekir.');
    this.name = 'GiftRequiresFriendshipError';
  }
}

/**
 * Kayan penceredeki hediye SAYISI tavanı aşıldı. 409.
 *
 * **NEDEN VAR:** `maxAmount` tek bir isteğin büyüklüğünü sınırlar ama
 * "çok sayıda küçük hediye" AYRI bir vektördür — bir hesap, arkadaşlarına
 * saniyeler içinde yüzlerce mikro-hediye göndererek defteri ve alıcıların
 * bildirimlerini boğabilir. Bu tavan o vektörü kapatır; `@RateLimit`
 * (dakikalık) ile birlikte İKİ farklı zaman ölçeğinde çalışır.
 *
 * **Neden 409 (400 değil):** gövde geçerlidir; engel o anki SAYIMA
 * bağlıdır ve pencere kaydıkça kendiliğinden kalkar
 * (`SocialLimitReachedError` ile AYNI kategori).
 *
 * `limit` mesaja GÖMÜLÜR — kullanıcı sınırı öğrenmek için ikinci bir istek
 * atmak zorunda kalmaz. **Pencere UZUNLUĞU mesaja YAZILMAZ:** pencere
 * `config/gift.config.json → dailyWindowHours`'tadır ve hata sınıfı
 * `game-config`'e bağımlı DEĞİLDİR (domain framework'süz ve paketsiz
 * kalır) — bu yüzden buraya gömülü bir "24 saat" ifadesi, config
 * değiştiğinde sessizce YANLIŞ bir söz verirdi.
 */
export class DailyGiftLimitReachedError extends Error {
  constructor(public readonly limit: number) {
    super(`Hediye gönderme sınırına ulaştınız (en fazla ${limit} hediye). Lütfen daha sonra tekrar deneyin.`);
    this.name = 'DailyGiftLimitReachedError';
  }
}
