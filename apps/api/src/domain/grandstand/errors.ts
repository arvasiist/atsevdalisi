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

/**
 * Tribün KONTENJANI dolduğunda fırlatılır (PHASE 7.1, 29.09.2026).
 *
 * **Neden gerekli oldu:** `races.spectator_capacity` sütunu migration
 * 0036'dan beri VARDI ama **hiçbir kod onu satılan bilet sayısıyla
 * karşılaştırmıyordu** — yani `spectator_capacity = 500` olan bir yarışa
 * 5000 bilet satılabilirdi ve bunu **ne derleyici ne hiçbir test**
 * söylerdi. Ölü bir config değeri, o değerin hiç olmamasından kötüdür
 * (`CLAUDE.md`, `aiFillEnabled` dersi): okuyan onu "kontenjan sınırı"
 * sanar.
 *
 * 409 Conflict — `RaceTicketAlreadyOwnedError` ile AYNI kategori: kalıcı
 * bir doğrulama hatası değil, o anki DOLULUK durumudur. (Yarış silinip
 * yeniden açılsa yer açılabilir; ama aynı isteği tekrarlamak düzeltmez.)
 *
 * **İkinci savunma hattı VERİTABANI DEĞİL, KİLİTTİR:** kapasite kontrolü
 * `purchaseTicket` transaction'ının İÇİNDE, `races` satırı `FOR UPDATE`
 * altındayken koşar — bu yüzden eşzamanlı iki istek kontenjanı AŞAMAZ
 * (`race_tickets` üzerinde benzersizlik kısıtı OLSAYDI bile, o kısıt
 * "aynı oyuncu iki kez" sorusunu çözer, "kaç kişi" sorusunu ÇÖZMEZ).
 */
export class TribuneFullError extends Error {
  constructor(
    public readonly raceId: string,
    public readonly capacity: number,
  ) {
    super(`Tribün kontenjanı doldu: ${raceId} (${capacity} koltuk)`);
    this.name = 'TribuneFullError';
  }
}

/**
 * `races.tribune_fee = 0` olan (ücretsiz tribünlü) bir yarışa bilet
 * satın alınmaya çalışıldığında fırlatılır (PHASE 7.1, 29.09.2026).
 *
 * **Bu bir hata değil, bir ÜRÜN KARARIDIR:** bedava bir tribün ayrı bir
 * ürün kararıdır ve o zaman bilet satın alma uç noktası hiç çağrılmaz
 * (bkz. `assertTicketPriceIsValid` doc yorumu — bu cümle orada 27.09.2026
 * dan beri yazılıydı, bu sınıf onu ÇALIŞTIRILABİLİR hâle getirir).
 *
 * Neden bir SINIF gerekti: 0 tutarlı bir defter satırı ÜRETEMEZ
 * (`economy_transactions.amount <> 0` kısıtı, migration 0019), yani bu
 * yol bulunmazsa ya 500'e düşerdi ya da — daha kötüsü — biri "0 tutarlı
 * bilet" yazmaya kalkardı.
 *
 * 409 Conflict: yarış izlenebilir DURUMDADIR, yalnızca bu uç nokta ona
 * uygun değildir. İstemcinin doğru eylemi "Bilet Al" yerine doğrudan
 * izlemeye gitmektir (`canWatchRaceWithoutTicket`).
 */
export class RaceTribuneFreeError extends Error {
  constructor(public readonly raceId: string) {
    super(`Bu yarışın tribünü ücretsiz — bilet gerekmiyor: ${raceId}`);
    this.name = 'RaceTribuneFreeError';
  }
}

/**
 * İade edilecek bilet bulunamadığında fırlatılır (PHASE 7.2, 29.09.2026).
 *
 * **Çift iadeyi engelleyen şey BUDUR** — ayrı bir `refunded_at` sütunu
 * İCAT EDİLMEDİ. `refundTicket` bilet satırını `DELETE ... RETURNING` ile
 * siler; ikinci çağrı 0 satır alır ve bu hatayı fırlatır. Satır silmek
 * burada DOĞRUDUR (yarış iptalindeki `race_entries`in AKSİNE): orada
 * silmek "aynı oyuncu yeniden katılır" kapısını açardı, burada ise
 * yeniden bilet almak ZATEN meşru bir akıştır (parasını geri alan
 * oyuncunun tekrar izlemek istemesi).
 *
 * 404 Not Found — iade var olan bir KAYNAĞI hedefler; o kaynak yoksa
 * hedef yoktur (`RaceNotFoundError` ile AYNI kategori).
 */
export class RaceTicketNotFoundError extends Error {
  constructor(raceId: string) {
    super(`İade edilecek bilet bulunamadı: ${raceId}`);
    this.name = 'RaceTicketNotFoundError';
  }
}
