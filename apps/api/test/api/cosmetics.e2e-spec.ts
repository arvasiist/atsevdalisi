import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCosmeticsConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, sendConcurrentRequests, type RegisteredTestPlayer } from './test-helpers';

/**
 * KOZMETİK MAĞAZA (09.10.2026, migration 0082 — elmas politikası).
 * Kanıtlananlar:
 *   (1) Katalog config'ten; satın alma elmas düşer, sahiplik + `cosmetic_purchase`
 *       defter satırı aynı transaction; bakiye = önce + defter.
 *   (2) İkinci alım 409, eşzamanlı iki alımdan yalnızca biri para düşer.
 *   (3) Elmas yetmezse 409, hiçbir satır yazılmaz; olmayan ürün 404.
 *   (4) Avatar: kilitli seçenek sahip olmadan 409 COSMETIC_NOT_OWNED, aldıktan
 *       sonra kaydedilir; varsayılan avatar kilitli seçenek taşımaz.
 *   (5) `Idempotency-Key` zorunlu; aynı anahtar tekrar → tek alım.
 */
describe('Kozmetik mağaza (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const cosmetics = loadCosmeticsConfig();
  const silk = cosmetics.items.find((item) => item.catalog === 'silkColors')!;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const setGems = (playerId: string, gems: number) => pool.query('UPDATE players SET gems = $2 WHERE id = $1', [playerId, gems]);
  const gemsOf = async (playerId: string) =>
    Number((await pool.query<{ gems: string }>('SELECT gems FROM players WHERE id = $1', [playerId])).rows[0]!.gems);
  const buy = (player: RegisteredTestPlayer, key: string, idempotencyKey: string | null = randomUUID()) => {
    const call = http().post(`/api/v1/cosmetics/${key}/purchase`).set('Authorization', player.authHeader);
    return idempotencyKey === null ? call : call.set('Idempotency-Key', idempotencyKey);
  };
  const ledgerOf = async (playerId: string) =>
    (
      await pool.query<{ amount: string; currency: string; reference_id: string }>(
        "SELECT amount, currency, reference_id FROM economy_transactions WHERE player_id = $1 AND type = 'cosmetic_purchase'",
        [playerId],
      )
    ).rows.map((row) => ({ amount: Number(row.amount), currency: row.currency, referenceId: row.reference_id }));

  it('katalog → satın alma: elmas düşer, sahiplik + defter aynı işlemde; ikinci alım 409', async () => {
    const player = await registerTestPlayer(app, 'Kozmetik Alıcı');
    await setGems(player.playerId, silk.priceGems + 5);

    const catalog = await http().get('/api/v1/cosmetics').set('Authorization', player.authHeader).expect(200);
    expect(catalog.body.data.gems).toBe(silk.priceGems + 5);
    const listed = (catalog.body.data.items as Array<{ key: string; owned: boolean; priceGems: number; color: string | null }>).find(
      (item) => item.key === silk.key,
    )!;
    expect(listed).toMatchObject({ owned: false, priceGems: silk.priceGems });
    expect(listed.color).toMatch(/^#/);

    const bought = await buy(player, silk.key).expect(200);
    expect(bought.body.data).toMatchObject({ gems: 5, item: { key: silk.key, owned: true } });
    expect(await gemsOf(player.playerId)).toBe(5);
    expect(await ledgerOf(player.playerId)).toEqual([{ amount: -silk.priceGems, currency: 'gems', referenceId: silk.key }]);

    expect((await buy(player, silk.key).expect(409)).body.error.code).toBe('COSMETIC_ALREADY_OWNED');
    expect(await gemsOf(player.playerId)).toBe(5);
    const again = await http().get('/api/v1/cosmetics').set('Authorization', player.authHeader).expect(200);
    expect((again.body.data.items as Array<{ key: string; owned: boolean }>).find((item) => item.key === silk.key)!.owned).toBe(true);
  });

  it('elmas yetmezse 409 ve hiçbir satır yok; olmayan ürün 404; anahtarsız 400', async () => {
    const player = await registerTestPlayer(app, 'Fakir Alıcı');
    await setGems(player.playerId, silk.priceGems - 1);
    expect((await buy(player, silk.key).expect(409)).body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await gemsOf(player.playerId)).toBe(silk.priceGems - 1);
    expect(await ledgerOf(player.playerId)).toEqual([]);
    expect((await pool.query('SELECT 1 FROM player_cosmetics WHERE player_id = $1', [player.playerId])).rowCount).toBe(0);

    expect((await buy(player, 'yok-boyle-urun').expect(404)).body.error.code).toBe('COSMETIC_NOT_FOUND');
    await buy(player, silk.key, null).expect(400);
  });

  it('eşzamanlı iki alımdan yalnızca biri para düşer; aynı Idempotency-Key tekrarı tek alım', async () => {
    const player = await registerTestPlayer(app, 'Eşzamanlı Alıcı');
    await setGems(player.playerId, silk.priceGems * 3);
    const statuses = (await sendConcurrentRequests(2, () => buy(player, silk.key))).map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(await gemsOf(player.playerId)).toBe(silk.priceGems * 2);
    expect(await ledgerOf(player.playerId)).toHaveLength(1);

    const other = cosmetics.items.find((item) => item.key !== silk.key)!;
    const key = randomUUID();
    await buy(player, other.key, key).expect(200);
    await buy(player, other.key, key);
    expect(await ledgerOf(player.playerId)).toHaveLength(2);
  });

  it('avatar: kilitli renk sahip olmadan 409, aldıktan sonra kaydedilir; varsayılan kilitli renk taşımaz', async () => {
    const player = await registerTestPlayer(app, 'Formacı');
    const current = await http().get('/api/v1/avatar').set('Authorization', player.authHeader).expect(200);
    expect(current.body.data.source).toBe('default');
    const premiumIds = new Set(cosmetics.items.filter((item) => item.catalog === 'silkColors').map((item) => item.optionId));
    expect(premiumIds.has(current.body.data.appearance.silksPrimary)).toBe(false);
    expect(premiumIds.has(current.body.data.appearance.silksSecondary)).toBe(false);

    const wanted = { ...current.body.data.appearance, silksPrimary: silk.optionId };
    const rejected = await http().put('/api/v1/avatar').set('Authorization', player.authHeader).send({ appearance: wanted }).expect(409);
    expect(rejected.body.error.code).toBe('COSMETIC_NOT_OWNED');

    await setGems(player.playerId, silk.priceGems);
    await buy(player, silk.key).expect(200);
    const saved = await http().put('/api/v1/avatar').set('Authorization', player.authHeader).send({ appearance: wanted }).expect(200);
    expect(saved.body.data.appearance.silksPrimary).toBe(silk.optionId);
  });

  it('parça ürünü (şapka/aksesuar): renk yok; sahip olmadan 409, aldıktan sonra giyilir', async () => {
    const part = cosmetics.items.find((item) => item.catalog === 'hats' || item.catalog === 'accessories')!;
    const field = part.catalog === 'hats' ? 'hat' : 'accessory';
    const player = await registerTestPlayer(app, 'Şapkacı');
    const catalog = await http().get('/api/v1/cosmetics').set('Authorization', player.authHeader).expect(200);
    expect((catalog.body.data.items as Array<{ key: string; color: string | null }>).find((item) => item.key === part.key)!.color).toBeNull();

    const current = await http().get('/api/v1/avatar').set('Authorization', player.authHeader).expect(200);
    expect(current.body.data.appearance[field]).not.toBe(part.optionId);
    const wanted = { ...current.body.data.appearance, [field]: part.optionId };
    const rejected = await http().put('/api/v1/avatar').set('Authorization', player.authHeader).send({ appearance: wanted }).expect(409);
    expect(rejected.body.error.code).toBe('COSMETIC_NOT_OWNED');

    await setGems(player.playerId, part.priceGems);
    await buy(player, part.key).expect(200);
    const saved = await http().put('/api/v1/avatar').set('Authorization', player.authHeader).send({ appearance: wanted }).expect(200);
    expect(saved.body.data.appearance[field]).toBe(part.optionId);
  });
});
