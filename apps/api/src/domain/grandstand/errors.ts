/**
 * Tribün (grandstand) domain'ine özgü hata tipleri — proje sahibinin açık
 * talebi (27.09.2026): "yarış yapılan yerlerde tribüne ücretli girişler
 * olsun insanlar yarışları izleyebilsin".
 *
 * `domain/race/errors.ts` ile AYNI ilke: bu sınıflar NestJS/HTTP BİLMEZ
 * (framework'süz saf TS — `CLAUDE.md` "KATMAN YÖNÜ TEK YÖNLÜ"), HTTP
 * durum kodlarına eşleme TEK bir yerde, `api/middleware/
 * http-exception.filter.ts`'te yapılır.
 */

/**
 * Aynı oyuncu aynı yarışa İKİNCİ kez bilet almaya çalıştığında fırlatılır.
 *
 * 409 Conflict — `InsufficientFundsError`/`DailyFeedLimitReachedError` ile
 * AYNI kategori: KALICI bir doğrulama hatası DEĞİL, o anki duruma bağlı bir
 * engeldir (aynı isteği tekrarlamak düzeltmez ama başka bir yarış
 * seçilebilir — bu yüzden 400 değil 409).
 *
 * İkinci savunma hattı VERİTABANIDIR: `race_tickets_unique_per_player`
 * kısıtı, bu kontrolün eşzamanlı isteklerde yarış durumuna (race condition)
 * girmesini yapısal olarak imkânsız kılar — iki istek aynı anda geçse bile
 * ikincisi 23505 ile düşer ve transaction'ı (dolayısıyla çift tahsilatı)
 * geri alır.
 */
export class RaceTicketAlreadyOwnedError extends Error {
  constructor(raceId: string) {
    super(`Bu yarış için zaten bir biletiniz var: ${raceId}`);
    this.name = 'RaceTicketAlreadyOwnedError';
  }
}

/**
 * Bilet satın alınmak istenen yarış "izlenebilir" değilse fırlatılır.
 *
 * `reason` alanı, `HorseNotReadyToRaceError`'daki AYNI desenle, çağıranın
 * kullanıcıya AYRI bir açıklama gösterebilmesi içindir — ama bu hata
 * `HorseNotReadyToRaceError`'ın AKSİNE tek bir kod altında (409
 * `RACE_NOT_WATCHABLE`) döner, çünkü üç durumun da kullanıcıya söylediği
 * şey aynıdır: "bu yarışı şu an izleyemezsin".
 *
 * 409 Conflict — geçici/duruma bağlı bir engeldir (yarış henüz bitmemiş
 * olabilir), kalıcı bir doğrulama hatası değildir.
 */
export class RaceNotWatchableError extends Error {
  constructor(
    public readonly raceId: string,
    public readonly reason: 'RACE_NOT_FINISHED' | 'WATCH_WINDOW_EXPIRED' | 'OWN_RACE',
  ) {
    super(`Bu yarış izlenebilir değil: ${raceId} (${reason})`);
    this.name = 'RaceNotWatchableError';
  }
}

/**
 * `GetRaceTimelineUseCase`'in yetkilendirme kapısında fırlatılır: istek
 * sahibi ne bu yarışın katılımcısı ne de bilet sahibidir.
 *
 * `domain/auth/errors.ts`'teki `ForbiddenError`'ı YENİDEN KULLANMAK yerine
 * AYRI bir sınıf: istemcinin 403'ü "Bilet Al" akışına yönlendirebilmesi
 * için `RACE_TICKET_REQUIRED` kodunu ayırt edebilmesi gerekir (bkz.
 * `error-codes.ts`'teki aynı gerekçe). HTTP durumu yine 403'tür —
 * `ForbiddenError` ile AYNI.
 *
 * Bilgi sızdırmama ilkesi KORUNUR: bu hata yalnızca yarışın VAR OLDUĞU
 * doğrulandıktan SONRA fırlatılır (bkz. `GetRaceTimelineUseCase`), yani
 * "yarış yok" (404) ile "yetkin yok" (403) ayrımı değişmez.
 */
export class RaceTicketRequiredError extends Error {
  constructor(raceId: string) {
    super(`Bu yarışı izlemek için tribün bileti gerekiyor: ${raceId}`);
    this.name = 'RaceTicketRequiredError';
  }
}
