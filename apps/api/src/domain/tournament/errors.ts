/** Turnuva (Tournament) domain'ine özgü hata tipleri — brief §35, §68. */

export class TournamentNotOpenForRegistrationError extends Error {
  constructor(public readonly tournamentId: string, public readonly status: string) {
    super(`Turnuva (${tournamentId}) kayıt için açık değil (durum: ${status}).`);
    this.name = 'TournamentNotOpenForRegistrationError';
  }
}

export class TournamentFullError extends Error {
  constructor(public readonly tournamentId: string, public readonly maxParticipants: number) {
    super(`Turnuva (${tournamentId}) dolu (maksimum ${maxParticipants} katılımcı).`);
    this.name = 'TournamentFullError';
  }
}

export class PlayerLevelTooLowError extends Error {
  constructor(public readonly playerLevel: number, public readonly minPlayerLevel: number) {
    super(`Oyuncu seviyesi (${playerLevel}) bu turnuva için yetersiz (gereken: ${minPlayerLevel}).`);
    this.name = 'PlayerLevelTooLowError';
  }
}

export class InsufficientFundsForEntryFeeError extends Error {
  constructor(public readonly required: number, public readonly available: number) {
    super(`Turnuva giriş ücreti için yetersiz bakiye (gereken: ${required}, mevcut: ${available}).`);
    this.name = 'InsufficientFundsForEntryFeeError';
  }
}
