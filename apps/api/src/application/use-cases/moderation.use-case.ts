import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminAnnouncementView,
  AnnouncementView,
  AssignableRole,
  PlayerSanctionView,
} from '@at-sevdalisi/shared-types';
import { loadModerationConfig } from '@at-sevdalisi/game-config';
import {
  AnnouncementLimitReachedError,
  AnnouncementNotFoundError,
  SanctionNotFoundError,
} from '../../domain/admin/errors';
import {
  assertCanLift,
  assertSanctionTarget,
  assertStaffPermission,
  decideSanction,
  isAnnouncementLive,
  isSanctionActive,
  parseAnnouncement,
  parseLiftReason,
  parseRoleChange,
} from '../../domain/admin/staff';
import { PlayerNotFoundError } from '../../domain/player/errors';
import {
  MODERATION_REPOSITORY,
  type AnnouncementRecord,
  type ModerationRepository,
  type SanctionRecord,
} from '../ports/moderation.repository';

const config = loadModerationConfig();

function toSanctionView(record: SanctionRecord, now: Date): PlayerSanctionView {
  return {
    id: record.id,
    playerId: record.playerId,
    kind: record.kind,
    reason: record.reason,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    liftedAt: record.liftedAt?.toISOString() ?? null,
    liftedBy: record.liftedBy,
    liftReason: record.liftReason,
    active: isSanctionActive(record, now),
  };
}

function toAnnouncementView(record: AnnouncementRecord): AnnouncementView {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    level: record.level,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt?.toISOString() ?? null,
  };
}

/**
 * MODERASYON + DUYURU (02.10.2026, Faz 10 + 11-A). Her işlemin İLK adımı
 * yetki kapısıdır (403 önce, 404 sonra — IDOR: var olmayan kimlikle yoklama
 * yetkisize bilgi vermez). Rol her çağrıda veritabanından okunur.
 */
@Injectable()
export class ModerationUseCase {
  constructor(@Inject(MODERATION_REPOSITORY) private readonly repository: ModerationRepository) {}

  async sanction(
    actorId: string,
    playerId: string,
    raw: { kind?: unknown; reason?: unknown; durationHours?: unknown },
    now: Date = new Date(),
  ): Promise<PlayerSanctionView> {
    const role = assertStaffPermission(await this.repository.findRole(actorId), 'sanctions.suspend');
    const decision = decideSanction(raw, role, config.sanctions, now);
    const created = await this.repository.createSanction({
      actorId,
      playerId,
      ...decision,
      now,
      check: (targetRole) => assertSanctionTarget(actorId, playerId, targetRole),
    });
    if (created === null) {
      throw new PlayerNotFoundError(playerId);
    }
    return toSanctionView(created, now);
  }

  async lift(actorId: string, sanctionId: string, rawReason: unknown, now: Date = new Date()): Promise<PlayerSanctionView> {
    const role = assertStaffPermission(await this.repository.findRole(actorId), 'sanctions.suspend');
    const reason = parseLiftReason(rawReason, config.sanctions);
    const lifted = await this.repository.liftSanction({
      actorId,
      sanctionId,
      reason,
      now,
      check: (sanction) => assertCanLift(role, sanction.kind),
    });
    if (lifted === null) {
      throw new SanctionNotFoundError();
    }
    return toSanctionView(lifted, now);
  }

  async history(actorId: string, playerId: string, now: Date = new Date()): Promise<PlayerSanctionView[]> {
    assertStaffPermission(await this.repository.findRole(actorId), 'players.view');
    const records = await this.repository.listSanctions(playerId, config.sanctions.historyLimit);
    return records.map((record) => toSanctionView(record, now));
  }

  async setRole(
    actorId: string,
    playerId: string,
    rawRole: unknown,
    now: Date = new Date(),
  ): Promise<{ from: AssignableRole; to: AssignableRole }> {
    assertStaffPermission(await this.repository.findRole(actorId), 'roles.manage');
    const role = parseRoleChange(actorId, playerId, rawRole);
    const changed = await this.repository.setRole({ actorId, playerId, role, now });
    if (changed === null) {
      throw new PlayerNotFoundError(playerId);
    }
    return changed;
  }

  async createAnnouncement(
    actorId: string,
    raw: { title?: unknown; body?: unknown; level?: unknown; startsAt?: unknown; endsAt?: unknown },
    now: Date = new Date(),
  ): Promise<AdminAnnouncementView> {
    assertStaffPermission(await this.repository.findRole(actorId), 'announcements.manage');
    const draft = parseAnnouncement(raw, config.announcements, now);
    const created = await this.repository.createAnnouncement({
      actorId,
      ...draft,
      maxLive: config.announcements.maxLive,
      now,
    });
    if (created === 'limit_reached') {
      throw new AnnouncementLimitReachedError(config.announcements.maxLive);
    }
    return this.toAdminView(created, now);
  }

  async archiveAnnouncement(actorId: string, announcementId: string, now: Date = new Date()): Promise<AdminAnnouncementView> {
    assertStaffPermission(await this.repository.findRole(actorId), 'announcements.manage');
    const archived = await this.repository.archiveAnnouncement(actorId, announcementId, now);
    if (archived === null) {
      throw new AnnouncementNotFoundError();
    }
    return this.toAdminView(archived, now);
  }

  async listAnnouncementsForAdmin(actorId: string, now: Date = new Date()): Promise<AdminAnnouncementView[]> {
    assertStaffPermission(await this.repository.findRole(actorId), 'announcements.manage');
    const records = await this.repository.listAnnouncements(config.announcements.adminListLimit);
    return records.map((record) => this.toAdminView(record, now));
  }

  /** Oyunculara açık: yalnızca şu an yayında olanlar. */
  async liveAnnouncements(now: Date = new Date()): Promise<AnnouncementView[]> {
    return (await this.repository.listLiveAnnouncements(now)).map(toAnnouncementView);
  }

  private toAdminView(record: AnnouncementRecord, now: Date): AdminAnnouncementView {
    return {
      ...toAnnouncementView(record),
      createdBy: record.createdBy,
      createdAt: record.createdAt.toISOString(),
      archivedAt: record.archivedAt?.toISOString() ?? null,
      live: isAnnouncementLive(record, now),
    };
  }
}
