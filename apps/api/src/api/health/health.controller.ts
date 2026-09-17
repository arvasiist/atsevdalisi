import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  service: 'at-sevdalisi-api';
}

/**
 * Basit sağlık kontrolü. Deploy/monitoring altyapısının (bkz.
 * ARCHITECTURE.md §8) servisin ayakta olduğunu doğrulaması için kullanılır.
 * İş mantığı içermez.
 *
 * AUDIT_REPORT.md Bulgu S1 hardening (bu oturum) — `@Public()`: bir
 * deploy/monitoring probu bir JWT TAŞIMAZ, bu yüzden global `AuthGuard`'dan
 * MUAF tutulur (bkz. o decorator'ın doc yorumu).
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'at-sevdalisi-api',
    };
  }
}
