import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type {
  AdminPaymentOrderView,
  ApiSuccess,
  CheckoutView,
  PaymentOrderView,
  StoreView,
} from '@at-sevdalisi/shared-types';
import { PaymentsUseCase } from '../../application/use-cases/payments.use-case';
import { Public } from '../auth/public.decorator';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * MAĞAZA (07.10.2026, Faz 12). Oyuncu kimliği YALNIZCA token'dan; gövdede
 * yalnızca SKU vardır. "Ödendi" diyen bir istemci ucu YOKTUR ve olmayacaktır.
 */
@Controller('store')
export class StoreController {
  constructor(@Inject(PaymentsUseCase) private readonly payments: PaymentsUseCase) {}

  @Get()
  store(): ApiSuccess<StoreView> {
    return { success: true, data: this.payments.store() };
  }

  /** Tekrar koruması `Idempotency-Key`: ağ kopması ikinci bir ödeme oturumu açmasın. */
  @RateLimit({ name: 'store-checkout', limit: 10, windowSeconds: 3600, keyBy: 'player' })
  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @IdempotencyScope('player')
  async checkout(
    @Body() body: { sku?: unknown } | undefined,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<CheckoutView>> {
    return { success: true, data: await this.payments.checkout(player.id, body?.sku) };
  }

  @Get('orders')
  async orders(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<PaymentOrderView[]>> {
    return { success: true, data: await this.payments.listOrders(player.id) };
  }

  @Get('orders/:orderId')
  async order(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<PaymentOrderView>> {
    return { success: true, data: await this.payments.getOrder(player.id, orderId) };
  }
}

/**
 * SAĞLAYICI WEBHOOK'U (07.10.2026). `@Public` çünkü çağıran sağlayıcıdır;
 * güven İMZADAN gelir (ham gövde, `PaymentGateway.parseWebhook`). Gövde
 * loglanmaz (ödeme ayrıntısı).
 */
@Controller('payments')
export class PaymentWebhookController {
  constructor(@Inject(PaymentsUseCase) private readonly payments: PaymentsUseCase) {}

  @Public()
  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<ApiSuccess<{ received: true }>> {
    return { success: true, data: await this.payments.handleWebhook(provider, request.rawBody, headers) };
  }
}

/** Yönetim — ödemeler + iade talebi (yalnızca yönetici, denetim kaydıyla). */
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(@Inject(PaymentsUseCase) private readonly payments: PaymentsUseCase) {}

  @Get()
  async list(@CurrentPlayer() actor: AuthenticatedPlayer): Promise<ApiSuccess<AdminPaymentOrderView[]>> {
    return { success: true, data: await this.payments.listForAdmin(actor.id) };
  }

  @RateLimit({ name: 'admin-payment-refund', limit: 20, windowSeconds: 300, keyBy: 'player' })
  @Post(':orderId/refund')
  @HttpCode(HttpStatus.ACCEPTED)
  async refund(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentPlayer() actor: AuthenticatedPlayer,
  ): Promise<ApiSuccess<{ requested: true }>> {
    return { success: true, data: await this.payments.requestRefund(actor.id, orderId) };
  }
}
