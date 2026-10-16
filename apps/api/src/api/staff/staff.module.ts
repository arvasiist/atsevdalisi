import { Module } from '@nestjs/common';
import { STAFF_REPOSITORY } from '../../application/ports/staff.repository';
import { ManageStaffUseCase } from '../../application/use-cases/manage-staff.use-case';
import { PostgresStaffRepository } from '../../infrastructure/staff/postgres-staff.repository';
import { StaffController } from './staff.controller';

/**
 * Personel (brief §33) — 01.10.2026'da bağlandı. `ManageStaffUseCase`
 * dışa açılır: antrenman ve bakım modülleri etki çarpanını ondan okur.
 */
@Module({
  controllers: [StaffController],
  providers: [ManageStaffUseCase, { provide: STAFF_REPOSITORY, useClass: PostgresStaffRepository }],
  exports: [ManageStaffUseCase],
})
export class StaffModule {}
