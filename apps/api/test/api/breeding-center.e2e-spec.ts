import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadGeneticsConfig } from '@at-sevdalisi/game-config';
import type { BreedingCenterView, BreedingOfferView, StudListingView } from '@at-sevdalisi/shared-types';
import { studFeeOwnerShare } from '../../src/domain/breeding/breeding';
import { studFeeBounds } from '../../src/domain/breeding/breeding-center';
import { api, bootstrapBreedingApp, insertBreedingHorse, moneyOf, setMoney, type BreedingKit } from './breeding-test-kit';
import { registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * ÇİFTLEŞTİRME MERKEZİ (16.10.2026, brief §4) — PARA YOLU. Kanıtlanan şeyler:
 *   (1) aygır sahibi KENDİ ücretiyle (sunucu sınırları içinde) ilan verir,
 *   (2) kısrak sahibi teklif gönderir: ücret EMANETE alınır (defter + bildirim),
 *       anlaşma olmadan çiftleştirme yoktur,
 *   (3) ret, iptal, ilanın geri çekilmesi ve süre dolumu emaneti TAM iade eder,
 *   (4) kabul: döllenme tutarsa aygır sahibine pay, kalan ekonomiden çıkar;
 *       tutmazsa config yüzdesi iade; çift kabul / çift ödeme yok (eşzamanlı dahil),
 *   (5) yalnızca taraflar görür/yanıtlar (IDOR: üçüncü kişiye 404),
 *   (6) bekleyen teklif pazara çıkmayı, ikinci teklifi, kendi çiftini ve hesap
 *       silmeyi engeller; engel varsa teklif kurulamaz.
 */
const genetics = loadGeneticsConfig();
const QUALITY = 70;
const POTENTIAL = 80;
const BOUNDS = studFeeBounds({ quality: QUALITY, potential: POTENTIAL }, genetics);

describe('Çiftleştirme merkezi (e2e) — PARA YOLU', () => {
  let kit: BreedingKit;
  let pool: Pool;

  beforeAll(async () => {
    kit = await bootstrapBreedingApp();
    pool = kit.pool;
  });

  afterAll(async () => {
    await kit.app.close();
  });

  interface Parties {
    mareOwner: RegisteredTestPlayer;
    stallionOwner: RegisteredTestPlayer;
    mareId: string;
    stallionId: string;
    fee: number;
  }

  /** İlanlı aygır + kısrak; kısrak sahibine yeterli bakiye. */
  async function setup(fee: number = BOUNDS.suggested): Promise<Parties> {
    const mareOwner = await registerTestPlayer(kit.app, 'Kısrak Sahibi');
    const stallionOwner = await registerTestPlayer(kit.app, 'Aygır Sahibi');
    const mareId = await insertBreedingHorse(pool, mareOwner.playerId, 'Teklif Kısrağı', 'mare');
    const stallionId = await insertBreedingHorse(pool, stallionOwner.playerId, 'İlan Aygırı', 'stallion', {
      quality: QUALITY,
      potential: POTENTIAL,
    });
    await api(kit, stallionOwner).put(`/breeding/studs/${stallionId}`, { fee }).expect(200);
    await setMoney(pool, mareOwner.playerId, 50_000);
    await setMoney(pool, stallionOwner.playerId, 10_000);
    return { mareOwner, stallionOwner, mareId, stallionId, fee };
  }

  function offer(p: Parties, key: string = randomUUID()) {
    return api(kit, p.mareOwner).post('/breeding/offers', { mareId: p.mareId, stallionId: p.stallionId, foalName: 'Anlaşma Tayı' }, key);
  }

  async function ledger(offerId: string): Promise<Array<{ player_id: string; type: string; amount: number }>> {
    const result = await pool.query(
      "SELECT player_id, type, amount::float8 AS amount FROM economy_transactions WHERE reference_type = 'breeding_offer' AND reference_id = $1 ORDER BY created_at, amount",
      [offerId],
    );
    return result.rows;
  }

  async function notifications(playerId: string, type: string): Promise<Array<Record<string, unknown>>> {
    const result = await pool.query('SELECT payload FROM notifications WHERE player_id = $1 AND type = $2', [playerId, type]);
    return result.rows.map((row) => row.payload as Record<string, unknown>);
  }

  describe('ilan', () => {
    it('ücret sunucu sınırları içinde tam sayı olmalı; ilan başkalarının listesinde sahibin ücretiyle, soy + kariyerle görünür', async () => {
      const p = await setup(BOUNDS.max);
      await api(kit, p.stallionOwner).put(`/breeding/studs/${p.stallionId}`, { fee: BOUNDS.max + 1 }).expect(400);
      await api(kit, p.stallionOwner).put(`/breeding/studs/${p.stallionId}`, { fee: BOUNDS.min - 1 }).expect(400);
      const bad = await api(kit, p.stallionOwner).put(`/breeding/studs/${p.stallionId}`, { fee: 12.5 }).expect(400);
      expect(bad.body.error.code).toBe('INVALID_STUD_FEE');

      const list = await api(kit, p.mareOwner).get('/breeding/studs').expect(200);
      const row = (list.body.data as StudListingView[]).find((stud) => stud.horseId === p.stallionId)!;
      expect(row).toMatchObject({ fee: BOUNDS.max, ownerId: p.stallionOwner.playerId, fertility: 70 });
      expect(row.record).toMatchObject({ starts: 0, foals: 0 });
      // Sahibi kendi ilanını listede görmez; süzgeçler sunucuda.
      const own = await api(kit, p.stallionOwner).get('/breeding/studs').expect(200);
      expect((own.body.data as StudListingView[]).some((stud) => stud.horseId === p.stallionId)).toBe(false);
      const cheap = await api(kit, p.mareOwner).get(`/breeding/studs?maxFee=${BOUNDS.max - 1}`).expect(200);
      expect((cheap.body.data as StudListingView[]).some((stud) => stud.horseId === p.stallionId)).toBe(false);
      const otherBreed = await api(kit, p.mareOwner).get('/breeding/studs?breed=arabian').expect(200);
      expect((otherBreed.body.data as StudListingView[]).some((stud) => stud.horseId === p.stallionId)).toBe(false);
      await api(kit, p.mareOwner).get('/breeding/studs?maxFee=-1').expect(400);
    });

    it('emekli olmayan aygır ilana çıkamaz; başkasının aygırı 403; merkez ekranı sınırları ve uygunluğu gösterir', async () => {
      const owner = await registerTestPlayer(kit.app, 'Genç Aygır Sahibi');
      const stranger = await registerTestPlayer(kit.app, 'Yabancı');
      const racing = await insertBreedingHorse(pool, owner.playerId, 'Yarışan Aygır', 'stallion', { retired: false });
      const notRetired = await api(kit, owner).put(`/breeding/studs/${racing}`, { fee: BOUNDS.suggested }).expect(409);
      expect(notRetired.body.error.message).toMatch(/emekli/i);
      await api(kit, stranger).put(`/breeding/studs/${racing}`, { fee: BOUNDS.suggested }).expect(403);
      const center = (await api(kit, owner).get('/breeding/center').expect(200)).body.data as BreedingCenterView;
      const mine = center.myStuds.find((stud) => stud.stallionId === racing)!;
      expect(mine).toMatchObject({ eligible: false, listing: null, feeBounds: BOUNDS });
      expect(mine.ineligibleReason).toMatch(/emekli/i);
      expect(center.rules.gestationDays).toBe(Math.round(genetics.gestation.realWorldDays * genetics.gestation.timeScale));
      expect(center.rules.ownerSharePercent).toBe(genetics.studFeeOwnerSharePercent);
    });
  });

  describe('teklif + emanet', () => {
    it('teklif ücreti emanete alır (defter + aygır sahibine bildirim); ikinci teklif, kendi çifti ve pazar ilanı engellenir', async () => {
      const p = await setup();
      const created = await offer(p).expect(201);
      const view = created.body.data as BreedingOfferView;
      expect(view).toMatchObject({ status: 'pending', fee: p.fee, direction: 'outgoing' });
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(50_000 - p.fee);
      expect(await ledger(view.offerId)).toEqual([{ player_id: p.mareOwner.playerId, type: 'breeding_offer_hold', amount: -p.fee }]);
      expect(await notifications(p.stallionOwner.playerId, 'breeding_offer_received')).toEqual([
        expect.objectContaining({ offerId: view.offerId, fee: p.fee }),
      ]);

      const second = await offer(p).expect(409);
      expect(second.body.error.code).toBe('BREEDING_OFFER_ALREADY_PENDING');
      const ownStallion = await insertBreedingHorse(pool, p.mareOwner.playerId, 'Kendi Aygırı', 'stallion');
      const own = await api(kit, p.mareOwner)
        .post(`/players/${p.mareOwner.playerId}/breeding`, { mareId: p.mareId, stallionId: ownStallion, foalName: 'Araya' })
        .expect(409);
      expect(own.body.error.code).toBe('BREEDING_OFFER_ALREADY_PENDING');
      const listing = await api(kit, p.stallionOwner).post('/market/listings', { horseId: p.stallionId, price: 900 }, null).expect(409);
      expect(listing.body.error.code).toBe('HORSE_BREEDING_COMMITMENT');
      // Emanet varken hesap silinemez (iki taraf için de).
      const check = await api(kit, p.stallionOwner).get('/account/deletion').expect(200);
      expect(check.body.data.blockers.map((b: { code: string }) => b.code)).toContain('breeding_offer_pending');
    });

    it('kendi aygırına teklif 409; kısrak başkasınınsa 403; bakiye yetmezse 409 ve emanet yok; anahtarsız 400', async () => {
      const p = await setup();
      const self = await api(kit, p.stallionOwner)
        .post('/breeding/offers', { mareId: await insertBreedingHorse(pool, p.stallionOwner.playerId, 'K', 'mare'), stallionId: p.stallionId, foalName: 'Deneme Tay' })
        .expect(409);
      expect(self.body.error.code).toBe('BREEDING_OFFER_OWN_STALLION');
      await api(kit, p.stallionOwner).post('/breeding/offers', { mareId: p.mareId, stallionId: p.stallionId, foalName: 'Deneme Tay' }).expect(403);
      await setMoney(pool, p.mareOwner.playerId, p.fee - 1);
      expect((await offer(p).expect(409)).body.error.code).toBe('INSUFFICIENT_FUNDS');
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(p.fee - 1);
      expect(Number((await pool.query('SELECT COUNT(*) FROM breeding_offers WHERE mare_id = $1', [p.mareId])).rows[0].count)).toBe(0);
      await api(kit, p.mareOwner).post('/breeding/offers', { mareId: p.mareId, stallionId: p.stallionId, foalName: 'Deneme Tay' }, null).expect(400);
      await api(kit, p.mareOwner).post('/breeding/offers', { mareId: 'x', stallionId: p.stallionId, foalName: 'Deneme Tay' }).expect(400);
    });

    it('engel varsa (her iki yönde) teklif kurulamaz: 403 PLAYER_BLOCKED, para düşmez', async () => {
      const p = await setup();
      await pool.query('INSERT INTO player_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [p.stallionOwner.playerId, p.mareOwner.playerId]);
      expect((await offer(p).expect(403)).body.error.code).toBe('PLAYER_BLOCKED');
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(50_000);
    });
  });

  describe('yanıt', () => {
    it('RET: emanet TAM iade + bildirim; ikinci ret 409; üçüncü kişi ve kısrak sahibi reddedemez (404)', async () => {
      const p = await setup();
      const offerId = ((await offer(p).expect(201)).body.data as BreedingOfferView).offerId;
      const stranger = await registerTestPlayer(kit.app, 'Meraklı');
      await api(kit, stranger).post(`/breeding/offers/${offerId}/reject`, {}, null).expect(404);
      await api(kit, p.mareOwner).post(`/breeding/offers/${offerId}/reject`, {}, null).expect(404);

      const rejected = await api(kit, p.stallionOwner).post(`/breeding/offers/${offerId}/reject`, {}, null).expect(200);
      expect(rejected.body.data).toMatchObject({ status: 'rejected', refundedAmount: p.fee, direction: 'incoming' });
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(50_000);
      expect((await ledger(offerId)).map((row) => row.type)).toEqual(['breeding_offer_hold', 'breeding_offer_refund']);
      expect(await notifications(p.mareOwner.playerId, 'breeding_offer_answered')).toEqual([
        expect.objectContaining({ offerId, status: 'rejected', refundedAmount: p.fee }),
      ]);
      expect((await api(kit, p.stallionOwner).post(`/breeding/offers/${offerId}/reject`, {}, null).expect(409)).body.error.code).toBe(
        'BREEDING_OFFER_NOT_PENDING',
      );
    });

    it('İPTAL (kısrak sahibi): TAM iade; aygır sahibi iptal edemez, kabul de edilemez artık', async () => {
      const p = await setup();
      const offerId = ((await offer(p).expect(201)).body.data as BreedingOfferView).offerId;
      await api(kit, p.stallionOwner).post(`/breeding/offers/${offerId}/cancel`, {}, null).expect(404);
      await api(kit, p.mareOwner).post(`/breeding/offers/${offerId}/accept`, {}, null).expect(404);
      await api(kit, p.mareOwner).post(`/breeding/offers/${offerId}/cancel`, {}, null).expect(200);
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(50_000);
      await api(kit, p.stallionOwner).post(`/breeding/offers/${offerId}/accept`, {}, null).expect(409);
    });

    it('KABUL + döllenme: aygır sahibine pay, gebelik kısrak sahibinde; mutabakat: kesinti ekonomiden çıkar; çift kabul yok', async () => {
      const p = await setup();
      const offerId = ((await offer(p).expect(201)).body.data as BreedingOfferView).offerId;
      kit.random.push(0, 0);
      const [first, second] = await Promise.all([
        api(kit, p.stallionOwner).post(`/breeding/offers/${offerId}/accept`, {}, null),
        api(kit, p.stallionOwner).post(`/breeding/offers/${offerId}/accept`, {}, null),
      ]);
      expect([first.status, second.status].sort()).toEqual([200, 409]);
      const accepted = (first.status === 200 ? first : second).body.data as BreedingOfferView;
      expect(accepted).toMatchObject({ status: 'accepted', outcome: 'conceived', refundedAmount: 0 });

      const share = studFeeOwnerShare(p.fee, genetics);
      expect(await moneyOf(pool, p.stallionOwner.playerId)).toBe(10_000 + share);
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(50_000 - p.fee);
      const rows = await ledger(offerId);
      expect(rows).toEqual([
        { player_id: p.mareOwner.playerId, type: 'breeding_offer_hold', amount: -p.fee },
        { player_id: p.stallionOwner.playerId, type: 'breeding_stud_fee_credit', amount: share },
      ]);
      const pregnancy = await pool.query('SELECT owner_id, fee, offer_id, status FROM pregnancies WHERE id = $1', [accepted.pregnancyId]);
      expect(pregnancy.rows[0]).toMatchObject({ owner_id: p.mareOwner.playerId, offer_id: offerId, status: 'gestating' });
      expect(Number(pregnancy.rows[0].fee)).toBe(p.fee);
      expect(await notifications(p.stallionOwner.playerId, 'stud_service')).toEqual([
        expect.objectContaining({ pairId: accepted.pregnancyId, amount: share }),
      ]);
      expect(await notifications(p.mareOwner.playerId, 'breeding_offer_answered')).toEqual([
        expect.objectContaining({ status: 'accepted', outcome: 'conceived' }),
      ]);
      // İki tarafın geçmişinde de görünür.
      const mareCenter = (await api(kit, p.mareOwner).get('/breeding/center').expect(200)).body.data as BreedingCenterView;
      expect(mareCenter.outgoingOffers.map((o) => o.offerId)).toContain(offerId);
      expect(mareCenter.pregnancies.map((pg) => pg.pregnancyId)).toContain(accepted.pregnancyId);
      const studCenter = (await api(kit, p.stallionOwner).get('/breeding/center').expect(200)).body.data as BreedingCenterView;
      expect(studCenter.incomingOffers.map((o) => o.offerId)).toContain(offerId);
      expect(studCenter.pregnancies).toHaveLength(0);
    });

    it('KABUL + tutmayan döllenme: config yüzdesi kadar iade; gebelik yok; kısrak dinlenir', async () => {
      const p = await setup();
      const offerId = ((await offer(p).expect(201)).body.data as BreedingOfferView).offerId;
      kit.random.push(0.999_999);
      const accepted = (await api(kit, p.stallionOwner).post(`/breeding/offers/${offerId}/accept`, {}, null).expect(200)).body
        .data as BreedingOfferView;
      const refund = Math.floor((p.fee * genetics.breedingCenter.failedConceptionRefundPercent) / 100);
      expect(accepted).toMatchObject({ status: 'accepted', outcome: 'not_conceived', refundedAmount: refund, pregnancyId: null });
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(50_000 - p.fee + refund);
      expect(Number((await pool.query('SELECT COUNT(*) FROM pregnancies WHERE mare_id = $1', [p.mareId])).rows[0].count)).toBe(0);
    });

    it('SÜRE DOLUMU (zamanlayıcı): TAM iade + bildirim; süresi geçmiş teklif kabul edilemez', async () => {
      const p = await setup();
      const view = (await offer(p).expect(201)).body.data as BreedingOfferView;
      const after = new Date(new Date(view.expiresAt).getTime() + 1000);
      await pool.query("UPDATE breeding_offers SET expires_at = now() - interval '1 minute' WHERE id = $1", [view.offerId]);
      expect((await api(kit, p.stallionOwner).post(`/breeding/offers/${view.offerId}/accept`, {}, null).expect(409)).body.error.code).toBe(
        'BREEDING_OFFER_EXPIRED',
      );
      const result = await kit.scheduler.tickNow(after);
      expect(result?.expiredOffers).toBeGreaterThanOrEqual(1);
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(50_000);
      const status = await pool.query('SELECT status, refunded_amount FROM breeding_offers WHERE id = $1', [view.offerId]);
      expect(status.rows[0].status).toBe('expired');
      expect(await notifications(p.mareOwner.playerId, 'breeding_offer_answered')).toEqual([
        expect.objectContaining({ status: 'expired', refundedAmount: p.fee }),
      ]);
      // İkinci tur aynı teklifi tekrar iade etmez.
      await kit.scheduler.tickNow(after);
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(50_000);
    });

    it('İLAN GERİ ÇEKİLİNCE bekleyen teklif iptal + TAM iade + bildirim; listeden düşer', async () => {
      const p = await setup();
      const offerId = ((await offer(p).expect(201)).body.data as BreedingOfferView).offerId;
      const withdrawn = await api(kit, p.stallionOwner).delete(`/breeding/studs/${p.stallionId}`).expect(200);
      expect(withdrawn.body.data).toEqual({ cancelledOffers: 1 });
      expect(await moneyOf(pool, p.mareOwner.playerId)).toBe(50_000);
      expect(await notifications(p.mareOwner.playerId, 'breeding_offer_answered')).toEqual([
        expect.objectContaining({ offerId, status: 'cancelled' }),
      ]);
      const list = await api(kit, p.mareOwner).get('/breeding/studs').expect(200);
      expect((list.body.data as StudListingView[]).some((stud) => stud.horseId === p.stallionId)).toBe(false);
      expect((await offer(p).expect(404)).body.error.code).toBe('STUD_LISTING_NOT_FOUND');
      await api(kit, p.stallionOwner).delete(`/breeding/studs/${p.stallionId}`).expect(404);
    });
  });

  it('defter bütünlüğü: her teklif için emanet = iade + pay + ekonomiden çıkan kesinti (para basılmaz)', async () => {
    const p = await setup();
    const offerId = ((await offer(p).expect(201)).body.data as BreedingOfferView).offerId;
    kit.random.push(0, 0);
    await api(kit, p.stallionOwner).post(`/breeding/offers/${offerId}/accept`, {}, null).expect(200);
    const rows = await ledger(offerId);
    const held = -rows.filter((row) => row.type === 'breeding_offer_hold').reduce((sum, row) => sum + row.amount, 0);
    const returned = rows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
    expect(returned).toBeLessThanOrEqual(held);
    expect(held - returned).toBe(p.fee - studFeeOwnerShare(p.fee, genetics));
  });
});
