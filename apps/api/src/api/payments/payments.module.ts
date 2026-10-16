import { Module } from '@nestjs/common';
import { MODERATION_REPOSITORY } from '../../application/ports/moderation.repository';
import { PAYMENT_GATEWAY } from '../../application/ports/payment-gateway';
import { PAYMENT_ORDER_REPOSITORY } from '../../application/ports/payment-order.repository';
import { PaymentsUseCase } from '../../application/use-cases/payments.use-case';
import { PostgresModerationRepository } from '../../infrastructure/admin/postgres-moderation.repository';
import { createPaymentGateway } from '../../infrastructure/payments/payment-gateways';
import { PostgresPaymentOrderRepository } from '../../infrastructure/payments/postgres-payment-order.repository';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { AdminPaymentsController, PaymentWebhookController, StoreController } from './payments.controller';

/** Mağaza + gerçek para ödemesi (07.10.2026, Faz 12, migration 0068). Sağlayıcı `PAYMENT_PROVIDER`. */
@Module({
  controllers: [StoreController, PaymentWebhookController, AdminPaymentsController],
  providers: [
    PaymentsUseCase,
    // Sipariş açma `Idempotency-Key` ister; interceptor `REDIS_CLIENT` enjekte edebilsin diye.
    IdempotencyInterceptor,
    { provide: PAYMENT_ORDER_REPOSITORY, useClass: PostgresPaymentOrderRepository },
    { provide: MODERATION_REPOSITORY, useClass: PostgresModerationRepository },
    { provide: PAYMENT_GATEWAY, useFactory: () => createPaymentGateway(process.env) },
  ],
})
export class PaymentsModule {}
