import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadGiftConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  matureAccounts,
  recordSharedFinishedRace,
  registerTestPlayer,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * 16.10.2026 — sosyal brief §4/§11: arkadaşlar arası çip transferinin yeni
 * kuralları. Temel transfer (arkadaşlık, engel, bakiye, idempotency, defter)
 * `gift.e2e-spec.ts`te; burada tutar tavanları, yeni hesap, alıcı tavanı,
 * eşzamanlılık, veritabanı hatasında geri alma, satın alınmış çip ve kota.
 */
describe('Çip transferi — limitler ve güvenlik (e2e)', () => {
  const gift = loadGiftConfig();
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function friends(a: RegisteredTestPlayer, b: RegisteredTestPlayer): Promise<void> {
    await recordSharedFinishedRace(app, [a, b]);
    const created = await http()
      .post(`/api/v1/players/${a.playerId}/friend-requests`)
      .set('Authorization', a.authHeader)
      .send({ addresseeId: b.playerId })
      .expect(201);
    await http()
      .post(`/api/v1/players/${b.playerId}/friend-requests/${created.body.data.requestId as string}/respond`)
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(200);
  }

  const setMoney = (playerId: string, money: number) =>
    pool.query('UPDATE players SET money = $2 WHERE id = $1', [playerId, money]);
  const money = async (playerId: string) =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);

  const send = (sender: RegisteredTestPlayer, recipientId: string, amount: number, key: string = randomUUID()) =>
    http()
      .post(`/api/v1/players/${sender.playerId}/gifts`)
      .set('Authorization', sender.authHeader)
      .set('Idempotency-Key', key)
      .send({ recipientId, amount, currency: 'money' });

  async function pair(label: string, mature = true): Promise<[RegisteredTestPlayer, RegisteredTestPlayer]> {
    const sender = await registerTestPlayer(app, `${label} Gönderen`);
    const recipient = await registerTestPlayer(app, `${label} Alan`);
    await friends(sender, recipient);
    if (mature) await matureAccounts(app, [sender, recipient]);
    await setMoney(sender.playerId, 20_000);
    return [sender, recipient];
  }

  it('başarılı transfer: gönderene gift_sent (işlem sonrası bakiyeyle), alıcıya gift_received bildirimi', async () => {
    const [sender, recipient] = await pair('Bildirim');
    const response = await send(sender, recipient.playerId, 300).expect(201);
    expect(response.body.data.senderBalance.money).toBe(20_000 - 300);

    const notes = await pool.query<{ player_id: string; type: string; payload: Record<string, unknown> }>(
      "SELECT player_id, type, payload FROM notifications WHERE type IN ('gift_sent', 'gift_received') AND (player_id = $1 OR player_id = $2)",
      [sender.playerId, recipient.playerId],
    );
    const sent = notes.rows.find((row) => row.type === 'gift_sent')!;
    expect(sent.player_id).toBe(sender.playerId);
    expect(sent.payload).toMatchObject({ playerId: recipient.playerId, amount: 300, balanceAfter: 20_000 - 300 });
    expect(notes.rows.find((row) => row.type === 'gift_received')!.player_id).toBe(recipient.playerId);
  });

  it('yeni hesap: işlem başı ve günlük tavan daha düşük; aşınca 409 GIFT_LIMIT_EXCEEDED ve hiçbir şey yazılmaz', async () => {
    const [sender, recipient] = await pair('Yeni', false);
    const over = await send(sender, recipient.playerId, gift.newAccount.maxAmount + 1).expect(409);
    expect(over.body.error.code).toBe('GIFT_LIMIT_EXCEEDED');

    let sent = 0;
    while (sent + gift.newAccount.maxAmount <= gift.newAccount.dailyAmountLimit) {
      await send(sender, recipient.playerId, gift.newAccount.maxAmount).expect(201);
      sent += gift.newAccount.maxAmount;
    }
    const before = await money(sender.playerId);
    const daily = await send(sender, recipient.playerId, gift.newAccount.dailyAmountLimit - sent + 1).expect(409);
    expect(daily.body.error.code).toBe('GIFT_LIMIT_EXCEEDED');
    expect(await money(sender.playerId)).toBe(before);
  });

  it('günlük gönderim tutarı tavanı (yaşlı hesap)', async () => {
    const [sender, recipient] = await pair('Günlük');
    await send(sender, recipient.playerId, gift.dailyAmountLimit - 10).expect(201);
    const over = await send(sender, recipient.playerId, 11).expect(409);
    expect(over.body.error.code).toBe('GIFT_LIMIT_EXCEEDED');
    await send(sender, recipient.playerId, 10).expect(201);
  });

  it('alıcının günlük aldığı tavan: çok hesaptan tek hesaba huni kesilir', async () => {
    const recipient = await registerTestPlayer(app, 'Huni Alan');
    let received = 0;
    let rejected = false;
    for (let index = 0; index < 4 && !rejected; index += 1) {
      const sender = await registerTestPlayer(app, `Huni Gönderen ${index}`);
      await friends(sender, recipient);
      await matureAccounts(app, [sender]);
      await setMoney(sender.playerId, 20_000);
      const amount = Math.min(gift.dailyAmountLimit, gift.maxAmount);
      const response = await send(sender, recipient.playerId, amount);
      if (received + amount <= gift.dailyReceiveAmountLimit) {
        expect(response.status).toBe(201);
        received += amount;
      } else {
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('GIFT_LIMIT_EXCEEDED');
        rejected = true;
      }
    }
    expect(rejected).toBe(true);
  });

  it('eşzamanlı iki transfer günlük tavanı ikiye katlayamaz (kilit altında sayılır)', async () => {
    const [sender, recipient] = await pair('Eşzamanlı');
    const amount = Math.floor(gift.dailyAmountLimit / 2) + 1;
    const results = await Promise.all([send(sender, recipient.playerId, amount), send(sender, recipient.playerId, amount)]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await money(sender.playerId)).toBe(20_000 - amount);
  });

  it('eşzamanlı transferler bakiyeyi yanlış hesaplayamaz: yetmeyen ikinci 409, karşılıklı transfer kilitlenmez, toplam korunur', async () => {
    const [sender, recipient] = await pair('Eşzamanlı Bakiye');
    await setMoney(sender.playerId, 500);
    const results = await Promise.all([send(sender, recipient.playerId, 300), send(sender, recipient.playerId, 300)]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(results.find((result) => result.status === 409)!.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await money(sender.playerId)).toBe(200);

    // A→B ve B→A aynı anda: kilit sırası id'ye göre olduğu için ikisi de biter.
    await setMoney(sender.playerId, 1_000);
    await setMoney(recipient.playerId, 1_000);
    const crossed = await Promise.all([send(sender, recipient.playerId, 100), send(recipient, sender.playerId, 150)]);
    expect(crossed.map((result) => result.status)).toEqual([201, 201]);
    expect(await money(sender.playerId)).toBe(1_000 - 100 + 150);
    expect(await money(recipient.playerId)).toBe(1_000 + 100 - 150);
  });

  it('transfer sırasında veritabanı hatası: bakiyeler, defter ve bildirim geri alınır', async () => {
    const [sender, recipient] = await pair('Hata');
    const recipientBefore = await money(recipient.playerId);
    await pool.query(`
      CREATE OR REPLACE FUNCTION test_fail_gift_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW.recipient_id = '${recipient.playerId}'::uuid THEN RAISE EXCEPTION 'test: yapay hata'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_fail_gift BEFORE INSERT ON gift_sends FOR EACH ROW EXECUTE FUNCTION test_fail_gift_insert();
    `);
    try {
      await send(sender, recipient.playerId, 100).expect(500);
    } finally {
      await pool.query('DROP TRIGGER test_fail_gift ON gift_sends; DROP FUNCTION test_fail_gift_insert();');
    }
    expect(await money(sender.playerId)).toBe(20_000);
    expect(await money(recipient.playerId)).toBe(recipientBefore);
    const ledger = await pool.query(
      "SELECT 1 FROM economy_transactions WHERE player_id = ANY($1::uuid[]) AND type IN ('gift_send_debit', 'gift_send_credit')",
      [[sender.playerId, recipient.playerId]],
    );
    expect(ledger.rowCount).toBe(0);
    const notes = await pool.query(
      "SELECT 1 FROM notifications WHERE player_id = ANY($1::uuid[]) AND type IN ('gift_sent', 'gift_received')",
      [[sender.playerId, recipient.playerId]],
    );
    expect(notes.rowCount).toBe(0);
  });

  it('satın alınan çip hediye edilemez: gönderilebilir = bakiye − satın alınmış', async () => {
    const [sender, recipient] = await pair('Satın');
    await setMoney(sender.playerId, 1_000);
    await pool.query(
      `INSERT INTO economy_transactions (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
       VALUES ($1, 'chip_purchase', 800, 'money', 'payment_order', $2, 200, 1000)`,
      [sender.playerId, randomUUID()],
    );
    const quota = (
      await http().get(`/api/v1/players/${sender.playerId}/gifts/quota`).set('Authorization', sender.authHeader).expect(200)
    ).body.data;
    expect(quota).toMatchObject({ balance: 1_000, giftableBalance: 200, purchasedChipsLocked: 800 });

    const over = await send(sender, recipient.playerId, 201).expect(409);
    expect(over.body.error.code).toBe('GIFT_LIMIT_EXCEEDED');
    await send(sender, recipient.playerId, 200).expect(201);
  });

  it('kota ucu: hazır tutarlar, kalan günlük hak, yeni hesap işareti; başkasının kotası 403', async () => {
    const fresh = await registerTestPlayer(app, 'Kota Yeni');
    const quota = (
      await http().get(`/api/v1/players/${fresh.playerId}/gifts/quota`).set('Authorization', fresh.authHeader).expect(200)
    ).body.data;
    expect(quota.newAccountLimited).toBe(true);
    expect(quota.maxAmount).toBe(gift.newAccount.maxAmount);
    expect(quota.remainingAmountToday).toBe(gift.newAccount.dailyAmountLimit);
    expect(quota.presetAmounts.every((preset: number) => preset <= gift.newAccount.maxAmount)).toBe(true);

    const other = await registerTestPlayer(app, 'Kota Başkası');
    await http().get(`/api/v1/players/${other.playerId}/gifts/quota`).set('Authorization', fresh.authHeader).expect(403);
  });

  it('silinmiş alıcıya transfer yapılamaz', async () => {
    const [sender, recipient] = await pair('Silinmiş');
    await pool.query('UPDATE players SET deleted_at = now() WHERE id = $1', [recipient.playerId]);
    const response = await send(sender, recipient.playerId, 50);
    expect(response.status).toBe(404);
    expect(await money(sender.playerId)).toBe(20_000);
  });
});
