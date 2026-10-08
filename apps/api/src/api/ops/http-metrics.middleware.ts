import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { metrics, routeLabel } from '../../infrastructure/ops/metrics';

const NS_PER_SECOND = 1e9;

/**
 * HTTP METRİKLERİ (08.10.2026) — her isteğin yanıtı bittiğinde (`finish`)
 * sayaç + süre histogramı. Ara katman olduğu için guard reddi (401/403) ve
 * eşleşmeyen adresler (404) de sayılır; interceptor bunları görmezdi.
 * Etiket rota KALIBIDIR (`routeLabel`), kimlik/sorgu dizesi değil.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      const labels = { method: request.method, route: routeLabel(request), status: String(response.statusCode) };
      metrics.incCounter('http_requests_total', labels);
      metrics.observe(
        'http_request_duration_seconds',
        { method: labels.method, route: labels.route },
        Number(process.hrtime.bigint() - startedAt) / NS_PER_SECOND,
      );
    });
    next();
  }
}
