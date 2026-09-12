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
