import { Inject, Injectable } from '@nestjs/common';
import type { ClubChatMessageView } from '@at-sevdalisi/shared-types';
import { NotClubMemberError } from '../../domain/club/errors';
import { normalizeMessageBody } from '../../domain/social/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { CLUB_CHAT_REPOSITORY, type ClubChatRepository } from '../ports/club-chat.repository';

/**
 * KULÜP SOHBETİ (02.10.2026, Faz 9, brief §53). Okuma ve yazma YALNIZCA
 * üyelere (403 `NOT_CLUB_MEMBER`, kulübün varlığını da sızdırmaz). Gövde
 * yarış sohbetiyle AYNI kuralla doğrulanır (`normalizeMessageBody`).
 */
@Injectable()
export class ClubChatUseCase {
  constructor(
    @Inject(CLUB_CHAT_REPOSITORY) private readonly repository: ClubChatRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async list(playerId: string, clubId: string): Promise<ClubChatMessageView[]> {
    if (!(await this.repository.isMember(playerId, clubId))) throw new NotClubMemberError(playerId, clubId);
    return this.repository.list(clubId, this.config.chat.clubChat.historyLimit);
  }

  async send(playerId: string, clubId: string, body: unknown): Promise<ClubChatMessageView> {
    if (!(await this.repository.isMember(playerId, clubId))) throw new NotClubMemberError(playerId, clubId);
    const normalized = normalizeMessageBody(body, this.config.chat.maxMessageLength);
    try {
      return await this.repository.insert({ clubId, playerId, body: normalized });
    } catch (error) {
      // Kontrolden sonra üyelikten çıkarıldı: satır eklenmedi.
      if (error instanceof Error && error.message === 'NOT_MEMBER') throw new NotClubMemberError(playerId, clubId);
      throw error;
    }
  }
}
