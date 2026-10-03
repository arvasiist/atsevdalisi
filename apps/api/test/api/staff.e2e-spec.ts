import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadCareConfig,
  loadFarmConfig,
  loadStaffConfig,
  loadTrainingConfig,
} from '@at-sevdalisi/game-config';
import type { StaffOverview, StaffView } from '@at-sevdalisi/shared-types';
import { getMaxStaffCapacity } from '../../src/domain/farm/farm';
import { calculateStaffBonusMultiplier } from '../../src/domain/staff/staff';
import { calculateStatGain } from '../../src/domain/training/training';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * PERSONEL (brief §33, 01.10.2026). `staff` tablosu (migration 0012) ve
 * `domain/staff` bu dilime kadar DOMAIN ONLY idi.
 *
 * **KANITLANAN:** aday pazarı rol başına dolu tutulur; kiralama sözleşme
 * bedelini düşer ve AYNI transaction'da `staff_contract` defter satırı
 * yazar; aynı aday iki kez kiralanamaz; kapasite `staff_building`ten
 * gelir; yenileme pencere dışında 409 (çift ödeme imkânsız), süresi dolmuşsa
 * yeni dönem şimdiden başlar; bırakma iade etmez ve deftere yazmaz;
 * antrenör antrenman kazancını, seyis bakım etkisini ÇARPANIYLA artırır;
 * süresi dolmuş personel etki VERMEZ.
 */
