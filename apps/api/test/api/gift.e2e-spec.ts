import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * HEDİYE GÖNDERİMİ — proje sahibinin açık talebi (27.09.2026 — üç parçanın
 * ÜÇÜNCÜSÜ: "tribün, arkadaşlık + mesajlaşma, hediye gönderimi").
 *
 * **BU BİR PARA YOLUDUR** — bu dosyanın ASIL KANITLADIĞI ŞEYLER:
 *   (1) TRANSFER: gönderenin bakiyesi DÜŞER, alıcınınki AYNI miktarda
 *       ARTAR — toplam arz değişmez (SINK olan tribün biletinden temel fark),
 *   (2) İKİ DEFTER SATIRI: `gift_send_debit` (negatif) + `gift_send_credit`
 *       (pozitif), AYNI `reference_id` ile — biri eksik olsaydı para ya
 *       yoktan var olur ya da kaybolurdu,
 *   (3) İDEMPOTENCY: AYNI `Idempotency-Key` ile iki istek → TEK hediye,
 *       TEK çift defter satırı (çift tahsilat YAPISAL olarak imkânsız),
 *   (4) ARKADAŞLIK KAPISI: arkadaş olmayana hediye 403 ve HİÇBİR satır
 *       yazılmaz (para transferi YAPISAL olarak engellenir),
 *   (5) KAYAN PENCERE: `dailyWindowHours`'tan ESKİ hediyeler sayıma
 *       GİRMEZ (tavan bir gün sonra gerçekten açılır),
 *   (6) SIZINTI YOK: yanıt alıcının bakiyesini TAŞIMAZ.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Hediye gönderimi (e2e) — PARA YOLU', () => {
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

  const giftsUrl = (playerId: string) => `/api/v1/players/${playerId}/gifts`;
  const requestsUrl = (playerId: string) => `/api/v1/players/${playerId}/friend-requests`;
  const respondUrl = (playerId: string, requestId: string) =>
    `/api/v1/players/${playerId}/friend-requests/${requestId}/respond`;

  /** İki oyuncuyu arkadaş yapar (istek + kabul) — hediye ön koşulu. */
  async function makeFriends(a: RegisteredTestPlayer, b: RegisteredTestPlayer): Promise<void> {
    const created = await request(app.getHttpServer())
      .post(requestsUrl(a.playerId))
      .set('Authorization', a.authHeader)
      .send({ addresseeId: b.playerId })
      .expect(201);
    await request(app.getHttpServer())
      .post(respondUrl(b.playerId, created.body.data.requestId as string))
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(200);
  }

  /**
   * Oyuncunun `gift_received` bildirimlerini okur (brief §28, PHASE 13).
   *
   * **`type` İLE SÜZÜLÜR — sayım TÜM listeyi kapsamaz.** Bu dosyanın
   * `makeFriends` kurulumu da bildirim üretir (`friend_request` +
   * `friend_accepted`); tüm listeyi saymak, "hediye bildirimi yazıldı mı"
   * sorusunu bir arkadaşlık bildirimiyle yanıtlayabilirdi. Aynı tuzak
   * `race-invite.e2e-spec.ts`'te YAŞANDI (bkz. PROJE_DURUMU.md §13.13).
   *
   * **HTTP ucu kullanılır** (repository'den okumak yerine): kanıtlanması
   * gereken şey "satır veritabanında var" değil, "ALICI bildirimi
   * GÖRÜYOR"dur.
   */
  async function giftNotifications(player: RegisteredTestPlayer): Promise<Record<string, unknown>[]> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/notifications`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return (response.body.data.notifications as Record<string, unknown>[]).filter(
      (n) => n.type === 'gift_received',
    );
  }

  /** `GET /players/:id` ile güncel bakiyeyi okur. */
  async function fetchBalance(playerId: string, authHeader: string): Promise<{ money: number; gems: number }> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}`)
      .set('Authorization', authHeader)
      .expect(200);
    return { money: response.body.data.money as number, gems: response.body.data.gems as number };
  }

  /**
   * Test için bakiyeyi doğrudan yazar — kayıt akışının verdiği başlangıç
   * parası hediye senaryoları için yetersiz/yetersiz-olmayan durumları
   * kurmaya yetmez. **Bu bir kısayoldur, üretim yolu DEĞİLDİR:** gerçek
   * para hareketi yalnızca defter yazan use-case'lerden geçer.
   */
  async function setBalance(playerId: string, money: number, gems = 0): Promise<void> {
    await pool.query('UPDATE players SET money = $2, gems = $3 WHERE id = $1', [playerId, money, gems]);
  }

  /**
   * Hediye isteği gönderir ve yanıtı döner. Beklenen durum kodu ZORUNLU
   * parametredir: testin asıl iddiası çoğu zaman "hangi kodla reddedildi"dir
   * ve onu çağrı yerinde görmek, yardımcı fonksiyonun içine gizlemekten
   * daha okunur.
   */
  async function sendGift(
    sender: RegisteredTestPlayer,
    recipientId: unknown,
    amount: unknown,
    currency: string,
    expectedStatus: number,
    idempotencyKey: string = randomUUID(),
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post(giftsUrl(sender.playerId))
      .set('Authorization', sender.authHeader)
      .set('Idempotency-Key', idempotencyKey)
      .send({ recipientId, amount, currency })
      .expect(expectedStatus);
  }

  describe('POST /players/:id/gifts — mutlu yol', () => {
    it('TRANSFER: gönderenin Çipi düşer, alıcınınki AYNI miktarda artar ve İKİ defter satırı yazılır', async () => {
      const sender = await registerTestPlayer(app, 'Hediye Gönderen');
      const recipient = await registerTestPlayer(app, 'Hediye Alan');
      await makeFriends(sender, recipient);

      await setBalance(sender.playerId, 5_000);
      await setBalance(recipient.playerId, 100);
      const amount = 750;

      const response = await sendGift(sender, recipient.playerId, amount, 'money', 201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.amount).toBe(amount);
      expect(response.body.data.currency).toBe('money');
      expect(response.body.data.recipient.playerId).toBe(recipient.playerId);
      // Gönderen KENDİ bakiyesini görür — istemci yeniden hesaplamasın diye.
      expect(response.body.data.senderBalance.money).toBe(5_000 - amount);
      // **SIZINTI YOK:** alıcının bakiyesi yanıtta HİÇ geçmez.
      expect(response.body.data.recipientBalance).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('recipientBalance');

      // (1) İki oyuncu satırı GERÇEKTEN güncellendi mi?
      const senderRow = await pool.query('SELECT money FROM players WHERE id = $1', [sender.playerId]);
      const recipientRow = await pool.query('SELECT money FROM players WHERE id = $1', [recipient.playerId]);
      expect(Number(senderRow.rows[0].money)).toBe(5_000 - amount);
      expect(Number(recipientRow.rows[0].money)).toBe(100 + amount);

      // (2) `gift_sends` satırı — İŞARETSİZ miktar (yön satırın kendisindedir).
      const giftRow = await pool.query('SELECT * FROM gift_sends WHERE id = $1', [response.body.data.giftId]);
      expect(giftRow.rows).toHaveLength(1);
      expect(giftRow.rows[0].sender_id).toBe(sender.playerId);
      expect(giftRow.rows[0].recipient_id).toBe(recipient.playerId);
      expect(Number(giftRow.rows[0].amount)).toBe(amount);
      expect(giftRow.rows[0].currency).toBe('money');

      // (3) DEFTER — İKİ satır, AYNI `reference_id`, zıt işaretli. Bu
      // iddialar OLMASAYDI "para buharlaştı" ya da "yoktan var oldu" gibi
      // bir hata sessizce geçerdi.
      const ledger = await pool.query(
        "SELECT * FROM economy_transactions WHERE reference_id = $1 AND reference_type = 'gift_send' ORDER BY amount",
        [response.body.data.giftId],
      );
      expect(ledger.rows).toHaveLength(2);
      const [debit, credit] = ledger.rows;
      expect(debit.player_id).toBe(sender.playerId);
      expect(debit.type).toBe('gift_send_debit');
      expect(Number(debit.amount)).toBe(-amount);
      expect(Number(debit.balance_before)).toBe(5_000);
      expect(Number(debit.balance_after)).toBe(5_000 - amount);
      expect(credit.player_id).toBe(recipient.playerId);
      expect(credit.type).toBe('gift_send_credit');
      expect(Number(credit.amount)).toBe(amount);
      expect(Number(credit.balance_before)).toBe(100);
      expect(Number(credit.balance_after)).toBe(100 + amount);
    });

    it('Elmas da hediye edilebilir (config: allowedCurrencies)', async () => {
      const sender = await registerTestPlayer(app, 'Elmas Gönderen');
      const recipient = await registerTestPlayer(app, 'Elmas Alan');
      await makeFriends(sender, recipient);

      await setBalance(sender.playerId, 0, 40);
      await setBalance(recipient.playerId, 0, 5);

      await sendGift(sender, recipient.playerId, 15, 'gems', 201);

      const senderRow = await pool.query('SELECT gems FROM players WHERE id = $1', [sender.playerId]);
      const recipientRow = await pool.query('SELECT gems FROM players WHERE id = $1', [recipient.playerId]);
      expect(Number(senderRow.rows[0].gems)).toBe(25);
      expect(Number(recipientRow.rows[0].gems)).toBe(20);
    });

    it('Çip hediyesi Elmas bakiyesine DOKUNMAZ (bakiye zinciri tek birim üzerindendir)', async () => {
      const sender = await registerTestPlayer(app, 'Tek Birim Gönderen');
      const recipient = await registerTestPlayer(app, 'Tek Birim Alan');
      await makeFriends(sender, recipient);

      await setBalance(sender.playerId, 1_000, 77);
      await setBalance(recipient.playerId, 0, 33);

      await sendGift(sender, recipient.playerId, 100, 'money', 201);

      const senderRow = await pool.query('SELECT money, gems FROM players WHERE id = $1', [sender.playerId]);
      const recipientRow = await pool.query('SELECT money, gems FROM players WHERE id = $1', [recipient.playerId]);
      expect(Number(senderRow.rows[0].money)).toBe(900);
      expect(Number(senderRow.rows[0].gems)).toBe(77);
      expect(Number(recipientRow.rows[0].money)).toBe(100);
      expect(Number(recipientRow.rows[0].gems)).toBe(33);
    });
  });

  describe('POST /players/:id/gifts — idempotency', () => {
    it('AYNI Idempotency-Key ile iki istek → TEK hediye, TEK çift defter satırı', async () => {
      const sender = await registerTestPlayer(app, 'Tekrar Gönderen');
      const recipient = await registerTestPlayer(app, 'Tekrar Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 10_000);

      const key = randomUUID();
      const first = await sendGift(sender, recipient.playerId, 300, 'money', 201, key);
      const second = await sendGift(sender, recipient.playerId, 300, 'money', 201, key);

      // AYNI yanıt (yeniden işlenmedi) — `grandstand.e2e-spec.ts` ile AYNI iddia.
      expect(second.body.data.giftId).toBe(first.body.data.giftId);

      const balance = await fetchBalance(sender.playerId, sender.authHeader);
      expect(balance.money).toBe(10_000 - 300);

      const giftRows = await pool.query('SELECT * FROM gift_sends WHERE sender_id = $1', [sender.playerId]);
      expect(giftRows.rows).toHaveLength(1);

      const ledger = await pool.query(
        "SELECT * FROM economy_transactions WHERE reference_id = $1 AND reference_type = 'gift_send'",
        [first.body.data.giftId],
      );
      expect(ledger.rows).toHaveLength(2);
    });

    it('Idempotency-Key başlığı OLMADAN 400 döner ve hiçbir satır yazılmaz', async () => {
      const sender = await registerTestPlayer(app, 'Anahtarsız Gönderen');
      const recipient = await registerTestPlayer(app, 'Anahtarsız Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 1_000);

      const response = await request(app.getHttpServer())
        .post(giftsUrl(sender.playerId))
        .set('Authorization', sender.authHeader)
        .send({ recipientId: recipient.playerId, amount: 100, currency: 'money' })
        .expect(400);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      const giftRows = await pool.query('SELECT * FROM gift_sends WHERE sender_id = $1', [sender.playerId]);
      expect(giftRows.rows).toHaveLength(0);
      const balance = await fetchBalance(sender.playerId, sender.authHeader);
      expect(balance.money).toBe(1_000);
    });
  });

  describe('POST /players/:id/gifts — arkadaşlık kapısı', () => {
    it('ARKADAŞ OLMAYANA hediye 403 GIFT_REQUIRES_FRIENDSHIP döner ve HİÇBİR satır yazılmaz', async () => {
      const sender = await registerTestPlayer(app, 'Yabancı Gönderen');
      const stranger = await registerTestPlayer(app, 'Yabancı Alan');
      await setBalance(sender.playerId, 5_000);
      await setBalance(stranger.playerId, 0);

      const response = await sendGift(sender, stranger.playerId, 500, 'money', 403);
      expect(response.body.error.code).toBe('GIFT_REQUIRES_FRIENDSHIP');

      // PARA HAREKET ETMEDİ — ne satır ne defter.
      const giftRows = await pool.query('SELECT * FROM gift_sends WHERE sender_id = $1', [sender.playerId]);
      expect(giftRows.rows).toHaveLength(0);
      const ledger = await pool.query("SELECT * FROM economy_transactions WHERE player_id = $1 AND type LIKE 'gift_send%'", [
        sender.playerId,
      ]);
      expect(ledger.rows).toHaveLength(0);
      expect((await fetchBalance(sender.playerId, sender.authHeader)).money).toBe(5_000);
      expect((await fetchBalance(stranger.playerId, stranger.authHeader)).money).toBe(0);
    });

    it('arkadaşlıktan ÇIKILDIKTAN sonra hediye yine 403 döner (kapı her istekte yeniden sorulur)', async () => {
      const sender = await registerTestPlayer(app, 'Eski Dost');
      const recipient = await registerTestPlayer(app, 'Eski Dost 2');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 5_000);

      await request(app.getHttpServer())
        .delete(`/api/v1/players/${sender.playerId}/friends/${recipient.playerId}`)
        .set('Authorization', sender.authHeader)
        .expect(200);

      await sendGift(sender, recipient.playerId, 100, 'money', 403);
    });
  });

  describe('POST /players/:id/gifts — girdi doğrulama', () => {
    it('kendine hediye 400 CANNOT_GIFT_SELF döner', async () => {
      const player = await registerTestPlayer(app, 'Kendine Gönderen');
      await setBalance(player.playerId, 5_000);

      const response = await sendGift(player, player.playerId, 100, 'money', 400);
      expect(response.body.error.code).toBe('CANNOT_GIFT_SELF');
    });

    it.each([
      ['minAmount\'un altı', 0],
      ['maxAmount\'un üstü', 10_000_000],
      ['kesirli', 10.5],
    ])('%s → 400 INVALID_GIFT_AMOUNT', async (_name, amount) => {
      const sender = await registerTestPlayer(app, 'Geçersiz Miktar Gönderen');
      const recipient = await registerTestPlayer(app, 'Geçersiz Miktar Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 1_000_000);

      const response = await sendGift(sender, recipient.playerId, amount, 'money', 400);
      expect(response.body.error.code).toBe('INVALID_GIFT_AMOUNT');
    });

    it('metin olarak gönderilen miktar 400 döner ("500" sessizce 500\'e çevrilmez)', async () => {
      const sender = await registerTestPlayer(app, 'Metin Miktar Gönderen');
      const recipient = await registerTestPlayer(app, 'Metin Miktar Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 5_000);

      // `Number('500')` tuzağı: sessiz çevrim olsaydı bu istek BAŞARILI
      // olurdu ve istemci hatası görünmez kalırdı.
      const response = await sendGift(sender, recipient.playerId, '500', 'money', 400);
      expect(response.body.error.code).toBe('INVALID_GIFT_AMOUNT');
    });

    it('bilinmeyen para birimi 400 GIFT_CURRENCY_NOT_ALLOWED döner', async () => {
      const sender = await registerTestPlayer(app, 'Bilinmeyen Birim Gönderen');
      const recipient = await registerTestPlayer(app, 'Bilinmeyen Birim Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 5_000);

      const response = await sendGift(sender, recipient.playerId, 100, 'chip', 400);
      expect(response.body.error.code).toBe('GIFT_CURRENCY_NOT_ALLOWED');
    });

    /**
     * ALICI (`recipientId`) BİR **GÖVDE** ALANIDIR — `:id` yol parametresi
     * DEĞİLDİR. Bu ayrım bu testin varlık sebebidir: dosyanın aşağısındaki
     * `geçersiz uuid 400` testi `GET /players/gecersiz-uuid/gifts` çağırır,
     * yani yalnızca `@Param('id', ParseUUIDPipe)` korumasını kanıtlar. Aynı
     * koruma `recipientId`'ye UZANMAZ; o kapıyı `GiftController.sendGift`
     * içindeki `isUUID` kontrolü tutar (breeding'de `mareId`/`stallionId` için
     * düzeltilen hatanın AYNISI — bkz. CLAUDE.md "bilinen açık hata").
     *
     * Bu satırlar olmadan istek repository'ye ulaşır, `WHERE p.id = $1` ham
     * Postgres hatası (`22P02 invalid input syntax for type uuid`) atar ve
     * istemci **500** görür. Bu yüzden iddia yalnızca "400 döndü" değil,
     * aynı zamanda "**hiçbir satır yazılmadı**"dır — 400'ün kaynağı
     * doğrulama kapısıdır, veritabanı hatasının maskelenmesi değil.
     */
    it.each([
      ['UUID olmayan metin', 'gecerli-degil'],
      ['sayı (metin bile değil)', 42],
      ['boş dize', ''],
    ])('gövdedeki recipientId %s ise 400 döner ve hiçbir satır yazılmaz', async (_name, recipientId) => {
      const sender = await registerTestPlayer(app, 'Geçersiz Alıcı Gönderen');
      await setBalance(sender.playerId, 5_000);

      await sendGift(sender, recipientId, 100, 'money', 400);

      const giftRows = await pool.query('SELECT COUNT(*) FROM gift_sends WHERE sender_id = $1', [sender.playerId]);
      expect(Number(giftRows.rows[0].count)).toBe(0);
    });

    it('YETERSİZ BAKİYE 409 INSUFFICIENT_FUNDS döner ve hiçbir satır yazılmaz', async () => {
      const sender = await registerTestPlayer(app, 'Yoksul Gönderen');
      const recipient = await registerTestPlayer(app, 'Yoksul Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 50);
      await setBalance(recipient.playerId, 0);

      // **409, 400 DEĞİL** — `InsufficientFundsError` projede ZATEN
      // `HttpStatus.CONFLICT`'e eşlenmiştir (`http-exception.filter.ts`,
      // "yetersiz bakiye GEÇİCİDİR: oyuncu para kazanınca çözülür" gerekçesi
      // `HorseNotReadyForTrainingError`/`InsufficientFeedStockError` ile
      // AYNI). Hediye yolu bu sınıfı YENİDEN KULLANIR (brief §29 "duplicate
      // economy implementation oluşturma"), yani durum kodu da AYNIDIR.
      const response = await sendGift(sender, recipient.playerId, 100, 'money', 409);
      expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // ROLLBACK gerçekten çalıştı mı? Bakiye NE düştü ne arttı, defter BOŞ.
      expect((await fetchBalance(sender.playerId, sender.authHeader)).money).toBe(50);
      expect((await fetchBalance(recipient.playerId, recipient.authHeader)).money).toBe(0);
      const giftRows = await pool.query('SELECT * FROM gift_sends WHERE sender_id = $1', [sender.playerId]);
      expect(giftRows.rows).toHaveLength(0);
    });
  });

  describe('POST /players/:id/gifts — kayan pencere', () => {
    it('pencere İÇİNDEKİ hediyeler tavana sayılır: 409 DAILY_GIFT_LIMIT_REACHED', async () => {
      const sender = await registerTestPlayer(app, 'Tavan Gönderen');
      const recipient = await registerTestPlayer(app, 'Tavan Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 1_000_000);

      const { dailyLimit } = config.gift;
      // Tavanı DOLDURMAK için 20 HTTP isteği atmak yerine satırlar
      // doğrudan yazılır (test hızı); sorgu yine GERÇEK sorgudur.
      await pool.query(
        `INSERT INTO gift_sends (sender_id, recipient_id, currency, amount)
         SELECT $1, $2, 'money', 1 FROM generate_series(1, $3::int)`,
        [sender.playerId, recipient.playerId, dailyLimit],
      );

      const response = await sendGift(sender, recipient.playerId, 100, 'money', 409);
      expect(response.body.error.code).toBe('DAILY_GIFT_LIMIT_REACHED');

      // Tavandaki istek HİÇBİR şey yazmadı.
      const giftRows = await pool.query('SELECT COUNT(*) FROM gift_sends WHERE sender_id = $1', [sender.playerId]);
      expect(Number(giftRows.rows[0].count)).toBe(dailyLimit);
    });

    it('pencereden ESKİ hediyeler tavana SAYILMAZ (tavan gerçekten kayar)', async () => {
      const sender = await registerTestPlayer(app, 'Kayan Pencere Gönderen');
      const recipient = await registerTestPlayer(app, 'Kayan Pencere Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 1_000_000);

      const { dailyLimit, dailyWindowHours } = config.gift;
      // Aynı SAYIDA satır, ama pencerenin DIŞINDA. Sorgu `dailyWindowHours`
      // kullanmasaydı (ör. gömülü `interval '24 hours'` ya da penceresiz bir
      // `COUNT(*)`), bu test 409 görürdü — yani bu iddia, pencerenin
      // config'ten GERÇEKTEN okunduğunun kanıtıdır.
      await pool.query(
        `INSERT INTO gift_sends (sender_id, recipient_id, currency, amount, created_at)
         SELECT $1, $2, 'money', 1, now() - (($3::int + 1) * interval '1 hour') FROM generate_series(1, $4::int)`,
        [sender.playerId, recipient.playerId, dailyWindowHours, dailyLimit],
      );

      await sendGift(sender, recipient.playerId, 100, 'money', 201);
    });

    it('BAŞKA bir gönderenin hediyeleri benim sayımıma girmez', async () => {
      const sender = await registerTestPlayer(app, 'Sayım Gönderen');
      const recipient = await registerTestPlayer(app, 'Sayım Alan');
      const otherSender = await registerTestPlayer(app, 'Başka Gönderen');
      await makeFriends(sender, recipient);
      await makeFriends(otherSender, recipient);
      await setBalance(sender.playerId, 1_000_000);

      const { dailyLimit } = config.gift;
      await pool.query(
        `INSERT INTO gift_sends (sender_id, recipient_id, currency, amount)
         SELECT $1, $2, 'money', 1 FROM generate_series(1, $3::int)`,
        [otherSender.playerId, recipient.playerId, dailyLimit * 2],
      );

      // Sayım `sender_id = $1` ile süzülmeseydi bu istek 409 alırdı.
      await sendGift(sender, recipient.playerId, 100, 'money', 201);
    });
  });

  describe('POST /players/:id/gifts — yetki', () => {
    it('BAŞKASI adına hediye gönderilemez (403 FORBIDDEN — assertSelf)', async () => {
      const attacker = await registerTestPlayer(app, 'Saldırgan');
      const victim = await registerTestPlayer(app, 'Kurban');
      const target = await registerTestPlayer(app, 'Hedef');
      await setBalance(victim.playerId, 5_000);

      const response = await request(app.getHttpServer())
        .post(giftsUrl(victim.playerId))
        .set('Authorization', attacker.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ recipientId: target.playerId, amount: 100, currency: 'money' })
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');

      // Kurbanın parası YERİNDE.
      expect((await fetchBalance(victim.playerId, victim.authHeader)).money).toBe(5_000);
    });

    it('kimlik doğrulanmadan 401 döner', async () => {
      const player = await registerTestPlayer(app, 'Kimliksiz Hediyeci');
      await request(app.getHttpServer())
        .post(giftsUrl(player.playerId))
        .set('Idempotency-Key', randomUUID())
        .send({ recipientId: player.playerId, amount: 100, currency: 'money' })
        .expect(401);
    });
  });

  describe('GET /players/:id/gifts', () => {
    it('gelen ve giden hediyeleri TEK akışta, doğru `direction` ile döner', async () => {
      const a = await registerTestPlayer(app, 'Geçmiş A');
      const b = await registerTestPlayer(app, 'Geçmiş B');
      await makeFriends(a, b);
      await setBalance(a.playerId, 5_000);
      await setBalance(b.playerId, 5_000);

      await sendGift(a, b.playerId, 111, 'money', 201);
      await sendGift(b, a.playerId, 222, 'money', 201);

      const aList = await request(app.getHttpServer())
        .get(giftsUrl(a.playerId))
        .set('Authorization', a.authHeader)
        .expect(200);
      expect(aList.body.data).toHaveLength(2);

      const outgoing = aList.body.data.find((gift: { amount: number }) => gift.amount === 111);
      const incoming = aList.body.data.find((gift: { amount: number }) => gift.amount === 222);
      expect(outgoing.direction).toBe('outgoing');
      expect(outgoing.counterparty.playerId).toBe(b.playerId);
      expect(incoming.direction).toBe('incoming');
      expect(incoming.counterparty.playerId).toBe(b.playerId);

      // Karşı taraftan bakıldığında yönler TERS olmalı — `direction`
      // sunucuda `sender_id`'den türetildiğinin kanıtı.
      const bList = await request(app.getHttpServer())
        .get(giftsUrl(b.playerId))
        .set('Authorization', b.authHeader)
        .expect(200);
      expect(bList.body.data.find((gift: { amount: number }) => gift.amount === 111).direction).toBe('incoming');
      expect(bList.body.data.find((gift: { amount: number }) => gift.amount === 222).direction).toBe('outgoing');

      // Karşı tarafın bakiyesi listede GEÇMEZ: `counterparty` yalnızca
      // görünür alanları taşır (`SocialPlayerView`).
      expect(Object.keys(outgoing.counterparty).sort()).toEqual(['displayName', 'level', 'playerId']);
    });

    it('hiç hediye almamış oyuncu boş liste alır (404 DEĞİL)', async () => {
      const lonely = await registerTestPlayer(app, 'Yalnız Hediyeci');
      const response = await request(app.getHttpServer())
        .get(giftsUrl(lonely.playerId))
        .set('Authorization', lonely.authHeader)
        .expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('BAŞKASININ hediye geçmişi 403 döner (IDOR kapısı — assertSelf)', async () => {
      const nosy = await registerTestPlayer(app, 'Meraklı Hediyeci');
      const victim = await registerTestPlayer(app, 'Hediye Kurbanı');

      const response = await request(app.getHttpServer())
        .get(giftsUrl(victim.playerId))
        .set('Authorization', nosy.authHeader)
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('geçersiz uuid 400 ile reddedilir (veritabanına hiç gidilmez — 22P02 yerine)', async () => {
      const player = await registerTestPlayer(app, 'Geçersiz Yol Hediyeci');
      await request(app.getHttpServer())
        .get('/api/v1/players/gecersiz-uuid/gifts')
        .set('Authorization', player.authHeader)
        .expect(400);
    });
  });

  /**
   * `gift_received` BİLDİRİMİ (brief §28, §42 PHASE 13).
   *
   * **BU BLOĞUN ASIL KANITLADIĞI ŞEY ATOMLİKTİR:** bildirim, para
   * hareketiyle AYNI transaction'da yazılır. Bunu iddia etmek yetmez —
   * burada PARA HAREKETİNİN REDDEDİLDİĞİ her yol (403/409/400) için
   * "bildirim de YOK" gösterilir. Ayrı bir INSERT olsaydı, bu yolların
   * birinde geride bir bildirim kalırdı: alıcı, hesabına hiç geçmemiş bir
   * hediyenin haberini alırdı.
   */
  describe('gift_received bildirimi — para yoluyla atomik', () => {
    it('hediyeyi ALAN bir bildirim görür; payload göndereni ve miktarı taşır', async () => {
      const sender = await registerTestPlayer(app, 'Hediye Gönderen');
      const recipient = await registerTestPlayer(app, 'Bildirim Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 5_000);

      const response = await sendGift(sender, recipient.playerId, 750, 'money', 201);

      const received = await giftNotifications(recipient);
      expect(received).toHaveLength(1);
      expect(received[0]?.payload).toEqual({
        giftSendId: response.body.data.giftId,
        // `playerId` KARŞI TARAFTIR — yani GÖNDEREN (bildirimin sahibi
        // olan alıcı değil). İstemci "Ömer sana 750 Çip gönderdi"
        // cümlesini bu alandan kurar.
        playerId: sender.playerId,
        displayName: 'Hediye Gönderen',
        currency: 'money',
        amount: 750,
      });
    });

    it('hediyeyi GÖNDEREN kendi hediyesi için bildirim ALMAZ (yön kanıtı)', async () => {
      const sender = await registerTestPlayer(app, 'Sessiz Gönderen');
      const recipient = await registerTestPlayer(app, 'Sessiz Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 5_000);

      await sendGift(sender, recipient.playerId, 100, 'money', 201);

      expect(await giftNotifications(sender)).toHaveLength(0);
    });

    it('Elmas hediyesinin bildirimi birimi `gems` olarak taşır', async () => {
      const sender = await registerTestPlayer(app, 'Elmas Bildirim Gönderen');
      const recipient = await registerTestPlayer(app, 'Elmas Bildirim Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 0, 40);

      await sendGift(sender, recipient.playerId, 15, 'gems', 201);

      const received = await giftNotifications(recipient);
      expect(received).toHaveLength(1);
      // Birim payload'da OLMASAYDI istemci "15"i Çip sanırdı.
      expect((received[0]?.payload as { currency: string }).currency).toBe('gems');
    });

    it('AYNI Idempotency-Key ile iki istek → TEK hediye, TEK bildirim', async () => {
      const sender = await registerTestPlayer(app, 'Tekrar Bildirim Gönderen');
      const recipient = await registerTestPlayer(app, 'Tekrar Bildirim Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 10_000);

      const key = randomUUID();
      await sendGift(sender, recipient.playerId, 300, 'money', 201, key);
      await sendGift(sender, recipient.playerId, 300, 'money', 201, key);

      // İkinci istek yeniden işlenseydi alıcı AYNI hediye için İKİ kez
      // haberdar olurdu — çift tahsilat kadar yanıltıcı bir "çift haber".
      expect(await giftNotifications(recipient)).toHaveLength(1);
    });

    it('ARKADAŞ OLMAYANA hediye 403 → bildirim de YAZILMAZ', async () => {
      const sender = await registerTestPlayer(app, 'Yabancı Bildirim Gönderen');
      const stranger = await registerTestPlayer(app, 'Yabancı Bildirim Alan');
      await setBalance(sender.playerId, 5_000);

      await sendGift(sender, stranger.playerId, 500, 'money', 403);

      expect(await giftNotifications(stranger)).toHaveLength(0);
    });

    it('YETERSİZ BAKİYE 409 → bildirim de YAZILMAZ (ROLLBACK bildirimi de geri alır)', async () => {
      const sender = await registerTestPlayer(app, 'Yoksul Bildirim Gönderen');
      const recipient = await registerTestPlayer(app, 'Yoksul Bildirim Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 50);

      await sendGift(sender, recipient.playerId, 100, 'money', 409);

      // Para transferi geri alındıysa haber de geri alınmalıdır: aksi
      // hâlde alıcı, hesabına HİÇ geçmemiş bir hediyeyi beklerdi.
      expect(await giftNotifications(recipient)).toHaveLength(0);
    });

    it('GÜNLÜK TAVAN 409 → bildirim de YAZILMAZ', async () => {
      const sender = await registerTestPlayer(app, 'Tavan Bildirim Gönderen');
      const recipient = await registerTestPlayer(app, 'Tavan Bildirim Alan');
      await makeFriends(sender, recipient);
      await setBalance(sender.playerId, 1_000_000);

      const { dailyLimit } = config.gift;
      // Satırlar doğrudan yazılır (test hızı) — sorgu yine GERÇEK sorgudur.
      // Bu satırlar BİLDİRİM ÜRETMEZ (bildirim yalnızca `sendGift`
      // yolundan yazılır), yani aşağıdaki iddia "kurulum gürültüsü" değil,
      // gerçekten "tavan isteği hiçbir şey yazmadı" der.
      await pool.query(
        `INSERT INTO gift_sends (sender_id, recipient_id, currency, amount)
         SELECT $1, $2, 'money', 1 FROM generate_series(1, $3::int)`,
        [sender.playerId, recipient.playerId, dailyLimit],
      );

      await sendGift(sender, recipient.playerId, 100, 'money', 409);

      expect(await giftNotifications(recipient)).toHaveLength(0);
    });

    it('KENDİNE hediye 400 → bildirim YAZILMAZ (kendine bildirim saçmalığı)', async () => {
      const player = await registerTestPlayer(app, 'Kendine Bildirim Gönderen');
      await setBalance(player.playerId, 5_000);

      await sendGift(player, player.playerId, 100, 'money', 400);

      expect(await giftNotifications(player)).toHaveLength(0);
    });
  });
});
