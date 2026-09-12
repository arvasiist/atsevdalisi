/**
 * Kulüp (Club) — brief §44: "Kulüp adı, Logo, Üyeler, Kulüp seviyesi, Kulüp
 * puanı, Kulüp sıralaması, Kulüp sohbeti, Kulüp yarışları, Kulüp görevleri."
 *
 * Kapsam notu: "Kulüp sıralaması" `domain/ranking/leaderboard.ts` ile
 * (scope='club') zaten karşılanır; "Kulüp sohbeti/yarışları/görevleri"
 * gerçek zamanlı/içerik sistemleridir ve bu oturumun kapsamı dışındadır
 * (bkz. README.md "Kapsam dışı"). Bu dosya sadece kulüp ÜYELİK ve
 * SEVİYE/PUAN mekaniğini kapsar.
 *
 * Fonksiyonlar saftır; `id` (UUID) üretimi application katmanının
 * sorumluluğundadır (bkz. `domain/market/market.ts` ile aynı desen).
 */

import type { OnlineConfig } from '@at-sevdalisi/game-config';
import type { Club, ClubMembership, ClubRole } from '@at-sevdalisi/shared-types';
import {
  AlreadyClubMemberError,
  ClubFullError,
  ClubLeaderCannotLeaveError,
  InsufficientClubPermissionError,
  NotClubMemberError,
} from './errors';

export interface CreateClubInput {
  id: string;
  name: string;
  tag: string | null;
  logoId: string | null;
  leaderId: string;
  now?: Date;
}

/** Yeni bir kulüp oluşturur; kurucu otomatik olarak `leader` rolüyle ilk üye olur. */
export function createClub(input: CreateClubInput): { club: Club; leaderMembership: ClubMembership } {
  const now = input.now ?? new Date();
  const club: Club = {
    id: input.id,
    name: input.name,
    tag: input.tag,
    logoId: input.logoId,
    leaderId: input.leaderId,
    level: 1,
    points: 0,
    createdAt: now.toISOString(),
  };

  const leaderMembership: ClubMembership = {
    clubId: club.id,
    playerId: input.leaderId,
    role: 'leader',
    contributionPoints: 0,
    joinedAt: now.toISOString(),
  };

  return { club, leaderMembership };
}

/**
 * Bir oyuncunun kulübe katılmasını doğrular ve yeni üyelik kaydını üretir.
 * `existingMemberships`, TÜM kulüplerdeki (sadece bu kulüpteki değil) mevcut
 * üyeliklerini içermelidir — brief §44'te açık değildir ama tek kulüp
 * üyeliği (aynı anda başka bir kulübe üye olamama) evrensel bir kulüp
 * sistemi kuralıdır.
 */
export function joinClub(
  club: Club,
  playerId: string,
  currentMemberCount: number,
  playerHasAnyClubMembership: boolean,
  config: OnlineConfig,
  now: Date = new Date(),
): ClubMembership {
  if (playerHasAnyClubMembership) {
    throw new AlreadyClubMemberError(playerId);
  }
  if (currentMemberCount >= config.club.maxMembers) {
    throw new ClubFullError(club.id, config.club.maxMembers);
  }

  return {
    clubId: club.id,
    playerId,
    role: 'member',
    contributionPoints: 0,
    joinedAt: now.toISOString(),
  };
}

/** Kulüp liderinin ayrılması yasaktır (brief'te belirtilmemiştir ama liderliği devretmeden ayrılmak kulübü sahipsiz bırakır). */
export function leaveClub(membership: ClubMembership): void {
  if (membership.role === 'leader') {
    throw new ClubLeaderCannotLeaveError(membership.clubId);
  }
}

const ROLE_RANK: Record<ClubRole, number> = { member: 0, officer: 1, leader: 2 };

/** `actingMembership`, `requiredRole` VEYA daha yüksek bir role sahip mi (örn. `officer` gerektiren bir işlemi `leader` da yapabilir). */
export function assertHasClubPermission(actingMembership: ClubMembership, requiredRole: ClubRole): void {
  if (ROLE_RANK[actingMembership.role] < ROLE_RANK[requiredRole]) {
    throw new InsufficientClubPermissionError(actingMembership.playerId, requiredRole);
  }
}

/** Bir üyenin kulüpten atılmasını doğrular — yalnızca `officer`+ yapabilir, kimse lideri atamaz. */
export function kickMember(
  actingMembership: ClubMembership,
  targetMembership: ClubMembership,
  targetClubId: string,
): void {
  if (targetMembership.clubId !== targetClubId || actingMembership.clubId !== targetClubId) {
    throw new NotClubMemberError(targetMembership.playerId, targetClubId);
  }
  assertHasClubPermission(actingMembership, 'officer');
  if (targetMembership.role === 'leader') {
    throw new InsufficientClubPermissionError(actingMembership.playerId, 'leader');
  }
}

/**
 * brief §44 "Kulüp seviyesi" — `config.club.levelThresholds`'e göre TOPLAM
 * (kümülatif) kulüp puanından türetilir. `StableConfig.capacityByLevel` ile
 * aynı "eşik tablosu" deseni (bkz. `domain/stable/stable.ts`).
 */
export function calculateClubLevel(points: number, config: OnlineConfig): number {
  let level = 1;
  for (const [levelKey, threshold] of Object.entries(config.club.levelThresholds)) {
    if (points >= threshold) {
      level = Math.max(level, Number(levelKey));
    }
  }
  return level;
}

export interface AddClubPointsResult {
  club: Club;
  membership: ClubMembership;
  leveledUp: boolean;
}

/**
 * Bir üyenin kazandığı puanı hem kendi katkısına hem kulübün toplam puanına
 * ekler ve gerekiyorsa kulüp seviyesini günceller (brief §44 "Kulüp puanı
 * kulüp seviyesini belirler" — proje-içi doğal çıkarım).
 */
export function addClubPoints(
  club: Club,
  membership: ClubMembership,
  pointsGained: number,
  config: OnlineConfig,
): AddClubPointsResult {
  if (pointsGained < 0) {
    throw new Error('pointsGained negatif olamaz.');
  }

  const updatedClub: Club = { ...club, points: club.points + pointsGained };
  const updatedMembership: ClubMembership = {
    ...membership,
    contributionPoints: membership.contributionPoints + pointsGained,
  };

  const newLevel = calculateClubLevel(updatedClub.points, config);
  const leveledUp = newLevel > club.level;

  return { club: { ...updatedClub, level: newLevel }, membership: updatedMembership, leveledUp };
}
