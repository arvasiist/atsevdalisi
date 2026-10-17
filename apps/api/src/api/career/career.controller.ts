import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import type { ApiSuccess, CareerView } from '@at-sevdalisi/shared-types';
import { GetCareerUseCase } from '../../application/use-cases/get-career.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * KARİYER (16.10.2026, brief §10) — `GET /career`: yalnızca çağıranın kendi
 * kariyeri (kimlik token'dan). Hiçbir şey yazmaz; kademe ödülleri başarım
 * ucundan alınır (`career_points`).
 */
@Controller('career')
export class CareerController {
  constructor(@Inject(GetCareerUseCase) private readonly getCareer: GetCareerUseCase) {}

  @RateLimit({ name: 'career-view', limit: 60, windowSeconds: 60, keyBy: 'player' })
  @Get()
  @HttpCode(HttpStatus.OK)
  async view(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<CareerView>> {
    return { success: true, data: await this.getCareer.execute(player.id) };
  }
}
