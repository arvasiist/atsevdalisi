import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEconomyConfig } from '@at-sevdalisi/game-config';
import { ErrorCode, type WalletTransaction } from '@at-sevdalisi/shared-types';
import { TOKEN_SERVICE, type TokenService } from '../../src/application/ports/token.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * SANAL PARA YATIRMA — `POST /players/:id/wallet/deposit` (brief §20
 * DEPOSIT, §21, §22 "ECONOMY SECURITY", §41, §42 PHASE 4b).
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *
 *  1. **Para GERÇEKTEN cüzdana girer ve sunucu hesaplar.** `newBalance`,
 *     `GET /players/:id`'nin döndüğü bakiye ile TIPATIP aynıdır — istemci
 *     hiçbir şey toplamaz (brief §22 "Tüm finansal hesaplamalar backend'de
 *     yapılmalı").
 *  2. **Dönen `transactionId` YAZILAN defter satırının kimliğidir.** Bu,
 *     brief §22'nin "Transaction ID oluşturulmalı" maddesinin en kolay
 *     yanlış anlaşılabilecek kısmıdır: yanıtta bir UUID dönmek YETMEZ,
 *     dönen UUID gerçekten defterde o satırın kimliği OLMALIDIR. Test bunu
 *     HAM SQL ile (HTTP'den bağımsız) doğrular.
 *  3. **Defterdeki tür `mock_deposit`, ailesi `DEPOSIT`'tir ve sağlayıcı
 *     referansı satırda SAKLANIR.** Gerçek bir sağlayıcı bağlandığında
 *     geçmişteki "oyuncak" yatırmaların ayırt edilebilmesi ve mutabakatın
 *     yapılabilmesi buna bağlıdır.
 *  4. **Idempotency GERÇEKTEN çalışır.** Aynı `Idempotency-Key` ile
 *     gönderilen ikinci istek ikinci kez para YATIRMAZ (ve aynı yanıtı
 *     döner); farklı anahtar yeni bir yatırmadır. Bu ayrım olmadan
 *     "çift tıklama" sessizce iki kat para basardı.
 *  5. **Sunucu otoritesi (CLAUDE.md kural 1).** Başkasının cüzdanına
 *     yatırma 403; tutar sınırları SUNUCUDA zorlanır ve aşan bir tutar
 *     SESSİZCE KIRPILMAZ, reddedilir.
 *
 * **NEDEN HAM SQL:** 2. ve 3. iddialar HTTP üzerinden kurulamaz — "dönen
 * kimlik gerçekten o satır mı" sorusunun cevabı yalnızca veritabanındadır.
 */
describe('Sanal para yatırma (e2e) — POST /players/:id/wallet/deposit', () => {
  let app: INestApplication;
  let pool: Pool;
  let tokenService: TokenService;

  let owner: RegisteredTestPlayer;
  let intruder: RegisteredTestPlayer;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    tokenService = app.get<TokenService>(TOKEN_SERVICE);
    owner = await registerTestPlayer(app, 'Yatıran Oyuncu');
    intruder = await registerTestPlayer(app, 'Davetsiz Misafir');
  });

  afterAll(async () => {
    await app.close();
  });

  const ECONOMY = loadEconomyConfig();
  const STARTING_MONEY = ECONOMY.newPlayerStartingBalance.money;
  const { minAmount: MIN, maxAmount: MAX } = ECONOMY.mockDeposit;

  function depositUrl(playerId: string) {
    return `/api/v1/players/${playerId}/wallet/deposit`;
  }

  /** Yatırma isteği — `idempotencyKey` verilmezse YENİ bir anahtar üretilir. */
  function deposit(
    player: RegisteredTestPlayer,
    body: unknown,
    options: { playerId?: string; idempotencyKey?: string | null } = {},
  ) {
    const targetId = options.playerId ?? player.playerId;
    const req = request(app.getHttpServer())
      .post(depositUrl(targetId))
      .set('Authorization', player.authHeader);

    // `null` → header HİÇ gönderilmez (eksik anahtar dalını sınamak için).
    const key = options.idempotencyKey === undefined ? randomUUID() : options.idempotencyKey;
    if (key !== null) {
      req.set('Idempotency-Key', key);
    }
    return req.send(body as object);
  }

  /** Oyuncunun GERÇEK bakiyesi — yatırmanın ikinci bir doğruluk kaynağı olmadığını kanıtlamak için AYRI uçtan okunur. */
  async function balanceOf(player: RegisteredTestPlayer): Promise<{ money: number; gems: number }> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return { money: response.body.data.money as number, gems: response.body.data.gems as number };
  }

  interface LedgerRow {
    id: string;
    player_id: string;
    type: string;
    amount: string;
    currency: string;
    reference_type: string | null;
    reference_id: string | null;
    balance_before: string;
    balance_after: string;
    idempotency_key: string | null;
  }

  async function ledgerRowById(id: string): Promise<LedgerRow | undefined> {
    const result = await pool.query<LedgerRow>('SELECT * FROM economy_transactions WHERE id = $1', [id]);
    return result.rows[0];
  }

  async function ledgerRowsByReference(referenceId: string): Promise<LedgerRow[]> {
    const result = await pool.query<LedgerRow>(
      'SELECT * FROM economy_transactions WHERE reference_id = $1 ORDER BY created_at',
      [referenceId],
    );
    return result.rows;
  }

  // ---------------------------------------------------------------- mutlu yol

  it('geçerli tutar: 200 döner, bakiye ARTAR ve newBalance sunucunun değeridir', async () => {
    const player = await registerTestPlayer(app, 'Mutlu Yol');
    const before = await balanceOf(player);

    const response = await deposit(player, { amount: MIN }).expect(200);
    const data = response.body.data;

    expect(data.amount).toBe(MIN);
    expect(data.currency).toBe('money');
    expect(data.newBalance.money).toBe(before.money + MIN);
    expect(data.newBalance.gems).toBe(before.gems);

    // Cüzdanın kendi başına bir "doğruluk kaynağı" olmadığının kanıtı:
    const after = await balanceOf(player);
    expect(after.money).toBe(before.money + MIN);
    expect(data.newBalance.money).toBe(after.money);
    expect(data.newBalance.gems).toBe(after.gems);
  });

  it('DÖNEN transactionId, YAZILAN defter satırının kimliğidir (brief §22)', async () => {
    const player = await registerTestPlayer(app, 'Kimlik Kanıtı');
    const before = await balanceOf(player);

    const response = await deposit(player, { amount: MIN + 7 }).expect(200);
    const { transactionId, providerId, providerReference } = response.body.data;

    expect(transactionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const row = await ledgerRowById(transactionId);
    expect(row, 'Dönen transactionId için defterde satır yok — kimlik UYDURULMUŞ.').toBeDefined();
    expect(row!.player_id).toBe(player.playerId);
    expect(row!.type).toBe('mock_deposit');
    expect(Number(row!.amount)).toBe(MIN + 7);
    expect(row!.currency).toBe('money');
    expect(Number(row!.balance_before)).toBe(before.money);
    expect(Number(row!.balance_after)).toBe(before.money + MIN + 7);

    // Sağlayıcı referansı defterde SAKLANIR (mutabakat bağlantısı).
    expect(row!.reference_type).toBe('payment_intent');
    expect(row!.reference_id).toBe(providerReference);

    // Sağlayıcı kimliği ve referansı birbirinden AYRI iki şeydir: biri
    // "kim", diğeri "hangi işlem". Birleştirilirlerse mutabakat imkânsızlaşır.
    expect(providerId).toBe('mock');
    expect(providerReference).toMatch(/^mock_[0-9a-f-]{36}$/);
    expect(providerReference).not.toBe(transactionId);
  });

  it('yatırma cüzdan geçmişinde mock_deposit / DEPOSIT olarak GÖRÜNÜR', async () => {
    const player = await registerTestPlayer(app, 'Geçmiş Kontrol');
    const response = await deposit(player, { amount: MIN }).expect(200);
    const { transactionId, providerReference } = response.body.data;

    const wallet = (
      await request(app.getHttpServer())
        .get(`/api/v1/players/${player.playerId}/wallet`)
        .set('Authorization', player.authHeader)
        .expect(200)
    ).body.data;

    const tx = (wallet.transactions as WalletTransaction[]).find((item) => item.id === transactionId);
    expect(tx, 'Yatırma hareketi cüzdan geçmişinde bulunamadı.').toBeDefined();
    expect(tx!.type).toBe('mock_deposit');
    expect(tx!.canonicalType).toBe('DEPOSIT');
    expect(tx!.amount).toBe(MIN);
    expect(tx!.currency).toBe('money');
    expect(tx!.referenceType).toBe('payment_intent');
    expect(tx!.referenceId).toBe(providerReference);
    expect(wallet.money).toBe(STARTING_MONEY + MIN);
  });

  it('üst sınırın KENDİSİ kabul edilir', async () => {
    const player = await registerTestPlayer(app, 'Üst Sınır');
    const response = await deposit(player, { amount: MAX }).expect(200);
    expect(response.body.data.amount).toBe(MAX);
    expect(response.body.data.newBalance.money).toBe(STARTING_MONEY + MAX);
  });

  // -------------------------------------------------------------- idempotency

  it('AYNI Idempotency-Key ikinci kez para YATIRMAZ, aynı yanıtı döner', async () => {
    const player = await registerTestPlayer(app, 'Çift Tık');
    const key = randomUUID();

    const first = await deposit(player, { amount: MIN }, { idempotencyKey: key }).expect(200);
    const second = await deposit(player, { amount: MIN }, { idempotencyKey: key }).expect(200);

    // İkinci istek use-case'e HİÇ ulaşmadı — gövde BİT BİT aynı.
    expect(second.body).toEqual(first.body);

    // Ve gerçekten tek bir yatırma var.
    const after = await balanceOf(player);
    expect(after.money).toBe(STARTING_MONEY + MIN);
    const rows = await ledgerRowsByReference(first.body.data.providerReference);
    expect(rows.length).toBe(1);
  });

  it('FARKLI Idempotency-Key yeni bir yatırmadır (idempotency aşırı geniş DEĞİL)', async () => {
    const player = await registerTestPlayer(app, 'İki Ayrı Yatırma');
    await deposit(player, { amount: MIN }).expect(200);
    await deposit(player, { amount: MIN }).expect(200);
    expect((await balanceOf(player)).money).toBe(STARTING_MONEY + MIN * 2);
  });

  it('Idempotency-Key YOKSA 400 (brief §54 — para girişi anahtarsız kabul edilmez)', async () => {
    const response = await deposit(owner, { amount: MIN }, { idempotencyKey: null }).expect(400);
    expect(response.body.error.code).toBe(ErrorCode.IdempotencyKeyRequired);
  });

  // ------------------------------------------------------------- tutar sınırları

  // Açık `Array<[string, unknown]>` — `it.each` çıkarımına bırakılırsa
  // karışık eleman tipleri birleşime dağılır (bu projede AYNI desen
  // `wallet-history.spec.ts`'te kullanıldı).
  const invalidBodies: Array<[string, unknown]> = [
    ['gövde boş', {}],
    ['tutar yok (undefined)', { amount: undefined }],
    ['tutar null', { amount: null }],
    ['tutar metin', { amount: String(MIN) }],
    ['tutar ondalık', { amount: MIN + 0.5 }],
    ['tutar sıfır', { amount: 0 }],
    ['tutar negatif', { amount: -MIN }],
    ['tutar alt sınırın bir altı', { amount: MIN - 1 }],
    ['tutar üst sınırın bir üstü', { amount: MAX + 1 }],
    ['tutar NaN', { amount: Number.NaN }],
    ['tutar Infinity', { amount: Number.POSITIVE_INFINITY }],
    ['tutar dizi', { amount: [MIN] }],
    ['tutar nesne', { amount: { value: MIN } }],
  ];

  it.each(invalidBodies)('%s → 400 INVALID_DEPOSIT_AMOUNT (500 DEĞİL)', async (_label, body) => {
    const player = await registerTestPlayer(app, 'Geçersiz Tutar');
    const before = await balanceOf(player);

    const response = await deposit(player, body).expect(400);
    expect(response.body.error.code).toBe(ErrorCode.InvalidDepositAmount);

    // Ve HİÇBİR ŞEY yazılmadı — ne bakiye ne defter.
    expect(await balanceOf(player)).toEqual(before);
  });

  it('üst sınırı aşan tutar SESSİZCE KIRPILMAZ, reddedilir (para yolunda dürüstlük)', async () => {
    // `?limit` sayfalamasındaki "sessizce kırp" kararından bilinçli sapma:
    // orada kırpılan şey bir görüntüleme tercihiydi, burada oyuncunun
    // parası olurdu. Bu test o kararı sabitler.
    const player = await registerTestPlayer(app, 'Kırpma Yok');
    await deposit(player, { amount: MAX + 1 }).expect(400);
    expect((await balanceOf(player)).money).toBe(STARTING_MONEY);
  });

  // ------------------------------------------------------------------- yetki

  it('token YOKSA 401 UNAUTHORIZED', async () => {
    const response = await request(app.getHttpServer())
      .post(depositUrl(owner.playerId))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: MIN })
      .expect(401);
    expect(response.body.error.code).toBe(ErrorCode.Unauthorized);
  });

  it('BAŞKASININ cüzdanına yatırma 403 FORBIDDEN (sunucu otoritesi — brief §22)', async () => {
    const before = await balanceOf(owner);
    const response = await deposit(intruder, { amount: MIN }, { playerId: owner.playerId }).expect(403);
    expect(response.body.error.code).toBe(ErrorCode.Forbidden);
    // Kurbanın bakiyesi DEĞİŞMEDİ.
    expect(await balanceOf(owner)).toEqual(before);
  });

  it('var OLMAYAN oyuncu 404 PLAYER_NOT_FOUND', async () => {
    // `AuthGuard` token'ın `sub` claim'ine GÜVENİR, oyuncunun var olduğunu
    // ayrıca sorgulamaz — bu yüzden rastgele bir UUID için imzalanmış
    // GEÇERLİ bir token guard'ı ve `assertSelf`'i geçer, 404 kararı
    // repository'nin `null` dönüşünden gelir (`wallet.e2e-spec.ts`'teki
    // AYNI dal).
    const ghostId = randomUUID();
    const ghostToken = tokenService.sign({ sub: ghostId });
    const response = await request(app.getHttpServer())
      .post(depositUrl(ghostId))
      .set('Authorization', `Bearer ${ghostToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: MIN })
      .expect(404);
    expect(response.body.error.code).toBe(ErrorCode.PlayerNotFound);
  });

  // -------------------------------------------------------- defter tutarlılığı

  it('her yatırma defterde TEK satır bırakır ve satırlar birbirine karışmaz', async () => {
    const player = await registerTestPlayer(app, 'Defter Sayımı');
    const first = await deposit(player, { amount: MIN }).expect(200);
    const second = await deposit(player, { amount: MIN + 1 }).expect(200);

    const count = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM economy_transactions WHERE player_id = $1',
      [player.playerId],
    );
    expect(Number(count.rows[0]!.count)).toBe(2);

    // Referanslar TEKİL ve birbirinden farklı — mutabakatın ön koşulu.
    const refs = [first.body.data.providerReference, second.body.data.providerReference];
    expect(new Set(refs).size).toBe(2);
    for (const ref of refs) {
      expect((await ledgerRowsByReference(ref)).length).toBe(1);
    }

    // Bakiye zinciri kopuk değil: ikinci satırın balance_before'ı
    // birincinin balance_after'ıdır.
    const rows = await pool.query<{ balance_before: string; balance_after: string }>(
      'SELECT balance_before, balance_after FROM economy_transactions WHERE player_id = $1 ORDER BY created_at',
      [player.playerId],
    );
    expect(Number(rows.rows[1]!.balance_before)).toBe(Number(rows.rows[0]!.balance_after));
    expect(Number(rows.rows[1]!.balance_after)).toBe(STARTING_MONEY + MIN + MIN + 1);
  });
});