describe('Personel (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const staffConfig = loadStaffConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function overview(player: RegisteredTestPlayer): Promise<StaffOverview> {
    return (await http().get('/api/v1/staff').set('Authorization', player.authHeader).expect(200))
      .body.data;
  }

  async function richPlayer(name: string) {
    const player = await registerTestPlayerWithStarterHorse(app, name);
    await pool.query('UPDATE players SET money = 1000000 WHERE id = $1', [player.playerId]);
    return player;
  }

  async function money(playerId: string): Promise<number> {
    return Number(
      (await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]))
        .rows[0]?.money,
    );
  }

  async function hire(player: RegisteredTestPlayer, role: string): Promise<StaffView> {
    const candidate = (await overview(player)).candidates.find((c) => c.role === role) as StaffView;
    const response = await http()
      .post(`/api/v1/staff/${candidate.id}/hire`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return response.body.data.staff as StaffView;
  }

  it('pazar her kiralanabilir rol için aday tutar; sayısal alanlar sayıdır; kapasite tesisten gelir', async () => {
    const player = await richPlayer('Personel Pazar');
    const data = await overview(player);
    expect(data.hired).toEqual([]);
    expect(data.capacity).toBe(getMaxStaffCapacity(0, loadFarmConfig()));
    for (const role of staffConfig.hireableRoles) {
      expect(data.candidates.filter((c) => c.role === role).length).toBeGreaterThanOrEqual(
        staffConfig.market.candidatesPerRole,
      );
    }
    const roles = new Set(data.candidates.map((c) => c.role));
    expect([...roles].every((role) => staffConfig.hireableRoles.includes(role))).toBe(true);
    const sample = data.candidates[0] as StaffView;
    expect(typeof sample.skill).toBe('number');
    expect(typeof sample.salary).toBe('number');
    expect(sample.contractCost).toBe(sample.salary * staffConfig.contractMonths);
    expect(sample.active).toBe(false);
  });

  it("kiralama bedeli düşer + aynı transaction'da defter satırı; aynı aday ikinci kez kiralanamaz", async () => {
    const player = await richPlayer('Personel Kiralayan');
    const rival = await richPlayer('Personel Rakip');
    const before = await money(player.playerId);
    const candidate = (await overview(player)).candidates.find(
      (c) => c.role === 'trainer',
    ) as StaffView;

    const response = await http()
      .post(`/api/v1/staff/${candidate.id}/hire`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(response.body.data.paid).toBe(candidate.contractCost);
    expect(response.body.data.staff.active).toBe(true);
    expect(await money(player.playerId)).toBe(before - candidate.contractCost);

    const ledger = await pool.query<{
      amount: string;
      balance_before: string;
      balance_after: string;
    }>(
      "SELECT amount, balance_before, balance_after FROM economy_transactions WHERE player_id = $1 AND type = 'staff_contract'",
      [player.playerId],
    );
    expect(ledger.rows.map((r) => Number(r.amount))).toEqual([-candidate.contractCost]);
    expect(Number(ledger.rows[0]?.balance_after)).toBe(before - candidate.contractCost);

    const again = await http()
      .post(`/api/v1/staff/${candidate.id}/hire`)
      .set('Authorization', rival.authHeader)
      .expect(409);
    expect(again.body.error.code).toBe('STAFF_ALREADY_HIRED');
    // Havuz tazelenir: kiralanan adayın yerine yenisi gelir.
    const pool2 = await overview(rival);
    expect(pool2.candidates.filter((c) => c.role === 'trainer').length).toBeGreaterThanOrEqual(
      staffConfig.market.candidatesPerRole,
    );
  });

  it('kapasite dolunca kiralama 409 ve para düşmez', async () => {
    const player = await richPlayer('Personel Kapasite');
    const { capacity } = await overview(player);
    for (let i = 0; i < capacity; i += 1) {
      await hire(player, staffConfig.hireableRoles[i % staffConfig.hireableRoles.length] as string);
    }
    const before = await money(player.playerId);
    const candidate = (await overview(player)).candidates[0] as StaffView;
    const response = await http()
      .post(`/api/v1/staff/${candidate.id}/hire`)
      .set('Authorization', player.authHeader)
      .expect(409);
    expect(response.body.error.code).toBe('STAFF_CAPACITY_EXCEEDED');
    expect(await money(player.playerId)).toBe(before);
  });

  it('yenileme: erken 409; pencerede bir kez ödenir; süresi dolmuşsa yeni dönem şimdiden başlar', async () => {
    const player = await richPlayer('Personel Yenileme');
    const staff = await hire(player, 'vet');
    const early = await http()
      .post(`/api/v1/staff/${staff.id}/renew`)
      .set('Authorization', player.authHeader)
      .expect(409);
    expect(early.body.error.code).toBe('STAFF_RENEWAL_NOT_DUE');

    // Bitime pencereden az kalsın (sözleşme ay ölçüsü − 3 gün önce başlamış).
    await pool.query(
      "UPDATE staff SET contract_started_at = now() - make_interval(months => $2) + interval '3 days' WHERE id = $1",
      [staff.id, staffConfig.contractMonths],
    );
    const before = await money(player.playerId);
    const renewed = await http()
      .post(`/api/v1/staff/${staff.id}/renew`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(renewed.body.data.paid).toBe(staff.contractCost);
    expect(renewed.body.data.staff.contract.durationMonths).toBe(staffConfig.contractMonths * 2);
    expect(await money(player.playerId)).toBe(before - staff.contractCost);
    // Çift basış: ikinci yenileme artık pencere dışında — ikinci ödeme YOK.
    await http()
      .post(`/api/v1/staff/${staff.id}/renew`)
      .set('Authorization', player.authHeader)
      .expect(409);
    expect(await money(player.playerId)).toBe(before - staff.contractCost);

    // Süresi çoktan dolmuş: yeni dönem ŞİMDİ başlar (ölü günlere ödeme yok).
    await pool.query(
      "UPDATE staff SET contract_started_at = now() - interval '400 days', contract_duration_months = $2 WHERE id = $1",
      [staff.id, staffConfig.contractMonths],
    );
    const expired = (await overview(player)).hired.find((s) => s.id === staff.id) as StaffView;
    expect(expired.active).toBe(false);
    expect(expired.renewable).toBe(true);
    const fresh = await http()
      .post(`/api/v1/staff/${staff.id}/renew`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(fresh.body.data.staff.contract.durationMonths).toBe(staffConfig.contractMonths);
    expect(Date.now() - Date.parse(fresh.body.data.staff.contract.startedAt)).toBeLessThan(60_000);
  });

  it('bırakma iade etmez ve deftere yazmaz; başkasının personeli bırakılamaz', async () => {
    const player = await richPlayer('Personel Bırakan');
    const other = await richPlayer('Personel Başkası');
    const staff = await hire(player, 'groom');
    await http()
      .post(`/api/v1/staff/${staff.id}/release`)
      .set('Authorization', other.authHeader)
      .expect(409);
    const before = await money(player.playerId);
    const ledgerBefore = await pool.query(
      'SELECT 1 FROM economy_transactions WHERE player_id = $1',
      [player.playerId],
    );

    const released = await http()
      .post(`/api/v1/staff/${staff.id}/release`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(released.body.data.ownerId).toBeNull();
    expect(await money(player.playerId)).toBe(before);
    const ledgerAfter = await pool.query(
      'SELECT 1 FROM economy_transactions WHERE player_id = $1',
      [player.playerId],
    );
    expect(ledgerAfter.rowCount).toBe(ledgerBefore.rowCount);
    const again = await http()
      .post(`/api/v1/staff/${staff.id}/release`)
      .set('Authorization', player.authHeader)
      .expect(409);
    expect(again.body.error.code).toBe('STAFF_NOT_OWNED');
  });

  it('antrenör antrenman kazancını çarpanıyla artırır; süresi dolunca etki biter', async () => {
    const player = await richPlayer('Personel Antrenör');
    const trainer = await hire(player, 'trainer');
    await pool.query('UPDATE staff SET skill = 100 WHERE id = $1', [trainer.id]);
    const expectedMultiplier = calculateStaffBonusMultiplier(
      { ...trainer, skill: 100 },
      staffConfig,
    );
    expect(expectedMultiplier).toBeGreaterThan(1);

    const reset = async () => {
      await pool.query('UPDATE horse_stats SET speed = 50 WHERE horse_id = $1', [player.horseId]);
      // `status` de sıfırlanır: antrenman rastgele sakatlık üretebilir
      // (`rollInjuryOccurred`) ve sakat at ikinci antrenmanı 409 ile reddeder —
      // CI'da yaşandı (02.10.2026, kararsız düşüş). Ölçülen şey kazanç
      // çarpanıdır; sakatlık bu testin konusu değildir.
      await pool.query(
        "UPDATE horses SET potential = 90, health = 100, fatigue = 0, energy = 100, status = 'active' WHERE id = $1",
        [player.horseId],
      );
    };
    const train = async () =>
      (
        await http()
          .post(`/api/v1/horses/${player.horseId}/train`)
          .set('Authorization', player.authHeader)
          .send({ type: 'speed', intensity: 'low', durationMinutes: 30 })
          .expect(200)
      ).body.data;
    const expectedGain = (factor: number) =>
      calculateStatGain(loadTrainingConfig(), {
        trainingType: 'speed',
        intensity: 'low',
        durationMinutes: 30,
        currentStatValue: 50,
        potential: 90,
        vitals: { health: 100, fitness: 0, fatigue: 0, energy: 100, morale: 0 },
        trainerFactor: factor,
      });

    await reset();
    const withTrainer = await train();
    expect(withTrainer.staffMultiplier).toBeCloseTo(expectedMultiplier, 10);
    expect(withTrainer.statChanges.speed).toBeCloseTo(expectedGain(expectedMultiplier), 6);
    expect(withTrainer.statChanges.speed).toBeGreaterThan(expectedGain(1));

    // Sözleşme bitti → etki yok.
    await pool.query(
      "UPDATE staff SET contract_started_at = now() - interval '400 days' WHERE id = $1",
      [trainer.id],
    );
    await reset();
    const expired = await train();
    expect(expired.staffMultiplier).toBe(1);
    expect(expired.statChanges.speed).toBeCloseTo(expectedGain(1), 6);
  });

  it('seyis "groom" bakımının etkisini çarpanıyla artırır', async () => {
    const player = await richPlayer('Personel Seyis');
    const groom = await hire(player, 'groom');
    const multiplier = calculateStaffBonusMultiplier(groom, staffConfig);
    await pool.query('UPDATE horses SET morale = 40 WHERE id = $1', [player.horseId]);

    const response = await http()
      .post(`/api/v1/horses/${player.horseId}/care`)
      .set('Authorization', player.authHeader)
      .send({ actionType: 'groom' })
      .expect(200);
    const delta = loadCareConfig().actions.groom?.vitalDelta?.morale as number;
    expect(response.body.data.staffMultiplier).toBeCloseTo(multiplier, 10);
    expect(response.body.data.newVitals.morale).toBeCloseTo(40 + delta * multiplier, 1);
  });
});
