import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CheckoutView, StoreView } from '@at-sevdalisi/shared-types';
import { loadEconomyConfig, loadStoreConfig } from '@at-sevdalisi/game-config';
import { PAYMENT_GATEWAY, type PaymentGateway, type PaymentWebhookEvent } from '../../src/application/ports/payment-gateway';
import { InvalidWebhookError } from '../../src/domain/payments/errors';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  matureAccounts,
  recordSharedFinishedRace,
  registerTestPlayer,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * GERÇEK PARA ÖDEMESİ (07.10.2026, Faz 12, migration 0068). Gerçek sağlayıcı
 * YOK; `FakeGateway` HMAC imzalı webhook'larla sağlayıcıyı taklit eder.
 * Kanıtlananlar (brief §63 exploit listesi dahil): sağlayıcı yokken mağaza
 * kapalı; sipariş açmak elmas VERMEZ; imzasız/sahte imzalı webhook reddedilir;
 * istemcinin "ödendi" diyeceği uç YOK; başarı bir kez elmas verir (aynı olay
 * ya da ikinci başarı olayı çift elmas VERMEZ); tutar uyuşmazlığı elmas
 * vermez; iade elması geri alır (harcanmışsa açık kaydedilir); sınırlar;
 * yönetim yetkisi; bakiye = başlangıç + defter.
 */
const SECRET = 'test-webhook-secret';

class FakeGateway implements PaymentGateway {
  readonly name = 'fakepay';
  readonly refunds: Array<{ paymentId: string; amountMinor: number }> = [];
  private counter = 0;

  async createCheckout(input: { orderId: string }): Promise<{ sessionId: string; checkoutUrl: string }> {
    const sessionId = `cs_${++this.counter}_${input.orderId.slice(0, 8)}`;
    return { sessionId, checkoutUrl: `https://pay.example.test/c/${sessionId}` };
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentWebhookEvent {
    const given = headers['x-fake-signature'];
    const expected = createHmac('sha256', SECRET).update(rawBody).digest('hex');
    if (typeof given !== 'string' || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new InvalidWebhookError();
    }
    return JSON.parse(rawBody.toString('utf8')) as PaymentWebhookEvent;
  }

  async refund(input: { paymentId: string; amountMinor: number }): Promise<void> {
    this.refunds.push(input);
  }
}

const store = loadStoreConfig();
const product = store.products[0]!;
// 16.10.2026 — çip paketi (satın alınan çip arkadaşa gönderilemez).
const chipProduct = store.products.find((item) => (item.chips ?? 0) > 0)!;

describe('Mağaza — sağlayıcı YOK (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    delete process.env.PAYMENT_PROVIDER;
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('katalog görünür ama satın alma kapalı: 503, sipariş yazılmaz; webhook 400', async () => {
    const player = await registerTestPlayer(app, 'Mağaza Kapalı');
    const view = (await request(app.getHttpServer()).get('/api/v1/store').set('Authorization', player.authHeader).expect(200))
      .body.data as StoreView;
    expect(view.available).toBe(false);
    expect(view.products.map((p) => p.sku)).toEqual(store.products.map((p) => p.sku));
    const response = await request(app.getHttpServer())
      .post('/api/v1/store/orders')
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ sku: product.sku })
      .expect(503);
    expect(response.body.error.code).toBe('PAYMENT_UNAVAILABLE');
    expect((await pool.query('SELECT 1 FROM payment_orders WHERE player_id = $1', [player.playerId])).rows).toHaveLength(0);
    await request(app.getHttpServer()).post('/api/v1/payments/webhook/fakepay').send({}).expect(400);
  });
});

