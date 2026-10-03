import { Module } from '@nestjs/common';
import { ACHIEVEMENT_REPOSITORY } from '../../application/ports/achievement.repository';
import { AchievementUseCase } from '../../application/use-cases/achievement.use-case';
import { PostgresAchievementRepository } from '../../infrastructure/achievements/postgres-achievement.repository';
import { AchievementsController } from './achievements.controller';

/** Başarımlar (03.10.2026, migration 0064). Profil de `AchievementUseCase`i kullanır. */
@Module({
  controllers: [AchievementsController],
  providers: [AchievementUseCase, { provide: ACHIEVEMENT_REPOSITORY, useClass: PostgresAchievementRepository }],
  exports: [AchievementUseCase],
})
export class AchievementsModule {}
