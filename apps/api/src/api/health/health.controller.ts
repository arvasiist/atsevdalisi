import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  service: 'at-sevdalisi-api';
}

/**
 * Basit sağlık kontrolü. Deploy/monitoring altyapısının (bkz.
 * ARCHITECTURE.md §8) servisin ayakta olduğunu doğrulaması için kullanılır.
 * İş mantığı içermez.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'at-sevdalisi-api',
    };
  }
}
