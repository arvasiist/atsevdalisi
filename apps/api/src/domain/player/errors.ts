/** Oyuncu/kimlik doğrulama domain'ine özgü hata tipleri. */

export class InvalidUsernameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUsernameError';
  }
}

export class InvalidDisplayNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDisplayNameError';
  }
}

export class InvalidAuthProviderTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthProviderTokenError';
  }
}

/**
 * FAZ 1 wiring — brief §7 `players.username` UNIQUE kısıtının uygulama
 * seviyesindeki karşılığı. Benzersizlik KONTROLÜ (DB sorgusu) infrastructure
 * katmanının sorumluluğudur; bu hata sınıfı domain katmanında yaşar çünkü
 * "aynı kullanıcı adıyla iki hesap olamaz" bir İŞ KURALIDIR — tıpkı
 * `domain/club/club.ts`'teki `AlreadyClubMemberError`'ın, üyelik DURUMUNU
 * (DB'den önceden getirilmiş bir boolean/sayı olarak) parametre alıp
 * KARARI domain'de vermesiyle aynı desen (bkz. `assertUsernameAvailable`).
 */
export class UsernameAlreadyTakenError extends Error {
  constructor(public readonly username: string) {
    super(`Kullanıcı adı ("${username}") zaten kullanılıyor.`);
    this.name = 'UsernameAlreadyTakenError';
  }
}

/** FAZ 1 wiring — `GET /players/:id` gibi uç noktalarda bulunamayan oyuncu. */
export class PlayerNotFoundError extends Error {
  constructor(public readonly playerId: string) {
    super(`Oyuncu (${playerId}) bulunamadı.`);
    this.name = 'PlayerNotFoundError';
  }
}
