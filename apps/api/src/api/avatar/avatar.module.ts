import { Module } from '@nestjs/common';
import { AVATAR_REPOSITORY } from '../../application/ports/avatar.repository';
import { AvatarUseCase } from '../../application/use-cases/avatar.use-case';
import { PostgresAvatarRepository } from '../../infrastructure/avatar/postgres-avatar.repository';
import { AvatarController } from './avatar.controller';

/** Manuel avatar (07.10.2026, migration 0066). Profil de `AvatarUseCase`i kullanır. */
@Module({
  controllers: [AvatarController],
  providers: [AvatarUseCase, { provide: AVATAR_REPOSITORY, useClass: PostgresAvatarRepository }],
  exports: [AvatarUseCase],
})
export class AvatarModule {}
