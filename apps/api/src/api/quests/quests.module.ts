import { Module } from '@nestjs/common';
import { MODERATION_REPOSITORY } from '../../application/ports/moderation.repository';
import { QUEST_REPOSITORY } from '../../application/ports/quest.repository';
import { QuestUseCase } from '../../application/use-cases/quest.use-case';
import { PostgresModerationRepository } from '../../infrastructure/admin/postgres-moderation.repository';
import { PostgresQuestRepository } from '../../infrastructure/quests/postgres-quest.repository';
import { AdminLiveEventsController, LiveEventsController, QuestsController } from './quests.controller';

/** Günlük/haftalık görevler + yönetimden etkinlik (02.10.2026, Faz 11-B, migration 0061). */
@Module({
  controllers: [QuestsController, LiveEventsController, AdminLiveEventsController],
  providers: [
    QuestUseCase,
    { provide: QUEST_REPOSITORY, useClass: PostgresQuestRepository },
    { provide: MODERATION_REPOSITORY, useClass: PostgresModerationRepository },
  ],
})
export class QuestsModule {}
