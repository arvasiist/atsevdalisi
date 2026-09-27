import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEconomyConfig } from '@at-sevdalisi/game-config';
import { ErrorCode, type WalletTransaction } from '@at-sevdalisi/shared-types';
import { TOKEN_SERVICE, type TokenService } from '../../src/application/ports/token.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * CÜZDAN + İŞLEM GEÇMİŞİ — `GET /players/:id/wallet` (brief §20 "WALLET
 * SYSTEM", §22 "ECONOMY SECURITY", §42 PHASE 4).
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *
 *  1. **Cüzdan GERÇEK bakiyeyi gösterir.** `money`/`gems`, `GET /players/:id`
 *     ile TIPATIP aynıdır — cüzdan ikinci bir doğruluk kaynağı DEĞİLDİR.
 *  2. **Defter GERÇEKTEN okunur.** Günlük ödül alındıktan sonra o hareket
 *     `transactions` içinde, doğru `type`/`canonicalType`/`amount`/
 *     `balanceBefore`/`balanceAfter` ile görünür. Bu, "okuma yolu yazma
 *     yolunu yansıtıyor mu?" sorusunun cevabıdır — ve `canonicalType`'ın
 *     ÇALIŞMA ZAMANINDA tanımlı olduğunu (yani `type` → aile eşlemesinin
 *     gerçek yazılmış satırlar için de tuttuğunu) kanıtlar.
 *  3. **Sayfalama DOĞRU.** `hasMore` sunucudan gelir; `?limit` sessizce
 *     kırpılır, HİÇBİR girdi 400/500 üretmez.
 *  4. **Defter DEĞİŞTİRİLEMEZ (immutable).** Ham `UPDATE` ve ham `DELETE`
 *     reddedilir; defter satırı denemeden sonra BİT BİT aynıdır. Ama
 *     oyuncu silinmesinin CASCADE'i (bilinçli istisna) ÇALIŞMAYA DEVAM eder
 *     — bu istisna kaldırılırsa oyuncu silme kırılır ve bu test onu
 *     yakalar.
 *  5. **SALT OKUMA.** Cüzdan okumak bakiyeyi, defter satır sayısını veya
 *     hiçbir şeyi DEĞİŞTİRMEZ.
 *
 * **NEDEN HAM SQL (pool) KULLANILIYOR:** 2-4 numaralı iddiaların hiçbiri
 * HTTP üzerinden kurulamaz — "defter değiştirilemez" iddiası tam olarak
 * HTTP dışı bir yazma denemesidir, ve sayfalama sırasını deterministik
 * kılmak için `created_at`'i biz belirlemeliyiz (üretim yolları `now()`
 * kullanır). Bu dosyanın üretim koduna yaptığı TEK varsayım, defterin
 * şeklidir (migration 0019 + 0038) — o da `economy-ledger-immutability.spec.ts`
 * tarafından ayrıca denetlenir.
 */
