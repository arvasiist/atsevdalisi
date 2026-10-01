import { Module } from '@nestjs/common';
import { CLUB_REPOSITORY } from '../../application/ports/club.repository';
import { ManageClubUseCase } from '../../application/use-cases/manage-club.use-case';
import { PostgresClubRepository } from '../../infrastructure/club/postgres-club.repository';
import { ClubController } from './club.controller';

/** Kulüp (brief §44, migration 0049) — 01.10.2026'da API'ye bağlandı. */
@Module({
  controllers: [ClubController],
  providers: [ManageClubUseCase, { provide: CLUB_REPOSITORY, useClass: PostgresClubRepository }],
})
export class ClubModule {}
