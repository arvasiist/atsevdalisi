import { Module } from '@nestjs/common';
import { REFERRAL_REPOSITORY } from '../../application/ports/referral.repository';
import { ReferralUseCase } from '../../application/use-cases/referral.use-case';
import { PostgresReferralRepository } from '../../infrastructure/social/postgres-referral.repository';
import { ReferralController } from './referral.controller';

/** 16.10.2026 — arkadaş daveti + davet ödülü (sosyal brief §7). */
@Module({
  controllers: [ReferralController],
  providers: [ReferralUseCase, { provide: REFERRAL_REPOSITORY, useClass: PostgresReferralRepository }],
})
export class ReferralModule {}
