import type { AnnouncementLevel, AssignableRole, SanctionKind, ModerationRole } from '@at-sevdalisi/shared-types';
import type { ModerationConfig } from '@at-sevdalisi/game-config';
import {
  AdminRequiredError,
  InvalidAnnouncementError,
  InvalidRoleChangeError,
  InvalidSanctionError,
  SanctionTargetNotAllowedError,
} from './errors';

/**
 * PERSONEL YETKİLERİ (02.10.2026, Faz 10 + 11-A) — saf, framework'süz.
 *
 * Rol veritabanındaki iki bayraktan TÜRETİLİR (`is_admin`, `is_moderator`);
 * yönetici moderatörün her yetkisine sahiptir. Yetki tablosu kapalı bir
 * kümedir — yeni bir yetki eklerken HER rol için açıkça karar verilir.
 */
export type StaffPermission =
  | 'reports.manage'
  | 'players.view'
  | 'sanctions.suspend'
  | 'sanctions.ban'
  | 'sanctions.lift_ban'
  | 'roles.manage'
  | 'announcements.manage'
  | 'events.manage'
  | 'admin.full';

export const STAFF_PERMISSIONS: Readonly<Record<ModerationRole, readonly StaffPermission[]>> = {
  moderator: ['reports.manage', 'players.view', 'sanctions.suspend'],
  admin: [
    'reports.manage',
    'players.view',
    'sanctions.suspend',
    'sanctions.ban',
    'sanctions.lift_ban',
    'roles.manage',
    'announcements.manage',
    'events.manage',
    'admin.full',
  ],
};

export function resolveStaffRole(isAdmin: boolean, isModerator: boolean): ModerationRole | null {
  if (isAdmin) return 'admin';
  if (isModerator) return 'moderator';
  return null;
}

/** Yetkisizse 403 `ADMIN_REQUIRED` (mevcut kod; yön sızdırmaz). */
export function assertStaffPermission(role: ModerationRole | null, permission: StaffPermission): ModerationRole {
  if (role === null || !STAFF_PERMISSIONS[role].includes(permission)) {
    throw new AdminRequiredError();
  }
  return role;
}

const MS_PER_HOUR = 60 * 60 * 1000;

export interface SanctionDecision {
  kind: SanctionKind;
  reason: string;
  expiresAt: Date | null;
}

/**
 * Yaptırım girdisini daraltır. Askı SÜRELİDİR (saat), yasak SÜRESİZDİR.
 * Moderatör yalnızca `moderatorMaxSuspendHours`a kadar askı verebilir;
 * yasak yalnızca yöneticinin işidir (yetki tablosu).
 */
export function decideSanction(
  raw: { kind?: unknown; reason?: unknown; durationHours?: unknown },
  actorRole: ModerationRole,
  config: ModerationConfig['sanctions'],
  now: Date,
): SanctionDecision {
  if (raw.kind !== 'suspend' && raw.kind !== 'ban') {
    throw new InvalidSanctionError("Tür 'suspend' ya da 'ban' olmalıdır.");
  }
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (reason.length < config.reasonMinLength || reason.length > config.reasonMaxLength) {
    throw new InvalidSanctionError(
      `Gerekçe ${config.reasonMinLength}-${config.reasonMaxLength} karakter olmalıdır.`,
    );
  }
  if (raw.kind === 'ban') {
    assertStaffPermission(actorRole, 'sanctions.ban');
    if (raw.durationHours !== undefined && raw.durationHours !== null) {
      throw new InvalidSanctionError('Yasak süresizdir; süre verilmez.');
    }
    return { kind: 'ban', reason, expiresAt: null };
  }
  const max = actorRole === 'admin' ? config.adminMaxSuspendHours : config.moderatorMaxSuspendHours;
  const hours = raw.durationHours;
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > max) {
    throw new InvalidSanctionError(`Askı süresi 1-${max} saat arası tam sayı olmalıdır.`);
  }
  return { kind: 'suspend', reason, expiresAt: new Date(now.getTime() + hours * MS_PER_HOUR) };
}

/** Kendine ve personele yaptırım yok — personel önce rolünden alınır. */
export function assertSanctionTarget(actorId: string, targetId: string, targetRole: ModerationRole | null): void {
  if (actorId === targetId) {
    throw new SanctionTargetNotAllowedError('Kendine yaptırım uygulayamazsın.');
  }
  if (targetRole !== null) {
    throw new SanctionTargetNotAllowedError('Personele yaptırım uygulanamaz; önce rolünü kaldır.');
  }
}

