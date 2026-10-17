import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import type { ApiSuccess, HippodromeCatalogView } from '@at-sevdalisi/shared-types';
import { GetHippodromeCatalogUseCase } from '../../application/use-cases/get-hippodrome-catalog.use-case';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * HİPODROMLAR (16.10.2026, brief §9) — `GET /hippodromes`: ülke/şehir,
 * seviye, prestij, zemin, mesafe, ağırlanan masalar (bedel + at sayısı +
 * kazanan payı) ve pist takvimi (sıradaki saatler). Oturum ister (lobi
 * listesiyle aynı sınıf); hiçbir şey yazmaz.
 */
@Controller('hippodromes')
export class HippodromeController {
  constructor(@Inject(GetHippodromeCatalogUseCase) private readonly catalog: GetHippodromeCatalogUseCase) {}

  @RateLimit({ name: 'hippodrome-catalog', limit: 60, windowSeconds: 60, keyBy: 'player' })
  @Get()
  @HttpCode(HttpStatus.OK)
  list(): ApiSuccess<HippodromeCatalogView> {
    return { success: true, data: this.catalog.execute() };
  }
}
