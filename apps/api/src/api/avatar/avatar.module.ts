import { Module } from '@nestjs/common';
import { AVATAR_GENERATION_PROVIDER } from '../../application/ports/avatar-generation.provider';
import { AVATAR_JOB_REPOSITORY } from '../../application/ports/avatar-job.repository';
import { AVATAR_REPOSITORY } from '../../application/ports/avatar.repository';
import { COSMETICS_REPOSITORY } from '../../application/ports/cosmetics.repository';
import { CosmeticsUseCase } from '../../application/use-cases/cosmetics.use-case';
import { PostgresCosmeticsRepository } from '../../infrastructure/cosmetics/postgres-cosmetics.repository';
import { CosmeticsController } from '../cosmetics/cosmetics.controller';
import { AVATAR_STORAGE } from '../../application/ports/avatar-storage';
import { PROFILE_PHOTO_REPOSITORY } from '../../application/ports/profile-photo.repository';
import { MODERATION_REPOSITORY } from '../../application/ports/moderation.repository';
import { AvatarGenerationUseCase } from '../../application/use-cases/avatar-generation.use-case';
import { AvatarUseCase } from '../../application/use-cases/avatar.use-case';
import { ProfilePhotoUseCase } from '../../application/use-cases/profile-photo.use-case';
import { PostgresModerationRepository } from '../../infrastructure/admin/postgres-moderation.repository';
import {
  createAvatarGenerationProvider,
  createAvatarStorage,
} from '../../infrastructure/avatar/avatar-generation.providers';
import { PostgresAvatarJobRepository } from '../../infrastructure/avatar/postgres-avatar-job.repository';
import { PostgresAvatarRepository } from '../../infrastructure/avatar/postgres-avatar.repository';
import { PostgresProfilePhotoRepository } from '../../infrastructure/avatar/postgres-profile-photo.repository';
import { AvatarGenerationScheduler } from '../../infrastructure/scheduler/avatar-generation.scheduler';
import {
  AdminAvatarJobsController,
  AvatarGenerationAvailableGuard,
  AvatarGenerationController,
} from './avatar-generation.controller';
import { AvatarController } from './avatar.controller';
import { AdminProfilePhotoController, ProfilePhotoController } from './profile-photo.controller';

/**
 * Avatar (07.10.2026): manuel avatar (8-A, migration 0066) + selfie → AI
 * avatar hattı (8-B, migration 0067). Sağlayıcı ve depo ortam değişkeninden
 * (`AVATAR_PROVIDER`, `AVATAR_STORAGE_DIR`); e2e sahte sağlayıcıyı
 * `overrideProvider(AVATAR_GENERATION_PROVIDER)` ile verir.
 */
@Module({
  controllers: [
    AvatarController,
    AvatarGenerationController,
    AdminAvatarJobsController,
    ProfilePhotoController,
    AdminProfilePhotoController,
    // 09.10.2026 — kozmetik mağaza avatarın seçeneklerini açar (aynı modül).
    CosmeticsController,
  ],
  providers: [
    AvatarUseCase,
    CosmeticsUseCase,
    { provide: COSMETICS_REPOSITORY, useClass: PostgresCosmeticsRepository },
    AvatarGenerationUseCase,
    ProfilePhotoUseCase,
    AvatarGenerationScheduler,
    AvatarGenerationAvailableGuard,
    { provide: AVATAR_REPOSITORY, useClass: PostgresAvatarRepository },
    { provide: PROFILE_PHOTO_REPOSITORY, useClass: PostgresProfilePhotoRepository },
    { provide: AVATAR_JOB_REPOSITORY, useClass: PostgresAvatarJobRepository },
    { provide: MODERATION_REPOSITORY, useClass: PostgresModerationRepository },
    { provide: AVATAR_GENERATION_PROVIDER, useFactory: () => createAvatarGenerationProvider(process.env) },
    { provide: AVATAR_STORAGE, useFactory: () => createAvatarStorage(process.env) },
  ],
  exports: [AvatarUseCase, AvatarGenerationUseCase, ProfilePhotoUseCase],
})
export class AvatarModule {}
