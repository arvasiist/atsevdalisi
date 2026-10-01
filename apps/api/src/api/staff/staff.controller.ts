import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type {
  ApiSuccess,
  StaffHireResult,
  StaffOverview,
  StaffView,
} from '@at-sevdalisi/shared-types';
import { ManageStaffUseCase } from '../../application/use-cases/manage-staff.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * Personel uçları (brief §33, 01.10.2026). Oyuncu TOKEN'dan gelir.
 * `hire`/`renew` PARA YOLUDUR ama `IdempotencyInterceptor` taşımaz — jokey
 * kiralamayla aynı gerekçe: tekrar DURUMLA engellenir (sahipli aday 409,
 * pencere dışı yenileme 409), ikinci bir ödeme mümkün değildir.
 */
@Controller('staff')
export class StaffController {
  constructor(@Inject(ManageStaffUseCase) private readonly staff: ManageStaffUseCase) {}

  @Get()
  async overview(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<StaffOverview>> {
    return { success: true, data: await this.staff.overview(player.id) };
  }

  @Post(':staffId/hire')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'staff-hire', limit: 10, windowSeconds: 60, keyBy: 'player' })
  async hire(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<StaffHireResult>> {
    return { success: true, data: await this.staff.hire(player.id, staffId) };
  }

  @Post(':staffId/renew')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'staff-renew', limit: 10, windowSeconds: 60, keyBy: 'player' })
  async renew(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<StaffHireResult>> {
    return { success: true, data: await this.staff.renew(player.id, staffId) };
  }

  @Post(':staffId/release')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'staff-release', limit: 10, windowSeconds: 60, keyBy: 'player' })
  async release(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<StaffView>> {
    return { success: true, data: await this.staff.release(player.id, staffId) };
  }
}
