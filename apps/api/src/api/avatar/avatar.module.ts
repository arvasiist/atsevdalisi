import { Module } from '@nestjs/common';
import { AVATAR_GENERATION_PROVIDER } from '../../application/ports/avatar-generation.provider';
import { AVATAR_JOB_REPOSITORY } from '../../application/ports/avatar-job.repository';
import { AVATAR_REPOSITORY } from '../../application/ports/avatar.repository';
import { AVATAR_STORAGE } from '../../application/ports/avatar-storage';
import { MODERATION_REPOSITORY } from '../../application/ports/moderation.repository';
import { AvatarGenerationUseCase } from '../../application/use-cases/avatar-generation.use-case';
import { AvatarUseCase } from '../../application/use-cases/avatar.use-case';
import { PostgresModerationRepository } from '../../infrastructure/admin/postgres-moderation.repository';
import {
  createAvatarGenerationProvider,
  createAvatarStorage,
} from '../../infrastructure/avatar/avatar-generation.providers';
import { PostgresAvatarJobRepository } from '../../infrastructure/avatar/postgres-avatar-job.repository';
import { PostgresAvatarRepository } from '../../infrastructure/avatar/postgres-avatar.repository';
import { AvatarGenerationScheduler } from '../../infrastructure/scheduler/avatar-generation.scheduler';
import {
  AdminAvatarJobsController,
  AvatarGenerationAvailableGuard,
  AvatarGenerationController,
} from './avatar-generation.controller';
import { AvatarController } from './avatar.controller';

/**
 * Avatar (07.10.2026): manuel avatar (8-A, migration 0066) + selfie → AI
 * avatar hattı (8-B, migration 0067). Sağlayıcı ve depo ortam değişkeninden
 * (`AVATAR_PROVIDER`, `AVATAR_STORAGE_DIR`); e2e sahte sağlayıcıyı
 * `overrideProvider(AVATAR_GENERATION_PROVIDER)` ile verir.
 */
@Module({
  controllers: [AvatarController, AvatarGenerationController, AdminAvatarJobsController],
  providers: [
    AvatarUseCase,
    AvatarGenerationUseCase,
    AvatarGenerationScheduler,
    AvatarGenerationAvailableGuard,
    { provide: AVATAR_REPOSITORY, useClass: PostgresAvatarRepository },
    { provide: AVATAR_JOB_REPOSITORY, useClass: PostgresAvatarJobRepository },
    { provide: MODERATION_REPOSITORY, useClass: PostgresModerationRepository },
    { provide: AVATAR_GENERATION_PROVIDER, useFactory: () => createAvatarGenerationProvider(process.env) },
    { provide: AVATAR_STORAGE, useFactory: () => createAvatarStorage(process.env) },
  ],
  exports: [AvatarUseCase, AvatarGenerationUseCase],
})
export class AvatarModule {}
