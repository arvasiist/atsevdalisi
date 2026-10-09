import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ClubDetailView, ClubInviteView, ClubSummaryView } from '@at-sevdalisi/shared-types';
import { validateClubName, validateClubTag } from '../../domain/club/club';
import { ClubNotFoundError, InvalidClubInputError, NotClubMemberError } from '../../domain/club/errors';
import { validateUsername } from '../../domain/player/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { CLUB_REPOSITORY, type ClubRepository } from '../ports/club.repository';

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/**
 * Kulüp (brief §44) — 01.10.2026'ya kadar `domain/club` yalnızca birim
 * testinden çağrılıyordu (DOMAIN ONLY). Bu use-case onu API'ye bağlar.
 *
 * Girdi doğrulaması (ad/etiket/rol) DOMAIN'dedir, DTO'da değil (CLAUDE.md
 * kural 5). Durum kuralları (dolu mu, yetkisi var mı) deponun KİLİT
 * ALTINDAKİ transaction'ında çalışır.
 */
@Injectable()
export class ManageClubUseCase {
  constructor(
    @Inject(CLUB_REPOSITORY) private readonly clubs: ClubRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  list(search: unknown): Promise<ClubSummaryView[]> {
    const term =
      typeof search === 'string'
        ? search.trim().slice(0, this.config.online.club.name.maxLength)
        : '';
    return this.clubs.listClubs(term === '' ? null : term, this.config.online.club.listLimit);
  }

  async detail(clubId: string, viewerId: string): Promise<ClubDetailView> {
    const detail = await this.clubs.findDetail(clubId, viewerId);
    if (!detail) {
      throw new ClubNotFoundError(clubId);
    }
    return detail;
  }

  /** Çağıranın kulübü; üye değilse `null`. */
  async mine(playerId: string): Promise<ClubDetailView | null> {
    const membership = await this.clubs.findMembership(playerId);
    return membership ? this.clubs.findDetail(membership.clubId, playerId) : null;
  }

  async create(playerId: string, rawName: unknown, rawTag: unknown): Promise<ClubDetailView> {
    const name = validateClubName(rawName, this.config.online);
    const tag = validateClubTag(rawTag, this.config.online);
    const id = randomUUID();
    await this.clubs.createClub({ id, name, tag, leaderId: playerId, now: new Date() });
    return this.detail(id, playerId);
  }

  async join(playerId: string, clubId: string): Promise<ClubDetailView> {
    await this.clubs.joinClub(clubId, playerId, new Date());
    return this.detail(clubId, playerId);
  }

  async leave(playerId: string): Promise<void> {
    await this.clubs.leaveClub(playerId);
  }

  async kick(actorId: string, clubId: string, targetId: string): Promise<ClubDetailView> {
    if (actorId === targetId) {
      // Kendini atmak "ayrılmak"tır; ayrı uçtan (lider kuralıyla) geçer.
      throw new NotClubMemberError(targetId, clubId);
    }
    await this.clubs.kickMember(actorId, clubId, targetId);
    return this.detail(clubId, actorId);
  }

  async changeRole(
    actorId: string,
    clubId: string,
    targetId: string,
    rawRole: unknown,
  ): Promise<ClubDetailView> {
    await this.clubs.changeRole(actorId, clubId, targetId, rawRole);
    return this.detail(clubId, actorId);
  }

  async disband(actorId: string, clubId: string): Promise<void> {
    await this.clubs.disbandClub(actorId, clubId);
  }

  /**
   * Davet (09.10.2026): yalnızca subay/lider, kullanıcı adıyla. Kapılar
   * (yetki, davetlinin kulübü, engel, kapasite, bekleyen sınırı) deponun
   * kulüp KİLİDİ altındaki transaction'ındadır; bildirim aynı transaction'da.
   */
  async invite(actorId: string, clubId: string, rawUsername: unknown): Promise<{ invited: true }> {
    if (typeof rawUsername !== 'string') {
      throw new InvalidClubInputError('Davet edilecek oyuncunun kullanıcı adı gerekli.');
    }
    const username = rawUsername.trim().replace(/^@/, '').toLowerCase();
    validateUsername(username);
    const { expiryDays, maxPendingPerClub } = this.config.online.club.invites;
    const now = new Date();
    await this.clubs.inviteToClub({
      inviteId: randomUUID(),
      clubId,
      inviterId: actorId,
      inviteeUsername: username,
      now,
      expiresAt: new Date(now.getTime() + expiryDays * MS_PER_DAY),
      maxPendingPerClub,
    });
    return { invited: true };
  }

  /** Çağırana gelen, süresi dolmamış bekleyen davetler. */
  invites(playerId: string): Promise<ClubInviteView[]> {
    return this.clubs.listInvitesForPlayer(playerId, new Date(), this.config.online.club.invites.listLimit);
  }

  /** Kabul = katılım: kapasite + tek kulüp kuralı aynı kilitli yoldan. */
  async acceptInvite(playerId: string, inviteId: string): Promise<ClubDetailView> {
    const clubId = await this.clubs.respondToInvite({ inviteId, playerId, accept: true, now: new Date() });
    return this.detail(clubId, playerId);
  }

  async declineInvite(playerId: string, inviteId: string): Promise<{ declined: true }> {
    await this.clubs.respondToInvite({ inviteId, playerId, accept: false, now: new Date() });
    return { declined: true };
  }
}
