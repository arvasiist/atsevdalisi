/**
 * Arkadaşlık + mesajlaşma domain hataları (proje sahibinin açık talebi,
 * 27.09.2026).
 *
 * `domain/grandstand/errors.ts` ile AYNI ilke: bu sınıflar NestJS/HTTP
 * BİLMEZ (framework'süz saf TS — `CLAUDE.md` "KATMAN YÖNÜ TEK YÖNLÜ"),
 * HTTP durum kodlarına eşleme TEK bir yerde,
 * `api/middleware/http-exception.filter.ts`'te yapılır.
 */

/** Kendine arkadaşlık isteği gönderilemez. 400 — kalıcı bir GİRDİ hatasıdır. */
export class CannotFriendSelfError extends Error {
  constructor() {
    super('Kendinize arkadaşlık isteği gönderemezsiniz.');
    this.name = 'CannotFriendSelfError';
  }
}

/**
 * Kendine mesaj gönderilemez. 400.
 *
 * `direct_messages_not_self` CHECK'inin (`migration 0033`) uygulama
 * tarafındaki karşılığıdır. `CannotFriendSelfError`'dan AYRI bir koddur:
 * istemci ikisini ayrı metinlerle gösterebilmelidir ("kendine istek
 * gönderemezsin" ≠ "kendine mesaj gönderemezsin").
 */
export class CannotMessageSelfError extends Error {
  constructor() {
    super('Kendinize mesaj gönderemezsiniz.');
    this.name = 'CannotMessageSelfError';
  }
}

/**
 * Bu iki oyuncu arasında zaten bir arkadaşlık kaydı var (bekleyen VEYA
 * kabul edilmiş). 409 — o anki DURUMA bağlı bir engel, kalıcı bir girdi
 * hatası değil (`RaceTicketAlreadyOwnedError` ile AYNI kategori).
 *
 * NOT: `rejected` durumundaki bir kayıt bu hatayı ÜRETMEZ — reddedilen
 * bir isteğin yeniden gönderilebilmesi bilinçlidir (bkz.
 * `SendFriendRequestUseCase`); o durumda mevcut satır yeniden `pending`
 * yapılır, yeni satır açılmaz (kanonik çift + UNIQUE).
 */
export class FriendshipAlreadyExistsError extends Error {
  constructor(public readonly status: 'pending' | 'accepted') {
    super(
      status === 'accepted'
        ? 'Bu oyuncuyla zaten arkadaşsınız.'
        : 'Bu oyuncuyla aranızda zaten bekleyen bir arkadaşlık isteği var.',
    );
    this.name = 'FriendshipAlreadyExistsError';
  }
}

/**
 * İstenen arkadaşlık kaydı yok, istek sahibine ait değil VEYA ona
 * GELMEMİŞ bir istek (kendi gönderdiği isteği yanıtlamaya çalışıyor). 404.
 *
 * Üç durumu TEK kodda birleştirmek bilinçlidir: "bu id var ama senin
 * değil" demek, başkasının arkadaşlık kaydının VARLIĞINI sızdırırdı
 * (`HorseNotFoundError`'ın `horses.id` için aldığı ÖNLEMLE AYNI
 * kategoridedir — bkz. o hatanın 404 davranışı). Üçüncü durum da aynı
 * kapıya düşer çünkü yanıtlayanın gözünde "bana gelmiş bir istek"
 * yoktur; kendi isteğini kabul etmek diye bir işlem yoktur.
 */
export class FriendshipNotFoundError extends Error {
  constructor(friendshipId: string) {
    super(`Arkadaşlık kaydı bulunamadı: ${friendshipId}`);
    this.name = 'FriendshipNotFoundError';
  }
}

/**
 * Mesaj göndermek için arkadaş olmak gerekir. 403.
 *
 * NEDEN 403 (400/409 DEĞİL): bu bir GİRDİ hatası değil (gövde geçerli),
 * geçici bir durum da değil — istek sahibinin o kaynağa YETKİSİ yoktur
 * (`ForbiddenError` ile AYNI kategori). Arkadaşlık kurulduğunda AYNI
 * istek başarılı olur, yani istemci için "izin iste" anlamı taşır.
 *
 * Bu kural, istenmeyen mesajları (spam/taciz) YAPISAL olarak engeller:
 * mesaj atabilmek için karşı tarafın isteği KABUL etmiş olması gerekir.
 */
export class NotFriendsError extends Error {
  constructor(public readonly recipientId: string) {
    super('Mesaj gönderebilmek için önce arkadaş olmanız gerekir.');
    this.name = 'NotFriendsError';
  }
}

/**
 * Mesaj gövdesi geçersiz: boş, yalnızca boşluk ya da azami uzunluğu aşmış.
 * 400.
 *
 * `reason` alanı, `RaceNotWatchableError`'daki AYNI desenle, çağıranın
 * kullanıcıya AYRI bir açıklama gösterebilmesi içindir — ama tek bir kod
 * (`INVALID_MESSAGE_BODY`) altında döner, çünkü kullanıcıya söylenen şey
 * aynıdır: "bu mesaj gönderilemez".
 */
export class InvalidMessageBodyError extends Error {
  constructor(
    public readonly reason: 'EMPTY' | 'TOO_LONG' | 'NOT_A_STRING',
    public readonly maxLength: number,
  ) {
    super(
      reason === 'TOO_LONG'
        ? `Mesaj en fazla ${maxLength} karakter olabilir.`
        : 'Mesaj boş olamaz.',
    );
    this.name = 'InvalidMessageBodyError';
  }
}

/**
 * Arkadaşlık isteği yanıtı `accept`/`reject` dışında bir değer. 400.
 *
 * `@IsIn` dekoratörü TEK BAŞINA YETERLİ DEĞİLDİR (CLAUDE.md "Kardeş tuzak":
 * Vitest/esbuild altında DTO dekoratörleri sessizce atlanır) — bu yüzden
 * doğrulama domain'de, bu hatayla YAPILIR.
 */
export class InvalidFriendshipActionError extends Error {
  constructor(public readonly value: unknown) {
    super(`Geçersiz arkadaşlık işlemi: "${String(value)}" — "accept" veya "reject" olmalıdır.`);
    this.name = 'InvalidFriendshipActionError';
  }
}

/**
 * Sosyal tavan aşıldı: arkadaş listesi ya da bekleyen istek sayısı
 * `config/social.config.json`'daki sınırı geçti. 409.
 *
 * **Neden var (spam savunması):** arkadaşlık isteği, karşı tarafa
 * BİLDİRİM üreten tek uç noktadır. Sınırsız bırakılırsa tek bir hesap
 * tüm sunucuya istek yağdırabilir. `NotFriendsError`'ın mesaj yolunda
 * kurduğu yapısal engelin İSTEK yolundaki karşılığıdır.
 *
 * **Neden 409 (400 değil):** gövde geçerlidir; engel o anki SAYIMA
 * bağlıdır ve arkadaş silindiğinde kendiliğinden kalkar
 * (`FriendshipAlreadyExistsError` ile AYNI kategori).
 */
export class SocialLimitReachedError extends Error {
  constructor(
    public readonly reason: 'FRIENDS' | 'PENDING_REQUESTS',
    public readonly limit: number,
  ) {
    super(
      reason === 'FRIENDS'
        ? `Arkadaş listesi sınırına ulaştınız (en fazla ${limit}).`
        : `Bekleyen arkadaşlık isteği sınırına ulaştınız (en fazla ${limit}).`,
    );
    this.name = 'SocialLimitReachedError';
  }
}
