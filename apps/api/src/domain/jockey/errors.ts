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
