/** Jokey (jockey) domain'ine özgü hata tipleri (brief §13). */

export class JockeyAlreadyOwnedError extends Error {
  constructor(public readonly jockeyId: string) {
    super(`Jokey (${jockeyId}) zaten başka bir oyuncuya ait.`);
    this.name = 'JockeyAlreadyOwnedError';
  }
}

/** İstenen jokey yok (404) — `hire` ve okuma uçlarının ortak hatası. */
export class JockeyNotFoundError extends Error {
  constructor(public readonly jockeyId: string) {
    super(`Jokey (${jockeyId}) bulunamadı.`);
    this.name = 'JockeyNotFoundError';
  }
}

/**
 * Oyuncunun ZATEN bir jokeyi var (409).
 *
 * **NEDEN AYRI BİR HATA:** `JockeyAlreadyOwnedError` "jokey başkasında"
 * demektir, bu ise "senin zaten bir jokeyin var" der. İkisini tek hatada
 * birleştirmek, istemciye yanlış bir eylem önerirdi ("başka jokey seç"
 * yerine "önce mevcut jokeyini bırak"). Aynı ayrım `AlreadyJoinedRaceError`
 * ile `RaceFullError` arasında da vardır.
 */
export class JockeyAlreadyHiredError extends Error {
  constructor(public readonly currentJockeyId: string) {
    super(`Zaten bir jokeyin var (${currentJockeyId}). Önce onu bırakmalısın.`);
    this.name = 'JockeyAlreadyHiredError';
  }
}

/**
 * Jokey serbest bırakılabilir DEĞİL (409) — `release` yolu.
 *
 * **İKİ ALT DURUM, TEK HATA:** (1) jokey zaten sahipsiz (`owner_id IS NULL`
 * — ya hiç kiralanmamış ya da daha önce bırakılmış), (2) jokey BAŞKA bir
 * oyuncuda. İkisi AYNI kodla döner ve bu bilinçlidir: ayrılsaydı, kimlik
 * deneyen bir oyuncu "bu jokey birinin mi" sorusunu yanıtlardı. Aynı
 * gerekçe `PLAYER_BLOCKED` içindir (PROJE_DURUMU §13.16) — engelleme gibi
 * burada da sızması gereken bilgi YOKTUR.
 *
 * **`JockeyNotFoundError` DEĞİL:** o "böyle bir satır yok" demektir ve
 * jokey kimliği zaten herkese açık vitrinde görünür; var olan bir satır
 * için "bulunamadı" demek, istemciye yanlış bir eylem önerirdi.
 *
 * **İDEMPOTENCY:** ikinci bırakma bu hatayı alır — koruma anahtar değil
 * DURUM GEÇİŞİDİR (`hire`in `JockeyAlreadyOwnedError`ıyla AYNI desen).
 */
export class JockeyNotOwnedError extends Error {
  constructor(public readonly jockeyId: string) {
    super(`Jokey (${jockeyId}) senin değil — serbest bırakılamaz.`);
    this.name = 'JockeyNotOwnedError';
  }
}
