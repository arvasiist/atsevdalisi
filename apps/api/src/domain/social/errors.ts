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
    public readonly reason: 'FRIENDS' | 'PENDING_REQUESTS' | 'PENDING_INVITES',
    public readonly limit: number,
  ) {
    super(SocialLimitReachedError.messageFor(reason, limit));
    this.name = 'SocialLimitReachedError';
  }

  /**
   * Metin üretimi AYRI bir fonksiyondadır çünkü üç dalı bir üçlü operatöre
   * sığdırmak okunmaz olurdu. `switch`in `default`u yoktur: `reason`
   * birleşimi kapalıdır ve yeni bir dal eklendiğinde TypeScript burada
   * derleme hatası verir — yani metin eklemeyi UNUTMAK imkânsızdır
   * (`assertNever` deseni, `domain/race/lobby.ts` ile aynı disiplin).
   */
  private static messageFor(reason: 'FRIENDS' | 'PENDING_REQUESTS' | 'PENDING_INVITES', limit: number): string {
    switch (reason) {
      case 'FRIENDS':
        return `Arkadaş listesi sınırına ulaştınız (en fazla ${limit}).`;
      case 'PENDING_REQUESTS':
        return `Bekleyen arkadaşlık isteği sınırına ulaştınız (en fazla ${limit}).`;
      case 'PENDING_INVITES':
        return `Bekleyen yarış daveti sınırına ulaştınız (en fazla ${limit}).`;
    }
  }
}

/**
 * Kendine yarış daveti gönderilemez. 400.
 *
 * `race_invites_not_self_ck` CHECK'inin (migration 0039) uygulama
 * tarafındaki karşılığıdır — `CannotFriendSelfError`/`CannotMessageSelfError`
 * ile AYNI çift katmanlı savunma (CLAUDE.md kural 5: esbuild altında DTO
 * dekoratörleri atlanır, yani gövde çalışma anında gerçekten bozuk olabilir).
 */
export class CannotInviteSelfError extends Error {
  constructor() {
    super('Kendinizi yarışa davet edemezsiniz.');
    this.name = 'CannotInviteSelfError';
  }
}

/**
 * Davet göndermek için arkadaş olmak gerekir. 403.
 *
 * brief §16: "**Arkadaşlar** birbirlerini yarışa davet edebilsin" — kural
 * doğrudan brief'tedir. `NotFriendsError` ile AYNI gerekçe (spam/taciz
 * yapısal olarak engellenir: davet edebilmek için karşı tarafın isteği
 * KABUL etmiş olması gerekir) ama AYRI bir kod: istemci davet ekranını
 * "önce arkadaş ekle" akışına yönlendirebilmelidir.
 */
export class InviteRequiresFriendshipError extends Error {
  constructor(public readonly inviteeId: string) {
    super('Yarışa davet edebilmek için önce arkadaş olmanız gerekir.');
    this.name = 'InviteRequiresFriendshipError';
  }
}

/**
 * Davet bulunamadı, davet edilene ait değil VEYA yanıtlayan taraf davet
 * EDEN'in kendisi. 404.
 *
 * `FriendshipNotFoundError` ile AYNI üçlü birleştirme gerekçesi: "bu id var
 * ama senin değil" demek başkasının davetinin VARLIĞINI sızdırırdı.
 * Üçüncü durum (kendi gönderdiğin daveti yanıtlamaya çalışmak) da aynı
 * kapıya düşer çünkü yanıtlayanın gözünde "bana gelmiş bir davet" yoktur —
 * kendi davetini kabul etmek diye bir işlem yoktur.
 */
export class RaceInviteNotFoundError extends Error {
  constructor(inviteId: string) {
    super(`Yarış daveti bulunamadı: ${inviteId}`);
    this.name = 'RaceInviteNotFoundError';
  }
}

/**
 * Davet zaten yanıtlanmış (`accepted`/`declined`/`expired`). 409.
 *
 * NEDEN 409: gövde geçerlidir ve kaynak vardır; engelleyen şey kaynağın
 * DURUMUDUR. Aynı daveti iki kez kabul etmek geri alınamaz bir işlem
 * doğurabilirdi (davet edene ikinci bir "kabul etti" bildirimi) —
 * `FriendshipAlreadyExistsError` ile AYNI kategori.
 */
export class RaceInviteNotRespondableError extends Error {
  constructor(public readonly status: string) {
    super(`Bu davet artık yanıtlanamaz (durum: "${status}").`);
    this.name = 'RaceInviteNotRespondableError';
  }
}

