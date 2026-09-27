import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * TRIBÜN (grandstand) — proje sahibinin açık talebi (27.09.2026): "yarış
 * yapılan yerlerde tribüne ücretli girişler olsun insanlar yarışları
 * izleyebilsin".
 *
 * Diğer e2e dosyalarıyla AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL gerektirir).
 *
 * **BU DOSYANIN KANITLADIĞI ASIL ŞEY** para yolunun üç ayağıdır:
 *   (1) `players` satırı kilitlenip bakiyeden düşülüyor mu,
 *   (2) `race_tickets` satırı yazılıyor mu,
 *   (3) `economy_transactions`'a İMZALI (negatif) bir defter satırı
 *       düşüyor mu — üçü AYNI transaction'da.
 * Bunlardan biri eksik olsaydı bilet "bedava" ya da "parasız izlenen"
 * olurdu; ikisi de sessiz bir ekonomi sızıntısıdır.
 */
describe('Tribün — ücretli seyirci girişi (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: AppConfigService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Bir oyuncunun atıyla bitmiş bir yarış üretir (sunucuda ANINDA tamamlanır). */
  async function runFinishedRace(horseId: string, authHeader: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    return response.body.data.raceId as string;
  }

  /** `GET /players/:id` ile güncel bakiyeyi okur (istek sahibinin kendi bakiyesi). */
  async function fetchMoney(playerId: string, authHeader: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}`)
      .set('Authorization', authHeader)
      .expect(200);
    return response.body.data.money as number;
  }

  describe('GET /races/watchable', () => {
    it('başkasının bitmiş yarışını listeler, KENDİ yarışını listelemez', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Tribün Sahibi');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Tribün İzleyicisi');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      const ownerList = await request(app.getHttpServer())
        .get('/api/v1/races/watchable')
        .set('Authorization', owner.authHeader)
        .expect(200);
      // KENDİ yarışı: tribünden izlenemez (zaten katılımcıdır — bkz.
      // `assertRaceWatchable` OWN_RACE kuralı). Bu filtre OLMASAYDI
      // kullanıcı kendi yarışına boşuna bilet alabilirdi.
      expect(ownerList.body.data.find((race: { raceId: string }) => race.raceId === raceId)).toBeUndefined();

      const viewerList = await request(app.getHttpServer())
        .get('/api/v1/races/watchable')
        .set('Authorization', viewer.authHeader)
        .expect(200);
      const listed = viewerList.body.data.find((race: { raceId: string }) => race.raceId === raceId);
      expect(listed).toBeDefined();
      expect(listed.hasTicket).toBe(false);
      expect(listed.entrantCount).toBeGreaterThan(1);
      // Fiyat CONFIG'ten gelir (magic number yok) — use-case ekler, repo eklemez.
      expect(listed.ticketPrice).toEqual(config.grandstand.ticketPrice);
    });

    it('bilet alındıktan sonra aynı satır hasTicket:true döner (istemci ikinci istek atmaz)', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'HasTicket Sahibi');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'HasTicket İzleyicisi');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', viewer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/api/v1/races/watchable')
        .set('Authorization', viewer.authHeader)
        .expect(200);
      const listed = list.body.data.find((race: { raceId: string }) => race.raceId === raceId);
      expect(listed.hasTicket).toBe(true);
    });
  });

  describe('POST /races/:id/tickets — PARA YOLU', () => {
    it('bilet satın alır: bakiye düşer, race_tickets satırı VE imzalı defter satırı yazılır', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Satış Sahibi');
      const buyer = await registerTestPlayerWithStarterHorse(app, 'Bilet Alan');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      const startingMoney = await fetchMoney(buyer.playerId, buyer.authHeader);
      const price = config.grandstand.ticketPrice.amount;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.raceId).toBe(raceId);
      expect(response.body.data.price).toBe(price);
      expect(response.body.data.currency).toBe(config.grandstand.ticketPrice.currency);
      expect(response.body.data.newBalance.money).toBe(startingMoney - price);
      expect(typeof response.body.data.purchasedAt).toBe('string');

      // (1) Oyuncu satırı GERÇEKTEN güncellendi mi?
      const playerRow = await pool.query('SELECT money FROM players WHERE id = $1', [buyer.playerId]);
      expect(Number(playerRow.rows[0].money)).toBe(startingMoney - price);

      // (2) Bilet satırı — fiyat SATIN ALMA ANINDAKİ değeri taşır (config
      // sonradan değişse bile geçmiş kayıt bozulmaz).
      const ticketRow = await pool.query('SELECT * FROM race_tickets WHERE race_id = $1 AND player_id = $2', [
        raceId,
        buyer.playerId,
      ]);
      expect(ticketRow.rows).toHaveLength(1);
      expect(Number(ticketRow.rows[0].price)).toBe(price);
      expect(ticketRow.rows[0].currency).toBe(config.grandstand.ticketPrice.currency);

      // (3) Defter — bilet bir SINK'tir (kimseye kredi geçmez), bu yüzden
      // tutar NEGATİFTİR ve bakiye zinciri tutarlıdır. Bu satır OLMASAYDI
      // para "kayıp" olurdu (denetlenemez).
      const ledgerRow = await pool.query(
        "SELECT * FROM economy_transactions WHERE player_id = $1 AND type = 'grandstand_ticket'",
        [buyer.playerId],
      );
      expect(ledgerRow.rows).toHaveLength(1);
      expect(Number(ledgerRow.rows[0].amount)).toBe(-price);
      expect(Number(ledgerRow.rows[0].balance_before)).toBe(startingMoney);
      expect(Number(ledgerRow.rows[0].balance_after)).toBe(startingMoney - price);
      expect(ledgerRow.rows[0].reference_id).toBe(ticketRow.rows[0].id);
    });

    it('bilet alındıktan SONRA yarış tam alan replay\'i açılır (kapı: katılımcı VEYA bilet sahibi)', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Kapı Sahibi');
      const viewer = await registerTestPlayerWithStarterHorse(app, 'Kapı İzleyicisi');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      // ÖNCE: bilet yok → 403 RACE_TICKET_REQUIRED.
      const before = await request(app.getHttpServer())
        .get(`/api/v1/races/${raceId}/timeline`)
        .set('Authorization', viewer.authHeader);
      expect(before.status).toBe(403);
      expect(before.body.error.code).toBe('RACE_TICKET_REQUIRED');

      await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', viewer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .expect(200);

      // SONRA: bilet var → 200. Bu, tribünün BÜTÜN AMACIDIR.
      const after = await request(app.getHttpServer())
        .get(`/api/v1/races/${raceId}/timeline`)
        .set('Authorization', viewer.authHeader)
        .expect(200);
      expect(after.body.data.raceId).toBe(raceId);
      expect(after.body.data.entrants.length).toBeGreaterThan(1);
    });

    it('AYNI Idempotency-Key ile tekrarlanan istek TEK bir kez tahsil edilir', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Idem Sahibi');
      const buyer = await registerTestPlayerWithStarterHorse(app, 'Idem Alan');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      const startingMoney = await fetchMoney(buyer.playerId, buyer.authHeader);
      const key = randomUUID();

      const first = await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', key)
        .expect(200);
      const second = await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', key)
        .expect(200);

      // Aynı anahtar → AYNI yanıt (yeniden işlenmez).
      expect(second.body.data.ticketId).toBe(first.body.data.ticketId);

      const money = await fetchMoney(buyer.playerId, buyer.authHeader);
      expect(money).toBe(startingMoney - config.grandstand.ticketPrice.amount);

      const ledgerRow = await pool.query(
        "SELECT * FROM economy_transactions WHERE player_id = $1 AND type = 'grandstand_ticket'",
        [buyer.playerId],
      );
      expect(ledgerRow.rows).toHaveLength(1);
      const ticketRow = await pool.query('SELECT * FROM race_tickets WHERE race_id = $1 AND player_id = $2', [
        raceId,
        buyer.playerId,
      ]);
      expect(ticketRow.rows).toHaveLength(1);
    });

    it('FARKLI anahtarla aynı yarışa ikinci bilet 409 RACE_TICKET_ALREADY_OWNED döner ve bakiyeyi DEĞİŞTİRMEZ', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Tekrar Sahibi');
      const buyer = await registerTestPlayerWithStarterHorse(app, 'Tekrar Alan');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .expect(200);
      const afterFirst = await fetchMoney(buyer.playerId, buyer.authHeader);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID());

      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('RACE_TICKET_ALREADY_OWNED');
      expect(await fetchMoney(buyer.playerId, buyer.authHeader)).toBe(afterFirst);

      // İkinci deneme deftere İKİNCİ bir satır YAZMAMALI.
      const ledgerRow = await pool.query(
        "SELECT * FROM economy_transactions WHERE player_id = $1 AND type = 'grandstand_ticket'",
        [buyer.playerId],
      );
      expect(ledgerRow.rows).toHaveLength(1);
    });

    it('Idempotency-Key header\'ı olmadan istek 400 IDEMPOTENCY_KEY_REQUIRED döner', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Anahtarsız Sahibi');
      const buyer = await registerTestPlayerWithStarterHorse(app, 'Anahtarsız Alan');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', buyer.authHeader);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      // Hiçbir şey yazılmadı.
      const ticketRow = await pool.query('SELECT * FROM race_tickets WHERE race_id = $1 AND player_id = $2', [
        raceId,
        buyer.playerId,
      ]);
      expect(ticketRow.rows).toHaveLength(0);
    });

    it('KENDİ yarışına bilet alınamaz — 409 RACE_NOT_WATCHABLE (OWN_RACE)', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Kendi Yarışı Sahibi');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', owner.authHeader)
        .set('Idempotency-Key', randomUUID());

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('RACE_NOT_WATCHABLE');
    });

    it('var olmayan yarış için 404 RACE_NOT_FOUND döner', async () => {
      const buyer = await registerTestPlayerWithStarterHorse(app, 'Olmayan Alan');

      const response = await request(app.getHttpServer())
        .post(`/api/v1/races/${randomUUID()}/tickets`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID());

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('RACE_NOT_FOUND');
    });

    it('bakiye yetersizse 409 INSUFFICIENT_FUNDS döner ve HİÇBİR satır yazılmaz', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Yetersiz Sahibi');
      const buyer = await registerTestPlayerWithStarterHorse(app, 'Yetersiz Alan');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      // Test kurulumu (gerçek bir kullanıcı akışı DEĞİL): bakiyeyi bilet
      // fiyatının ALTINA çekiyoruz — `economy.e2e-spec.ts`'in cooldown'ı
      // geçmişe almasıyla AYNI teknik.
      await pool.query('UPDATE players SET money = 0 WHERE id = $1', [buyer.playerId]);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID());

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // `debit` fırlattığında transaction TAMAMEN geri alınır: ne bilet ne
      // defter satırı. (Bu, "para düştü ama bilet yok" durumunun
      // imkânsız olduğunun kanıtıdır.)
      const ticketRow = await pool.query('SELECT * FROM race_tickets WHERE race_id = $1 AND player_id = $2', [
        raceId,
        buyer.playerId,
      ]);
      expect(ticketRow.rows).toHaveLength(0);
      const ledgerRow = await pool.query('SELECT * FROM economy_transactions WHERE player_id = $1', [buyer.playerId]);
      expect(ledgerRow.rows).toHaveLength(0);
    });

    it('Authorization header olmadan 401 döner', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Yetkisiz Sahibi');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Idempotency-Key', randomUUID());

      expect(response.status).toBe(401);
    });
  });

  describe('GET /players/:id/tickets', () => {
    it('kendi biletlerini listeler (yarış adı ve satın alma zamanı ile)', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Liste Sahibi');
      const buyer = await registerTestPlayerWithStarterHorse(app, 'Liste Alan');
      const raceId = await runFinishedRace(owner.horseId, owner.authHeader);

      const purchase = await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/tickets`)
        .set('Authorization', buyer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/players/${buyer.playerId}/tickets`)
        .set('Authorization', buyer.authHeader)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].ticketId).toBe(purchase.body.data.ticketId);
      expect(response.body.data[0].raceId).toBe(raceId);
      expect(response.body.data[0].raceName).toBeTruthy();
      expect(response.body.data[0].price).toBe(config.grandstand.ticketPrice.amount);
    });

    it('başkasının biletleri okunamaz — 403 (assertSelf)', async () => {
      const someone = await registerTestPlayerWithStarterHorse(app, 'Bilet Meraklısı');
      const other = await registerTestPlayerWithStarterHorse(app, 'Bilet Sahibi');

      const response = await request(app.getHttpServer())
        .get(`/api/v1/players/${other.playerId}/tickets`)
        .set('Authorization', someone.authHeader);

      expect(response.status).toBe(403);
    });
  });
});