describe('Cüzdan (e2e) — GET /players/:id/wallet', () => {
  let app: INestApplication;
  let pool: Pool;
  let tokenService: TokenService;

  let owner: RegisteredTestPlayer;
  let intruder: RegisteredTestPlayer;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    tokenService = app.get<TokenService>(TOKEN_SERVICE);
    owner = await registerTestPlayer(app, 'Cüzdan Sahibi');
    intruder = await registerTestPlayer(app, 'Davetsiz Misafir');
  });

  afterAll(async () => {
    await app.close();
  });

  const STARTING_MONEY = loadEconomyConfig().newPlayerStartingBalance.money;
  const DAILY_REWARD_MONEY = loadEconomyConfig().dailyRewardMoney;
  const MAX_LIMIT = loadEconomyConfig().walletHistoryMaxLimit;
  const DEFAULT_LIMIT = loadEconomyConfig().walletHistoryDefaultLimit;

  function walletUrl(playerId: string, limit?: string) {
    const base = `/api/v1/players/${playerId}/wallet`;
    return limit === undefined ? base : `${base}?limit=${limit}`;
  }

  /** Cüzdan isteği — `limit` HAM geçirilir (`undefined` ise parametre hiç eklenmez). */
  function getWallet(player: RegisteredTestPlayer, playerId = player.playerId, limit?: string) {
    return request(app.getHttpServer()).get(walletUrl(playerId, limit)).set('Authorization', player.authHeader);
  }

  /** Oyuncunun bakiyesi — cüzdanın ikinci bir doğruluk kaynağı olmadığını kanıtlamak için AYRI uçtan okunur. */
  async function balanceOf(player: RegisteredTestPlayer): Promise<{ money: number; gems: number }> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return { money: response.body.data.money as number, gems: response.body.data.gems as number };
  }

  async function ledgerCountOf(playerId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM economy_transactions WHERE player_id = $1',
      [playerId],
    );
    return Number(result.rows[0]!.count);
  }

  /**
   * Deftere HAM satır ekler. Yalnızca EKLEME yapar — `UPDATE`/`DELETE`
   * migration 0038'in trigger'ı tarafından reddedilir (aşağıda sınanıyor).
   *
   * `balance_after = balance_before + amount` kısıtı (migration 0019)
   * yüzünden ikisi AÇIKÇA verilir; `created_at` de açıkça verilir ki
   * sıralama iddiası deterministik olsun.
   */
  async function insertLedgerRow(options: {
    playerId: string;
    type: string;
    amount: number;
    secondsAgo: number;
  }): Promise<string> {
    // `now() - $4 * interval '1 second'` — parametre AÇIKÇA `::int`'e
    // çevrilir; `($4 || ' seconds')::interval` gibi bir kalıp Postgres'te
    // "could not determine data type of parameter" hatası verebilir.
    const result = await pool.query<{ id: string }>(
      `INSERT INTO economy_transactions
         (player_id, type, amount, currency, reference_type, reference_id,
          balance_before, balance_after, created_at)
       VALUES ($1, $2, $3, 'money', NULL, NULL, 0, $3, now() - ($4::int * interval '1 second'))
       RETURNING id`,
      [options.playerId, options.type, options.amount, options.secondsAgo],
    );
    return result.rows[0]!.id;
  }

  // ---------------------------------------------------------------- mutlu yol

  it('kendi cüzdanını okur: 200 döner ve bakiye GET /players/:id ile AYNI', async () => {
    const response = await getWallet(owner).expect(200);
    const wallet = response.body.data;

    expect(wallet.playerId).toBe(owner.playerId);
    expect(wallet.money).toBe(STARTING_MONEY);
    expect(wallet.gems).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(wallet.transactions)).toBe(true);
    expect(typeof wallet.hasMore).toBe('boolean');

    // Cüzdanın kendi başına bir "doğruluk kaynağı" olmadığının kanıtı:
    const balance = await balanceOf(owner);
    expect(wallet.money).toBe(balance.money);
    expect(wallet.gems).toBe(balance.gems);
  });

  it('YENİ oyuncunun defteri BOŞTUR — başlangıç bakiyesi bir "hareket" değildir', async () => {
    // `RegisterPlayerUseCase` `players.money`'yi doğrudan yazar; hiçbir
    // `economy_transactions` satırı üretmez (bkz. kod: deftere yazan 4 yer
    // var, kayıt bunlardan biri DEĞİL). Bu iddia, ileride kayıt yoluna
    // sessizce bir defter kaydı eklenirse (ve cüzdan ekranı "para yatırdın"
    // gibi yanlış bir satır göstermeye başlarsa) haber verir.
    const fresh = await registerTestPlayer(app, 'Yeni Oyuncu');
    const response = await getWallet(fresh).expect(200);
    expect(response.body.data.transactions).toEqual([]);
    expect(response.body.data.hasMore).toBe(false);
    expect(await ledgerCountOf(fresh.playerId)).toBe(0);
  });

  it('günlük ödül alındıktan sonra hareket defterde GÖRÜNÜR (doğru type + aile)', async () => {
    const before = await balanceOf(owner);

    const claim = await request(app.getHttpServer())
      .post(`/api/v1/players/${owner.playerId}/daily-reward`)
      .set('Authorization', owner.authHeader)
      .expect(200);
    expect(claim.body.data.amount).toBe(DAILY_REWARD_MONEY);

    const response = await getWallet(owner).expect(200);
    const wallet = response.body.data;

    const reward = (wallet.transactions as WalletTransaction[]).find((tx) => tx.type === 'daily_reward');
    expect(reward, 'Günlük ödül hareketi defterde bulunamadı.').toBeDefined();

    expect(reward!.canonicalType).toBe('REWARD');
    expect(reward!.amount).toBe(DAILY_REWARD_MONEY);
    expect(reward!.currency).toBe('money');
    expect(reward!.balanceBefore).toBe(before.money);
    expect(reward!.balanceAfter).toBe(before.money + DAILY_REWARD_MONEY);
    expect(reward!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(Number.isNaN(Date.parse(reward!.createdAt))).toBe(false);

    // Bakiye gerçekten arttı ve cüzdan bunu yansıtıyor.
    expect(wallet.money).toBe(before.money + DAILY_REWARD_MONEY);
    expect(wallet.money).toBe((await balanceOf(owner)).money);
  });

  it('DÖNDÜRÜLEN HER hareketin canonicalType’ı TANIMLI (aile eşlemesi boşluğu yok)', async () => {
    // Bu iddia taksonominin ÇALIŞMA ZAMANI tarafını kapatır:
    // `PostgresWalletRepository` `type`'ı `LedgerTransactionType` diye
    // İDDİA eder ve `CANONICAL_BY_LEDGER_TYPE`'tan okur. Veritabanına
    // (veya üretim koduna) listede OLMAYAN bir `type` sızarsa burası
    // `undefined` görür.
    const response = await getWallet(owner).expect(200);
    const transactions = response.body.data.transactions as WalletTransaction[];
    expect(transactions.length).toBeGreaterThan(0);
    for (const tx of transactions) {
      expect(tx.canonicalType, `'${tx.type}' için kanonik aile tanımsız.`).toBeDefined();
      expect(tx.canonicalType).not.toBeNull();
    }
  });

  // ------------------------------------------------------------- sayfalama

  it('sayfalama: hasMore sunucudan gelir, sıralama YENİDEN ESKİYE', async () => {
    const pager = await registerTestPlayer(app, 'Sayfalayan Oyuncu');
    // Farklı tutarlar → sıralamayı ID ile değil ANLAM ile doğrularız.
    await insertLedgerRow({ playerId: pager.playerId, type: 'daily_reward', amount: 11, secondsAgo: 3600 });
    await insertLedgerRow({ playerId: pager.playerId, type: 'feed_purchase', amount: 22, secondsAgo: 7200 });
    await insertLedgerRow({ playerId: pager.playerId, type: 'stable_upgrade', amount: 33, secondsAgo: 10800 });

    // 3 satır var, limit 2 → 2 döner ve "daha var" der.
    const firstPage = (await getWallet(pager, pager.playerId, '2').expect(200)).body.data;
    expect((firstPage.transactions as WalletTransaction[]).map((tx) => tx.amount)).toEqual([11, 22]);
    expect(firstPage.hasMore).toBe(true);

    // limit 3 (tam sınır) → 3 döner, "daha var" DEMEZ (klasik off-by-one).
    const exact = (await getWallet(pager, pager.playerId, '3').expect(200)).body.data;
    expect((exact.transactions as WalletTransaction[]).map((tx) => tx.amount)).toEqual([11, 22, 33]);
    expect(exact.hasMore).toBe(false);

    // limit 10 → hepsi, "daha var" DEMEZ.
    const all = (await getWallet(pager, pager.playerId, '10').expect(200)).body.data;
    expect((all.transactions as WalletTransaction[]).length).toBe(3);
    expect(all.hasMore).toBe(false);
  });

  it('sayfalama: ham eklenen satırların aileleri de doğru eşlenir', async () => {
    const pager = await registerTestPlayer(app, 'Aile Kontrol');
    await insertLedgerRow({ playerId: pager.playerId, type: 'feed_purchase', amount: 5, secondsAgo: 60 });
    const response = await getWallet(pager).expect(200);
    const tx = (response.body.data.transactions as WalletTransaction[])[0]!;
    expect(tx.type).toBe('feed_purchase');
    expect(tx.canonicalType).toBe('UPKEEP');
  });

  it('?limit=abc → 400 DEĞİL, varsayılana düşer', async () => {
    const response = await getWallet(owner, owner.playerId, 'abc').expect(200);
    // Varsayılan tavan, sahip olunan satır sayısından büyük olduğu için
    // hepsi döner — iddia "patlamadı ve makul bir sayfa döndü".
    expect(Array.isArray(response.body.data.transactions)).toBe(true);
    expect(response.body.data.transactions.length).toBeLessThanOrEqual(DEFAULT_LIMIT);
  });

  it('?limit=100000 → tavanı AŞMAZ (sessizce kırpılır)', async () => {
    const response = await getWallet(owner, owner.playerId, '100000').expect(200);
    expect(response.body.data.transactions.length).toBeLessThanOrEqual(MAX_LIMIT);
  });

  it('?limit=0 ve ?limit=-5 → 200 döner (boş/geçersiz değer isteği patlatmaz)', async () => {
    await getWallet(owner, owner.playerId, '0').expect(200);
    await getWallet(owner, owner.playerId, '-5').expect(200);
  });

  // ------------------------------------------------------------- yetki

  it('token YOKSA 401 UNAUTHORIZED', async () => {
    const response = await request(app.getHttpServer()).get(walletUrl(owner.playerId)).expect(401);
    expect(response.body.error.code).toBe(ErrorCode.Unauthorized);
  });

  it('BAŞKASININ cüzdanı 403 FORBIDDEN (sunucu otoritesi — brief §22)', async () => {
    const response = await getWallet(intruder, owner.playerId).expect(403);
    expect(response.body.error.code).toBe(ErrorCode.Forbidden);
  });

  it('var OLMAYAN oyuncunun cüzdanı 404 PLAYER_NOT_FOUND', async () => {
    // `AuthGuard` token'ın `sub` claim'ine GÜVENİR, oyuncunun var olduğunu
    // AYRIca sorgulamaz (bkz. `auth.guard.ts` doc yorumu). Bu yüzden
    // rastgele bir UUID için imzalanmış GEÇERLİ bir token guard'ı geçer ve
    // `assertSelf` de eşleşir (id === currentPlayer.id) — 404 kararı
    // repository'nin `null` dönüşünden gelir. Bu test tam olarak o dalı
    // kanıtlar.
    const ghostId = randomUUID();
    const ghostToken = tokenService.sign({ sub: ghostId });
    const response = await request(app.getHttpServer())
      .get(walletUrl(ghostId))
      .set('Authorization', `Bearer ${ghostToken}`)
      .expect(404);
    expect(response.body.error.code).toBe(ErrorCode.PlayerNotFound);
  });

  // ------------------------------------------------- defter değişmezliği

  it('defter satırı HAM UPDATE ile DEĞİŞTİRİLEMEZ (brief §20 immutable)', async () => {
    const rowId = await insertLedgerRow({
      playerId: owner.playerId,
      type: 'daily_reward',
      amount: 7,
      secondsAgo: 30,
    });

    const error = await pool
      .query('UPDATE economy_transactions SET amount = 999999 WHERE id = $1', [rowId])
      .then(() => null)
      .catch((caught: { code?: string }) => caught);

    expect(error, 'Ham UPDATE reddedilmedi — defter değiştirilebilir!').not.toBeNull();
    // `restrict_violation` (migration 0038'in ERRCODE'u).
    expect(error!.code).toBe('23001');

    // Ve satır GERÇEKTEN değişmemiş.
    const after = await pool.query<{ amount: string }>(
      'SELECT amount FROM economy_transactions WHERE id = $1',
      [rowId],
    );
    expect(Number(after.rows[0]!.amount)).toBe(7);
  });

  it('defter satırı HAM DELETE ile SİLİNEMEZ (izlenebilirlik — brief §22)', async () => {
    const rowId = await insertLedgerRow({
      playerId: owner.playerId,
      type: 'daily_reward',
      amount: 9,
      secondsAgo: 20,
    });

    const error = await pool
      .query('DELETE FROM economy_transactions WHERE id = $1', [rowId])
      .then(() => null)
      .catch((caught: { code?: string }) => caught);

    expect(error, 'Ham DELETE reddedilmedi — defter silinebilir!').not.toBeNull();
    expect(error!.code).toBe('23001');

    const after = await pool.query('SELECT id FROM economy_transactions WHERE id = $1', [rowId]);
    expect(after.rows.length).toBe(1);
  });

  it('OYUNCU silinmesinin CASCADE’i çalışmaya DEVAM eder (bilinçli istisna)', async () => {
    // Migration 0038'deki `pg_trigger_depth() > 1` istisnası KALDIRILIRSA
    // bu test kırılır: koşulsuz bir DELETE yasağı, `players` silinmesinin
    // CASCADE'ini de engeller ve oyuncu silmeyi imkansız kılar.
    //
    // Test TAMAMEN geri alınır (BEGIN ... ROLLBACK) — kalıcı hiçbir şey
    // yazılmaz; amaç yalnızca CASCADE yolunun trigger'ı geçtiğini
    // görmektir.
    const doomed = await registerTestPlayer(app, 'Silinecek Oyuncu');
    await insertLedgerRow({ playerId: doomed.playerId, type: 'daily_reward', amount: 3, secondsAgo: 10 });

    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      // CASCADE burada defter satırını da siler; trigger derinlik 2'de
      // çalıştığı için izin verilmelidir.
      await client.query('DELETE FROM players WHERE id = $1', [doomed.playerId]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }

    // Geri alındı: oyuncu ve defter satırı hâlâ yerinde.
    expect(await ledgerCountOf(doomed.playerId)).toBe(1);
  });

  // ------------------------------------------------------------- salt okuma

  it('cüzdan okumak HİÇBİR ŞEYİ değiştirmez (salt okuma)', async () => {
    const before = await balanceOf(owner);
    const beforeCount = await ledgerCountOf(owner.playerId);

    await getWallet(owner).expect(200);
    await getWallet(owner, owner.playerId, '1').expect(200);
    await getWallet(owner, owner.playerId, 'abc').expect(200);

    const after = await balanceOf(owner);
    expect(after).toEqual(before);
    expect(await ledgerCountOf(owner.playerId)).toBe(beforeCount);
  });
});
