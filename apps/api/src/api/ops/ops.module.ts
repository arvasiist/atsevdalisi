import { type MiddlewareConsumer, Module, type NestModule, type OnModuleInit, RequestMethod } from '@nestjs/common';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import { AlertingErrorReporter, AlertThrottle, WebhookAlertSender } from '../../infrastructure/ops/alerting';
import { LogErrorReporter, setErrorReporter } from '../../infrastructure/ops/error-reporting';
import { ClientErrorsController } from './client-errors.controller';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';

const MS_PER_SECOND = 1000;

/**
 * İŞLETİM (Faz 13-C + 08.10.2026): istemci hata raporları, `/metrics` ve
 * alarm kancası. `ALERT_WEBHOOK_URL` verilirse açılışta raporlayıcı
 * `AlertingErrorReporter` ile sarılır (her hata yine loglanır).
 */
@Module({ controllers: [ClientErrorsController, MetricsController] })
export class OpsModule implements NestModule, OnModuleInit {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }

  onModuleInit(): void {
    const url = process.env.ALERT_WEBHOOK_URL?.trim();
    if (!url) return;
    const alerts = loadOpsConfig().alerts;
    setErrorReporter(
      new AlertingErrorReporter(
        new LogErrorReporter(),
        new WebhookAlertSender(url, alerts.requestTimeoutMs),
        new AlertThrottle(alerts.cooldownSeconds * MS_PER_SECOND),
      ),
    );
  }
}
