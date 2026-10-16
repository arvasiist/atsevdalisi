import type { ClubChatMessageView } from '@at-sevdalisi/shared-types';

export const CLUB_CHAT_REPOSITORY = Symbol('CLUB_CHAT_REPOSITORY');

export interface ClubChatRepository {
  /** Oyuncu bu kulübün ÜYESİ mi (yetki kapısı — her istekte DB'den). */
  isMember(playerId: string, clubId: string): Promise<boolean>;
  /** Son `limit` mesaj, ESKİDEN YENİYE. */
  list(clubId: string, limit: number): Promise<ClubChatMessageView[]>;
  insert(input: { clubId: string; playerId: string; body: string }): Promise<ClubChatMessageView>;
}