/**
 * Bu yarışa şu an davet gönderilemez. 409.
 *
 * `reason` alanı `InvalidMessageBodyError`/`RaceNotWatchableError` ile AYNI
 * desenle çağırana AYRI açıklama imkânı verir; tek kod altında döner çünkü
 * kullanıcıya söylenen şey aynıdır: "bu yarışa davet gönderemezsin".
 *
 * `checkRaceJoinable`ın (`domain/race/lobby.ts`) davete uyarlanmış hâlidir —
 * ama BİLİNÇLİ olarak ondan AYRI durur: `domain/social/` `domain/race/`i
 * import etmez (katman yönü tek yönlüdür ve bu iki domain kardeştir).
 */
export class RaceNotInvitableError extends Error {
  constructor(public readonly reason: 'NOT_SCHEDULED' | 'ALREADY_STARTED') {
    super(
      reason === 'ALREADY_STARTED'
        ? 'Bu yarış başladığı için artık davet gönderilemez.'
        : 'Yalnızca planlanmış bir yarışa davet gönderilebilir.',
    );
    this.name = 'RaceNotInvitableError';
  }
}

/**
 * Bu oyuncu bu yarışa ZATEN davet edilmiş. 409.
 *
 * Kural veritabanında ZORLANIR (`race_invites_race_invitee_uq`, migration
 * 0039) ve `saveInvite`in `ON CONFLICT DO NOTHING`ı `null` döndürdüğünde
 * fırlatılır — `FriendshipAlreadyExistsError` ile AYNI desen: iki eşzamanlı
 * istekten biri satır yazar, diğeri bu hatayı alır.
 *
 * Reddedilmiş (`declined`) bir davet bu hatayı ÜRETMEZ: tekil indeks
 * `status`'tan bağımsızdır, yani aynı oyuncu aynı yarışa İKİNCİ kez davet
 * EDİLEMEZ. Bu bilinçlidir — davet bir bildirim üretir ve aynı bildirimi
 * tekrar tekrar üretmek tam olarak engellemek istediğimiz spam'dir.
 */
export class RaceInviteAlreadyExistsError extends Error {
  constructor() {
    super('Bu oyuncu bu yarışa zaten davet edilmiş.');
    this.name = 'RaceInviteAlreadyExistsError';
  }
}

/**
 * Davet yanıtı `accept`/`decline` dışında bir değer. 400.
 *
 * `InvalidFriendshipActionError` ile AYNI gerekçe: `@IsIn` TEK BAŞINA
 * YETERLİ DEĞİLDİR (CLAUDE.md kural 5) — doğrulama domain'de YAPILIR.
 */
export class InvalidRaceInviteActionError extends Error {
  constructor(public readonly value: unknown) {
    super(`Geçersiz davet işlemi: "${String(value)}" — "accept" veya "decline" olmalıdır.`);
    this.name = 'InvalidRaceInviteActionError';
  }
}

/**
 * Kendini engelleyemezsin. 400.
 *
 * `player_blocks_not_self` CHECK'inin (migration 0040) uygulama
 * tarafındaki karşılığıdır — `CannotFriendSelfError`/
 * `CannotMessageSelfError`/`CannotInviteSelfError` ile AYNI çift katmanlı
 * savunma (CLAUDE.md kural 5).
 */
export class CannotBlockSelfError extends Error {
  constructor() {
    super('Kendinizi engelleyemezsiniz.');
    this.name = 'CannotBlockSelfError';
  }
}

/**
 * Kendini şikâyet edemezsin. 400. `player_reports_not_self` CHECK'inin
 * karşılığıdır; gerekçe `CannotBlockSelfError` ile AYNI.
 */
export class CannotReportSelfError extends Error {
  constructor() {
    super('Kendinizi şikâyet edemezsiniz.');
    this.name = 'CannotReportSelfError';
  }
}

