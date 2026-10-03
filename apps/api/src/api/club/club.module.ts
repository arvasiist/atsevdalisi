import { Module } from '@nestjs/common';
import { CLUB_REPOSITORY } from '../../application/ports/club.repository';
import { ManageClubUseCase } from '../../application/use-cases/manage-club.use-case';
import { PostgresClubRepository } from '../../infrastructure/club/postgres-club.repository';
import { ClubController } from './club.controller';
import { ClubChatController } from './club-chat.controller';
import { CLUB_CHAT_REPOSITORY } from '../../application/ports/club-chat.repository';
import { ClubChatUseCase } from '../../application/use-cases/club-chat.use-case';
import { PostgresClubChatRepository } from '../../infrastructure/club/postgres-club-chat.repository';

/** Kulüp (brief §44, migration 0049) — 01.10.2026'da API'ye bağlandı. */
@Module({
  controllers: [ClubController, ClubChatController],
  providers: [
    ManageClubUseCase,
    { provide: CLUB_REPOSITORY, useClass: PostgresClubRepository },
    // 02.10.2026 — Faz 9 kulüp sohbeti (migration 0062).
    ClubChatUseCase,
    { provide: CLUB_CHAT_REPOSITORY, useClass: PostgresClubChatRepository },
  ],
})
export class ClubModule {}
