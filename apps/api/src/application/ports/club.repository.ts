import type { ClubDetailView, ClubInviteView, ClubMembership, ClubSummaryView } from '@at-sevdalisi/shared-types';

/**
 * Kulüp deposu (01.10.2026, migration 0049). Durum kuralları
 * (`domain/club/club.ts`) yazım metotlarında KİLİT ALTINDA çalışır:
 * "kulüp dolu mu", "yetkisi var mı" kararı ile yazım arasında TOCTOU
 * penceresi kalmasın. Tek kulüp kuralı ayrıca `club_members.player_id`
 * birincil anahtarıyla veritabanında da zorunludur.
 */
export interface ClubRepository {
  /** Kulüp sıralaması (puana göre azalan); `search` ad/etiket içinde arar. */
  listClubs(search: string | null, limit: number): Promise<ClubSummaryView[]>;
  findDetail(clubId: string, viewerId: string): Promise<ClubDetailView | null>;
  findMembership(playerId: string): Promise<ClubMembership | null>;
  /** Kulübü ve kurucunun `leader` üyeliğini tek transaction'da yazar. */
  createClub(input: {
    id: string;
    name: string;
    tag: string | null;
    leaderId: string;
    now: Date;
  }): Promise<void>;
  joinClub(clubId: string, playerId: string, now: Date): Promise<void>;
  leaveClub(playerId: string): Promise<void>;
  kickMember(actorId: string, clubId: string, targetId: string): Promise<void>;
  changeRole(actorId: string, clubId: string, targetId: string, rawRole: unknown): Promise<void>;
  /** Yalnızca lider; kulüp ve tüm üyelikler silinir. */
  disbandClub(actorId: string, clubId: string): Promise<void>;

  /**
   * 09.10.2026 — kulüp daveti. TEK transaction: kulüp `FOR UPDATE` →
   * davet edenin subay+ üyeliği → davetli var, silinmemiş, kulüpsüz,
   * engel yok → bekleyen davet yok + kulüp sınırı → satır + `club_invite`
   * bildirimi. Davetli kullanıcı adıyla gelir (gövdede UUID yok).
   */
  inviteToClub(input: {
    inviteId: string;
    clubId: string;
    inviterId: string;
    inviteeUsername: string;
    now: Date;
    expiresAt: Date;
    maxPendingPerClub: number;
  }): Promise<void>;
  /** Oyuncunun bekleyen, süresi dolmamış davetleri (yeniden eskiye). */
  listInvitesForPlayer(playerId: string, now: Date, limit: number): Promise<ClubInviteView[]>;
  /**
   * Kabul/ret. Kilit sırası `clubs → club_invites → club_members` (katılımla
   * aynı). Kabul, katılımın tek kulüp + kapasite kuralından geçer; başarıda
   * oyuncunun diğer bekleyen davetleri `cancelled` olur. Döner: kulüp kimliği.
   */
  respondToInvite(input: { inviteId: string; playerId: string; accept: boolean; now: Date }): Promise<string>;
}

export const CLUB_REPOSITORY = Symbol('CLUB_REPOSITORY');