/**
 * Bu iki oyuncu arasında HERHANGİ bir yönde engel var. 403.
 *
 * **brief §33:** "Blocklanan kullanıcı: mesaj gönderemez, gift
 * gönderemez, race invite gönderemez." Bu hata, o üç yolun (ve
 * arkadaşlık isteğinin — bkz. `moderation.ts` `assertNoBlock`) ortak
 * kapısıdır.
 *
 * **NEDEN 403 (400/409 DEĞİL):** gövde geçerlidir ve ortada geçici bir
 * durum yoktur — istek sahibinin o kaynağa YETKİSİ yoktur
 * (`NotFriendsError` ile AYNI kategori). Engel kaldırıldığında AYNI istek
 * başarılı olur.
 *
 * **YÖN BİLİNÇLİ OLARAK AÇIKLANMAZ:** engelleyen de engellenen de aynı
 * mesajı alır. "Seni engelledi" demek, engellemenin sağladığı sessiz
 * mesafeyi bozardı. Engeli koyan taraf listesini `GET
 * /players/:id/blocks`tan zaten görür.
 *
 * **HANGİ İLİŞKİNİN ENGELLENDİĞİ SÖYLENMEZ:** mesaj, hediye, davet ve
 * arkadaşlık isteği aynı metni alır; ayrımı istemci zaten hangi uca
 * istek attığını bilerek yapar.
 */
export class PlayerBlockedError extends Error {
  constructor() {
    super('Bu oyuncuyla etkileşim kuramazsınız.');
    this.name = 'PlayerBlockedError';
  }
}

/**
 * Şikâyet kategorisi bilinen kümenin dışında. 400.
 *
 * `InvalidFriendshipActionError`/`InvalidRaceInviteActionError` ile AYNI
 * gerekçe: `@IsIn` TEK BAŞINA YETERLİ DEĞİLDİR (CLAUDE.md kural 5) —
 * doğrulama domain'de YAPILIR.
 */
export class InvalidReportCategoryError extends Error {
  constructor(public readonly value: unknown) {
    super(`Geçersiz şikâyet kategorisi: "${String(value)}".`);
    this.name = 'InvalidReportCategoryError';
  }
}

/**
 * Şikâyet gerekçesi geçersiz: metin değil ya da azami uzunluğu aşmış. 400.
 *
 * `InvalidMessageBodyError` ile AYNI desen (`reason` alanı çağırana AYRI
 * açıklama imkânı verir, tek kod altında döner). **BOŞ METİN GEÇERLİDİR**
 * ve `null`a indirgenir: gerekçe İSTEĞE BAĞLIDIR (brief §33 yalnızca
 * "REPORT USER" der). Boşluğu hata yapmak, kategoriyi seçmiş bir oyuncuyu
 * serbest metin yazmaya zorlardı.
 */
export class InvalidReportReasonError extends Error {
  constructor(
    public readonly reason: 'NOT_A_STRING' | 'TOO_LONG',
    public readonly maxLength: number,
  ) {
    super(
      reason === 'TOO_LONG'
        ? `Şikâyet gerekçesi en fazla ${maxLength} karakter olabilir.`
        : 'Şikâyet gerekçesi bir metin olmalıdır.',
    );
    this.name = 'InvalidReportReasonError';
  }
}

/**
 * Kaldırılacak engel yok. 404.
 *
 * **NEDEN 404 (sessiz başarı DEĞİL):** engel KOYMAK idempotenttir — istenen
 * sonuç zaten geçerliyse bu bir hata değildir. Engel KALDIRMAK ise bir
 * SİLMEDİR: istemci listesinden bir satırı sildiğinde gerçekten bir şeyin
 * silindiğini bilmelidir, yoksa bayat bir listeyle çalıştığını fark
 * etmezdi (`FriendshipNotFoundError`ın `DELETE /friends/:id` için aldığı
 * kararla AYNI ayrım).
 *
 * `blockedId` YALNIZCA gövde/kimlik bilgisidir; "bu engel başkasına mı
 * aitti" sorusu DOĞMAZ — `DELETE` zaten `blocker_id = <isteyen>` koşuluyla
 * çalışır, yani başkasının engelini kaldırmak mümkün değildir.
 */
export class BlockNotFoundError extends Error {
  constructor(blockedId: string) {
    super(`Engel kaydı bulunamadı: ${blockedId}`);
    this.name = 'BlockNotFoundError';
  }
}

/**
 * Bildirim bulunamadı ya da bu oyuncuya ait değil. 404.
 *
 * `RaceEntryNotFoundError`/`FriendshipNotFoundError` ile AYNI gerekçe:
 * başkasının bildirim kimliğini denemek de aynı yanıtı alır, yani kimliğin
 * VARLIĞI sızdırılmaz.
 */
export class NotificationNotFoundError extends Error {
  constructor(notificationId: string) {
    super(`Bildirim bulunamadı: ${notificationId}`);
    this.name = 'NotificationNotFoundError';
  }
}