export function isSanctionActive(
  sanction: { liftedAt: Date | null; expiresAt: Date | null },
  now: Date,
): boolean {
  return sanction.liftedAt === null && (sanction.expiresAt === null || sanction.expiresAt.getTime() > now.getTime());
}

/** Yasağı yalnızca yönetici kaldırır; askıyı moderatör de kaldırabilir. */
export function assertCanLift(actorRole: ModerationRole, kind: SanctionKind): void {
  assertStaffPermission(actorRole, kind === 'ban' ? 'sanctions.lift_ban' : 'sanctions.suspend');
}

export function parseLiftReason(raw: unknown, config: ModerationConfig['sanctions']): string {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < config.reasonMinLength || reason.length > config.reasonMaxLength) {
    throw new InvalidSanctionError(
      `Kaldırma gerekçesi ${config.reasonMinLength}-${config.reasonMaxLength} karakter olmalıdır.`,
    );
  }
  return reason;
}

const ASSIGNABLE_ROLES: readonly AssignableRole[] = ['player', 'moderator', 'admin'];

/** Rol değişikliği: bilinen rol olmalı; KENDİ rolünü değiştiremezsin (kilitlenmeyi ve kendini yükseltmeyi önler). */
export function parseRoleChange(actorId: string, targetId: string, raw: unknown): AssignableRole {
  if (actorId === targetId) {
    throw new InvalidRoleChangeError('Kendi rolünü değiştiremezsin.');
  }
  if (typeof raw !== 'string' || !ASSIGNABLE_ROLES.includes(raw as AssignableRole)) {
    throw new InvalidRoleChangeError("Rol 'player', 'moderator' ya da 'admin' olmalıdır.");
  }
  return raw as AssignableRole;
}

export function roleFlags(role: AssignableRole): { isAdmin: boolean; isModerator: boolean } {
  return { isAdmin: role === 'admin', isModerator: role === 'moderator' };
}

const LEVELS: readonly AnnouncementLevel[] = ['info', 'warning', 'maintenance'];
const MS_PER_DAY = 24 * MS_PER_HOUR;

export interface AnnouncementDraft {
  title: string;
  body: string;
  level: AnnouncementLevel;
  startsAt: Date;
  endsAt: Date | null;
}

function parseOptionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new InvalidAnnouncementError(`${field} ISO tarih olmalıdır.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InvalidAnnouncementError(`${field} geçerli bir tarih değil.`);
  return date;
}

/** Duyuru girdisi: sınırlı başlık/gövde, bilinen düzey, mantıklı pencere (en çok `maxDurationDays`). */
export function parseAnnouncement(
  raw: { title?: unknown; body?: unknown; level?: unknown; startsAt?: unknown; endsAt?: unknown },
  config: ModerationConfig['announcements'],
  now: Date,
): AnnouncementDraft {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (title === '' || title.length > config.titleMaxLength) {
    throw new InvalidAnnouncementError(`Başlık 1-${config.titleMaxLength} karakter olmalıdır.`);
  }
  if (body === '' || body.length > config.bodyMaxLength) {
    throw new InvalidAnnouncementError(`Metin 1-${config.bodyMaxLength} karakter olmalıdır.`);
  }
  if (typeof raw.level !== 'string' || !LEVELS.includes(raw.level as AnnouncementLevel)) {
    throw new InvalidAnnouncementError("Düzey 'info', 'warning' ya da 'maintenance' olmalıdır.");
  }
  const startsAt = parseOptionalDate(raw.startsAt, 'startsAt') ?? now;
  const endsAt = parseOptionalDate(raw.endsAt, 'endsAt');
  if (endsAt !== null && endsAt.getTime() <= startsAt.getTime()) {
    throw new InvalidAnnouncementError('Bitiş başlangıçtan sonra olmalıdır.');
  }
  const limit = startsAt.getTime() + config.maxDurationDays * MS_PER_DAY;
  if (endsAt !== null && endsAt.getTime() > limit) {
    throw new InvalidAnnouncementError(`Duyuru en fazla ${config.maxDurationDays} gün yayında kalabilir.`);
  }
  return { title, body, level: raw.level as AnnouncementLevel, startsAt, endsAt };
}

export function isAnnouncementLive(
  a: { archivedAt: Date | null; startsAt: Date; endsAt: Date | null },
  now: Date,
): boolean {
  return (
    a.archivedAt === null &&
    a.startsAt.getTime() <= now.getTime() &&
    (a.endsAt === null || a.endsAt.getTime() > now.getTime())
  );
}
