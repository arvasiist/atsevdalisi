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
  InvalidClubInputError,
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

/** Harf, rakam, boşluk, tire ve alt çizgi (Türkçe harfler dahil). */
const CLUB_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u;
/** Etiket: harf/rakam, boşluksuz; büyük harfe çevrilerek saklanır. */
const CLUB_TAG_PATTERN = /^[\p{L}\p{N}]+$/u;

/**
 * Kulüp adı doğrulaması (01.10.2026). DTO'ya güvenilmez (esbuild altında
 * `class-validator` dekoratörleri atlanır — CLAUDE.md kural 5); kural burada.
 * Baştaki/sondaki boşluk atılır, iç boşluklar teke indirilir.
 */
export function validateClubName(raw: unknown, config: OnlineConfig): string {
  if (typeof raw !== 'string') {
    throw new InvalidClubInputError('Kulüp adı metin olmalıdır.');
  }
  const name = raw.trim().replace(/\s+/g, ' ');
  const { minLength, maxLength } = config.club.name;
  if (name.length < minLength || name.length > maxLength) {
    throw new InvalidClubInputError(`Kulüp adı ${minLength}-${maxLength} karakter olmalıdır.`);
  }
  if (!CLUB_NAME_PATTERN.test(name)) {
    throw new InvalidClubInputError('Kulüp adında yalnızca harf, rakam, boşluk, tire ve alt çizgi olabilir.');
  }
  return name;
}

/**
 * Ad tekilliği anahtarı: Türkçe küçük harf + noktasız ı → i ("RÜZGAR" =
 * "rüzgar", "ISIK" = "ışık" = "işik"). Veritabanının `lower()`ı `C` yerel
 * ayarında ASCII dışını küçültmez — bu yüzden anahtar burada üretilir.
 */
export function clubNameKey(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
}

/** Etiket opsiyoneldir (`null`/boş = etiketsiz); verilirse büyük harfe çevrilir. */
export function validateClubTag(raw: unknown, config: OnlineConfig): string | null {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new InvalidClubInputError('Kulüp etiketi metin olmalıdır.');
  }
  const tag = raw.trim().toLocaleUpperCase('tr-TR');
  const { minLength, maxLength } = config.club.tag;
  if (tag.length < minLength || tag.length > maxLength || !CLUB_TAG_PATTERN.test(tag)) {
    throw new InvalidClubInputError(`Kulüp etiketi ${minLength}-${maxLength} harf/rakam olmalıdır.`);
  }
  return tag;
}

const ASSIGNABLE_ROLES: readonly ClubRole[] = ['leader', 'officer', 'member'];

/**
 * Rol değişikliği (01.10.2026). Yalnızca LİDER rol atar. Lider başka bir
 * üyeye `leader` verirse liderlik DEVREDİLİR ve eski lider `officer` olur
 * (kulüp bir an bile lidersiz ya da iki liderli kalmaz). Lider kendi rolünü
 * değiştiremez (önce devretmeli).
 */
export function planRoleChange(
  acting: ClubMembership,
  target: ClubMembership,
  rawRole: unknown,
): { targetRole: ClubRole; actingRole: ClubRole } {
  if (typeof rawRole !== 'string' || !ASSIGNABLE_ROLES.includes(rawRole as ClubRole)) {
    throw new InvalidClubInputError('Rol "leader", "officer" ya da "member" olmalıdır.');
  }
  if (acting.clubId !== target.clubId) {
    throw new NotClubMemberError(target.playerId, acting.clubId);
  }
  assertHasClubPermission(acting, 'leader');
  if (acting.playerId === target.playerId) {
    throw new InsufficientClubPermissionError(acting.playerId, 'leader');
  }
  const targetRole = rawRole as ClubRole;
  return { targetRole, actingRole: targetRole === 'leader' ? 'officer' : acting.role };
}
