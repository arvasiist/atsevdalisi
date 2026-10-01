import type { ClubDetailView, ClubMembership, ClubSummaryView } from '@at-sevdalisi/shared-types';

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
}

export const CLUB_REPOSITORY = Symbol('CLUB_REPOSITORY');
