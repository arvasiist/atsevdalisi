/** Kulüp (Club) domain'ine özgü hata tipleri — brief §44. */

export class ClubFullError extends Error {
  constructor(public readonly clubId: string, public readonly maxMembers: number) {
    super(`Kulüp (${clubId}) dolu (maksimum ${maxMembers} üye).`);
    this.name = 'ClubFullError';
  }
}

export class AlreadyClubMemberError extends Error {
  constructor(public readonly playerId: string) {
    super(`Oyuncu (${playerId}) zaten bir kulübe üye — önce mevcut kulüpten ayrılmalı.`);
    this.name = 'AlreadyClubMemberError';
  }
}

export class NotClubMemberError extends Error {
  constructor(public readonly playerId: string, public readonly clubId: string) {
    super(`Oyuncu (${playerId}) kulübün (${clubId}) üyesi değil.`);
    this.name = 'NotClubMemberError';
  }
}

export class InsufficientClubPermissionError extends Error {
  constructor(public readonly playerId: string, public readonly requiredRole: string) {
    super(`Oyuncunun (${playerId}) bu işlem için gereken yetkisi yok (gerekli rol: ${requiredRole}).`);
    this.name = 'InsufficientClubPermissionError';
  }
}

export class ClubLeaderCannotLeaveError extends Error {
  constructor(public readonly clubId: string) {
    super(`Kulüp lideri (${clubId}) kulüpten ayrılamaz — önce liderliği devretmeli veya kulübü feshetmelidir.`);
    this.name = 'ClubLeaderCannotLeaveError';
  }
}

/** Kulüp bulunamadı (404). */
export class ClubNotFoundError extends Error {
  constructor(public readonly clubId: string) {
    super(`Kulüp bulunamadı (${clubId}).`);
    this.name = 'ClubNotFoundError';
  }
}

/** Bu adla bir kulüp zaten var (409) — ad harf duyarsız tekildir. */
export class ClubNameTakenError extends Error {
  constructor() {
    super('Bu adla bir kulüp zaten var.');
    this.name = 'ClubNameTakenError';
  }
}

/** Kulüp adı/etiketi/rolü biçimsel olarak geçersiz (400). */
export class InvalidClubInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidClubInputError';
  }
}