describe('Mağaza — sahte sağlayıcıyla (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const gateway = new FakeGateway();
  let eventCounter = 0;

  beforeAll(async () => {
    app = await bootstrapTestApp((builder) => builder.overrideProvider(PAYMENT_GATEWAY).useValue(gateway));
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const gems = async (playerId: string) =>
    Number((await pool.query('SELECT gems FROM players WHERE id = $1', [playerId])).rows[0].gems);
  const checkout = (player: RegisteredTestPlayer, sku: string = product.sku) =>
    http().post('/api/v1/store/orders').set('Authorization', player.authHeader).set('Idempotency-Key', randomUUID()).send({ sku });
  const sessionOf = async (orderId: string) =>
    (await pool.query('SELECT provider_session_id FROM payment_orders WHERE id = $1', [orderId])).rows[0]
      .provider_session_id as string;
  const send = (event: Partial<PaymentWebhookEvent>, signature?: string) => {
    const body = JSON.stringify({ eventId: `evt_${++eventCounter}_${randomUUID()}`, ...event });
    const call = http().post('/api/v1/payments/webhook/fakepay').set('Content-Type', 'application/json');
    call.set('x-fake-signature', signature ?? createHmac('sha256', SECRET).update(body).digest('hex'));
    return call.send(body);
  };
  const succeeded = (sessionId: string, extra: Partial<PaymentWebhookEvent> = {}) =>
    send({
      type: 'payment_succeeded',
      sessionId,
      paymentId: `pi_${sessionId}`,
      amountMinor: product.priceMinor,
      currency: store.currency,
      ...extra,
    });
  const status = async (orderId: string) =>
    (await pool.query('SELECT status, failure_code, clawback_shortfall_gems FROM payment_orders WHERE id = $1', [orderId]))
      .rows[0];

  it('sipariş: Idempotency-Key zorunlu; bilinmeyen SKU 404; sipariş ELMAS VERMEZ, ödeme sayfası adresi döner', async () => {
    const player = await registerTestPlayer(app, 'Mağaza Sipariş');
    await http().post('/api/v1/store/orders').set('Authorization', player.authHeader).send({ sku: product.sku }).expect(400);
    expect((await checkout(player, 'gems-yok').expect(404)).body.error.code).toBe('STORE_PRODUCT_NOT_FOUND');
    const before = await gems(player.playerId);
    const data = (await checkout(player).expect(201)).body.data as CheckoutView;
    expect(data.order).toMatchObject({ sku: product.sku, gems: product.gems, amountMinor: product.priceMinor, status: 'pending' });
    expect(data.checkoutUrl).toMatch(/^https:\/\/pay\.example\.test\//);
    expect(await gems(player.playerId)).toBe(before);
    // Sağlayıcı oturum/ödeme kimliği sipariş görünümüne GİRMEZ (yalnızca ödeme sayfası adresinde).
    expect(Object.keys(data.order)).not.toContain('providerSessionId');
    expect(Object.keys(data.order)).not.toContain('providerPaymentId');
  });

  it('istemci "ödendi" diyemez: imzasız / sahte imzalı webhook 400, onay ucu YOK, elmas değişmez', async () => {
    const player = await registerTestPlayer(app, 'Mağaza Sahte');
    const order = ((await checkout(player).expect(201)).body.data as CheckoutView).order;
    const session = await sessionOf(order.id);
    const before = await gems(player.playerId);
    const body = { type: 'payment_succeeded', sessionId: session, amountMinor: product.priceMinor, currency: store.currency };
    await http().post('/api/v1/payments/webhook/fakepay').send({ eventId: 'x', ...body }).expect(400);
    await send(body, 'f'.repeat(64)).expect(400);
    await http().post(`/api/v1/store/orders/${order.id}/confirm`).set('Authorization', player.authHeader).send({ payment_success: true }).expect(404);
    expect(await gems(player.playerId)).toBe(before);
    expect((await status(order.id)).status).toBe('pending');
  });

  it('başarı bir kez elmas verir: aynı olay tekrarı ve ikinci başarı olayı çift elmas VERMEZ; defter tutar', async () => {
    const player = await registerTestPlayer(app, 'Mağaza Başarı');
    const order = ((await checkout(player).expect(201)).body.data as CheckoutView).order;
    const session = await sessionOf(order.id);
    const before = await gems(player.playerId);
    const body = JSON.stringify({
      eventId: `evt_tekrar_${order.id}`,
      type: 'payment_succeeded',
      sessionId: session,
      paymentId: `pi_${session}`,
      amountMinor: product.priceMinor,
      currency: store.currency,
    });
    const signature = createHmac('sha256', SECRET).update(body).digest('hex');
    for (let i = 0; i < 3; i += 1) {
      await http().post('/api/v1/payments/webhook/fakepay').set('Content-Type', 'application/json').set('x-fake-signature', signature).send(body).expect(200);
    }
    await succeeded(session).expect(200);
    expect(await gems(player.playerId)).toBe(before + product.gems);
    expect((await status(order.id)).status).toBe('paid');
    const receipt = (await http().get(`/api/v1/store/orders/${order.id}`).set('Authorization', player.authHeader).expect(200)).body.data;
    expect(receipt.status).toBe('paid');
    expect(receipt.paidAt).not.toBeNull();
    const ledger = await pool.query<{ total: string }>(
      "SELECT COALESCE(SUM(amount), 0)::text AS total FROM economy_transactions WHERE player_id = $1 AND currency = 'gems'",
      [player.playerId],
    );
    expect(await gems(player.playerId)).toBe(loadEconomyConfig().newPlayerStartingBalance.gems + Number(ledger.rows[0]!.total));
    // Başka oyuncu bu makbuzu göremez.
    const stranger = await registerTestPlayer(app, 'Mağaza Yabancı');
    await http().get(`/api/v1/store/orders/${order.id}`).set('Authorization', stranger.authHeader).expect(404);
  });

  it('tutar ya da para birimi uyuşmazsa elmas verilmez (AMOUNT_MISMATCH); başarısız ödeme failed', async () => {
    const player = await registerTestPlayer(app, 'Mağaza Uyuşmazlık');
    const before = await gems(player.playerId);
    const cheap = ((await checkout(player).expect(201)).body.data as CheckoutView).order;
    await succeeded(await sessionOf(cheap.id), { amountMinor: 1 }).expect(200);
    expect(await status(cheap.id)).toMatchObject({ status: 'failed', failure_code: 'AMOUNT_MISMATCH' });
    const failed = ((await checkout(player).expect(201)).body.data as CheckoutView).order;
    await send({ type: 'payment_failed', sessionId: await sessionOf(failed.id), failureCode: 'card declined' }).expect(200);
    expect(await status(failed.id)).toMatchObject({ status: 'failed', failure_code: 'CARD_DECLINED' });
    expect(await gems(player.playerId)).toBe(before);
  });

  it('iade: yönetici TALEP eder (denetim kaydı, elmas değişmez); iade webhook\'u elması geri alır; harcanmışsa açık kaydedilir', async () => {
    const player = await registerTestPlayer(app, 'Mağaza İade');
    const admin = await registerTestPlayer(app, 'Mağaza Yönetici');
    await pool.query('UPDATE players SET is_admin = true WHERE id = $1', [admin.playerId]);
    const order = ((await checkout(player).expect(201)).body.data as CheckoutView).order;
    const session = await sessionOf(order.id);
    await succeeded(session).expect(200);
    const afterPay = await gems(player.playerId);

    await http().post(`/api/v1/admin/payments/${order.id}/refund`).set('Authorization', player.authHeader).expect(403);
    await http().post(`/api/v1/admin/payments/${order.id}/refund`).set('Authorization', admin.authHeader).expect(202);
    expect(gateway.refunds.at(-1)).toEqual({ paymentId: `pi_${session}`, amountMinor: product.priceMinor });
    expect(await gems(player.playerId)).toBe(afterPay);
    const audit = await pool.query("SELECT 1 FROM admin_audit_log WHERE action = 'payment.refund_requested' AND target_id = $1", [order.id]);
    expect(audit.rows).toHaveLength(1);

    // Oyuncu elmasın bir kısmını harcamış olsun (test kurulumu).
    const spent = afterPay - 30;
    await pool.query('UPDATE players SET gems = 30 WHERE id = $1', [player.playerId]);
    await send({ type: 'payment_refunded', sessionId: session, paymentId: `pi_${session}`, amountMinor: product.priceMinor, currency: store.currency }).expect(200);
    expect(await gems(player.playerId)).toBe(0);
    expect(await status(order.id)).toMatchObject({ status: 'refunded', clawback_shortfall_gems: String(product.gems - 30) });
    expect(spent).toBeGreaterThan(0);
    const list = (await http().get('/api/v1/admin/payments').set('Authorization', admin.authHeader).expect(200)).body.data as Array<Record<string, unknown>>;
    const row = list.find((r) => r.id === order.id)!;
    expect(row).toMatchObject({ status: 'refunded', clawbackShortfallGems: product.gems - 30, username: player.username });
    expect(Object.keys(row)).not.toContain('providerSessionId');
    // İade edilmiş sipariş yeniden iade edilemez.
    await http().post(`/api/v1/admin/payments/${order.id}/refund`).set('Authorization', admin.authHeader).expect(409);
  });

  it('çip paketi (16.10.2026): başarı bir kez ÇİP verir (elmas değil); iade geri alır, açık kaydedilir; satın alınan çip hediye edilemez', async () => {
    expect(chipProduct).toBeDefined();
    const player = await registerTestPlayer(app, 'Mağaza Çip');
    const friend = await registerTestPlayer(app, 'Mağaza Çip Arkadaş');
    const admin = await registerTestPlayer(app, 'Mağaza Çip Yönetici');
    await pool.query('UPDATE players SET is_admin = true WHERE id = $1', [admin.playerId]);
    const moneyOf = async (playerId: string) =>
      Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);

    const moneyBefore = await moneyOf(player.playerId);
    const order = ((await checkout(player, chipProduct.sku).expect(201)).body.data as CheckoutView).order;
    expect(order).toMatchObject({ sku: chipProduct.sku, chips: chipProduct.chips, gems: 0 });
    // Sipariş açmak ve imzasız "ödendi" bildirimi çip VERMEZ.
    expect(await moneyOf(player.playerId)).toBe(moneyBefore);
    const session = await sessionOf(order.id);
    await send({ type: 'payment_succeeded', sessionId: session, amountMinor: chipProduct.priceMinor, currency: store.currency }, 'f'.repeat(64)).expect(400);
    expect(await moneyOf(player.playerId)).toBe(moneyBefore);
    const gemsBefore = await gems(player.playerId);
    const paid = (extra: Partial<PaymentWebhookEvent> = {}) =>
      succeeded(session, { amountMinor: chipProduct.priceMinor, ...extra });
    await paid().expect(200);
    await paid().expect(200);
    expect(await moneyOf(player.playerId)).toBe(moneyBefore + chipProduct.chips!);
    expect(await gems(player.playerId)).toBe(gemsBefore);
    const ledger = await pool.query<{ type: string; currency: string; amount: string }>(
      "SELECT type, currency, amount FROM economy_transactions WHERE player_id = $1 AND reference_id = $2",
      [player.playerId, order.id],
    );
    expect(ledger.rows).toEqual([{ type: 'chip_purchase', currency: 'money', amount: String(chipProduct.chips) }]);

    // Satın alınan çip arkadaşa gönderilemez; kazanılmış kısım gönderilebilir.
    await recordSharedFinishedRace(app, [player, friend]);
    const created = await http()
      .post(`/api/v1/players/${player.playerId}/friend-requests`)
      .set('Authorization', player.authHeader)
      .send({ addresseeId: friend.playerId })
      .expect(201);
    await http()
      .post(`/api/v1/players/${friend.playerId}/friend-requests/${created.body.data.requestId as string}/respond`)
      .set('Authorization', friend.authHeader)
      .send({ action: 'accept' })
      .expect(200);
    await matureAccounts(app, [player, friend]);
    const earned = 50;
    await pool.query('UPDATE players SET money = $2 WHERE id = $1', [player.playerId, chipProduct.chips! + earned]);
    const gift = (amount: number) =>
      http()
        .post(`/api/v1/players/${player.playerId}/gifts`)
        .set('Authorization', player.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ recipientId: friend.playerId, amount, currency: 'money' });
    const refused = await gift(earned + 1).expect(409);
    expect(refused.body.error.code).toBe('GIFT_LIMIT_EXCEEDED');
    await gift(earned).expect(201);

    // İade: harcanmış çip açığı ayrı sütunda; bakiye eksiye düşmez.
    await pool.query('UPDATE players SET money = 100 WHERE id = $1', [player.playerId]);
    await http().post(`/api/v1/admin/payments/${order.id}/refund`).set('Authorization', admin.authHeader).expect(202);
    await send({
      type: 'payment_refunded',
      sessionId: session,
      paymentId: `pi_${session}`,
      amountMinor: chipProduct.priceMinor,
      currency: store.currency,
    }).expect(200);
    expect(await moneyOf(player.playerId)).toBe(0);
    const row = (await pool.query('SELECT status, clawback_shortfall_chips, clawback_shortfall_gems FROM payment_orders WHERE id = $1', [order.id])).rows[0];
    expect(row).toMatchObject({ status: 'refunded', clawback_shortfall_chips: String(chipProduct.chips! - 100), clawback_shortfall_gems: '0' });
    const list = (await http().get('/api/v1/admin/payments').set('Authorization', admin.authHeader).expect(200)).body.data as Array<Record<string, unknown>>;
    expect(list.find((r) => r.id === order.id)).toMatchObject({ chips: chipProduct.chips, clawbackShortfallChips: chipProduct.chips! - 100 });
  });

  it('sınırlar: bekleyen sipariş sayısı; bekleyen ödeme hesap silmeyi engeller', async () => {
    const player = await registerTestPlayer(app, 'Mağaza Sınır');
    for (let i = 0; i < store.maxPendingOrders; i += 1) await checkout(player).expect(201);
    expect((await checkout(player).expect(409)).body.error.code).toBe('PAYMENT_LIMIT_REACHED');
    const check = (await http().get('/api/v1/account/deletion').set('Authorization', player.authHeader).expect(200)).body.data;
    expect(check.blockers.map((b: { code: string }) => b.code)).toContain('payment_pending');
  });
});
