import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * YÖNETİM (ADMIN) — moderasyon kuyruğu + denetim günlüğü (brief §34,
 * §42 PHASE 15-B).
 *
 * Diğer e2e dosyalarıyla AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL gerektirir).
 *
 * **BU DOSYANIN KANITLADIĞI ASIL ŞEYLER:**
 *   (1) YETKİ KAPISI GERÇEKTEN KAPALI: yönetici olmayan bir oyuncu ALTI uç
 *       noktanın hiçbirini çağıramaz (403 `ADMIN_REQUIRED`) — ve
 *       VAR OLMAYAN bir şikâyet kimliğiyle denediğinde de 403 alır, 404
 *       DEĞİL. Yani kuyruktaki kimlikleri YOKLAYAMAZ (IDOR).
 *   (2) ROL VERİTABANINDAN OKUNUR: aynı token, `players.is_admin`
 *       değiştiği ANDA farklı sonuç verir — rol token'a gömülü DEĞİLDİR.
 *   (3) GEÇİŞ ÇİZGESİ ZORUNLU: yasak geçiş 400 `INVALID_REPORT_STATUS`
 *       döner ve **HİÇBİR ŞEY YAZILMAZ** (ne durum ne denetim kaydı) —
 *       bunun kanıtı SQL ile satır sayılarak verilir.
 *   (4) DENETİM KAYDI AYNI TRANSACTION'DA: başarılı bir güncellemeden sonra
 *       `admin_audit_log`ta `report.status_changed` + `{from,to}` satırı
 *       vardır.
 *   (5) OKUMA EKRANLARI (brief §34 "Users / Races / Transactions / Wallet /
 *       Gifts") VERİYİ SAYI OLARAK döner: `money`/`xp`/`amount`/`entryFee`
 *       BIGINT'tir ve `pg` bunları varsayılan olarak METİN verir — dönüşüm
 *       unutulsaydı istemci `"1234"` görürdü ve bu HİÇBİR YERDE hata
 *       üretmezdi. Testler `typeof === 'number'` iddia eder.
 *   (6) `joinedPlayers` sayımı İPTAL EDİLMİŞ katılımı dışlar ama `status`ı
 *       NULL olan girişi SAYAR (`IS DISTINCT FROM`, `<>` değil).
 *
 * **YÖNETİCİ NASIL YAPILIR — DÜRÜST NOT:** projede yönetici ATAMANIN bir
 * arayüzü/uç noktası YOKTUR (bu bilinçlidir: kendini yönetici yapabilen bir
 * uç nokta, yönetim yetkisini anlamsız kılardı). Bu yüzden testler
 * `players.is_admin` kolonunu DOĞRUDAN SQL ile açar — `gift.e2e-spec.ts`in
 * bakiyeyi `UPDATE` ile kurmasıyla AYNI yöntem. Gerçek dağıtımda bu kolon
 * elle (`UPDATE players SET is_admin = true WHERE ...`) açılır; brief §34
 * "kullanıcı yönetimi" ekranı geldiğinde bu, denetim günlüğüne yazılan bir
 * yönetim işlemi hâline gelmelidir.
 *
 *   (7) **YARIŞ İPTALİ BİR PARA YOLUDUR** (`POST /admin/races/:raceId/
 *       cancel`, 28.09.2026): iade DEFTERDEN hesaplanır, bakiyeler SQL ile
 *       doğrulanır, havuz sıfırlanır ve çift iade DURUM GEÇİŞİYLE
 *       engellenir. Bot payı iade EDİLMEZ (ödediği para yoktur).
 *
 * **DENETİM GÜNLÜĞÜ ≠ MUHASEBE DEFTERİ.** `admin_audit_log` bir YETKİ
 * kaydıdır ("kim, ne zaman, hangi kaydı değiştirdi"); para yalnızca
 * `economy_transactions`ta hareket eder. İptal ucu İKİSİNE DE yazar ve
 * ikisi AYNI transaction'dadır (migration 0041 notu).
 */
describe('Admin — moderasyon kuyruğu + denetim günlüğü (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const reportsAdminUrl = '/api/v1/admin/reports';
  const auditLogUrl = '/api/v1/admin/audit-log';
  const playersAdminUrl = '/api/v1/admin/players';
  const racesAdminUrl = '/api/v1/admin/races';
  const transactionsAdminUrl = '/api/v1/admin/transactions';
  const reportStatusUrl = (reportId: string) => `/api/v1/admin/reports/${reportId}`;
  const cancelRaceUrl = (raceId: string) => `/api/v1/admin/races/${raceId}/cancel`;
  const playerReportsUrl = (playerId: string) => `/api/v1/players/${playerId}/reports`;

  /** Oyuncuyu yönetici yapar (bkz. dosya başı "DÜRÜST NOT"). */
  async function makeAdmin(playerId: string, isAdmin = true): Promise<void> {
    await pool.query('UPDATE players SET is_admin = $2 WHERE id = $1', [playerId, isAdmin]);
  }

  /** Bir şikâyet kaydı yaratır ve kimliğini döner. */
  async function createReport(
    reporter: RegisteredTestPlayer,
    reported: RegisteredTestPlayer,
    category = 'spam',
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(playerReportsUrl(reporter.playerId))
      .set('Authorization', reporter.authHeader)
      .send({ reportedId: reported.playerId, category, reason: 'e2e testi' })
      .expect(201);
    return response.body.data.reportId as string;
  }

  /** `admin_audit_log`taki satır sayısı — "hiçbir şey yazılmadı"nın GERÇEK kanıtı. */
  async function countAuditRowsFor(reportId: string): Promise<number> {
    const result = await pool.query(
      `SELECT count(*)::int AS count FROM admin_audit_log
        WHERE target_type = 'player_report' AND target_id = $1`,
      [reportId],
    );
    return result.rows[0].count as number;
  }

  /** Bir şikâyetin durumunu doğrudan SQL ile okur (yanıt gövdesine GÜVENMEDEN). */
  async function readStatus(reportId: string): Promise<string> {
    const result = await pool.query('SELECT status FROM player_reports WHERE id = $1', [reportId]);
    return result.rows[0].status as string;
  }

  /** PATCH çağrısı — beklenen kod ZORUNLU (çağrı yerinde okunur). */
  async function patchStatus(
    caller: RegisteredTestPlayer,
    reportId: string,
    status: unknown,
    expectedStatus: number,
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .patch(reportStatusUrl(reportId))
      .set('Authorization', caller.authHeader)
      .send({ status })
      .expect(expectedStatus);
  }

  describe('yetki kapısı', () => {
    it('yönetici OLMAYAN YEDİ uç noktada da 403 ADMIN_REQUIRED alır', async () => {
      const player = await registerTestPlayer(app, 'Yönetici Değil');

      // HER UÇ TEK TEK denenir: biri unutulursa (yeni bir uç eklenip kapı
      // konmazsa) bu test KIRILIR. Liste üzerinden dolaşılır ki yeni bir uç
      // eklemek yalnızca tek satır gerektirsin.
      for (const url of [reportsAdminUrl, auditLogUrl, playersAdminUrl, racesAdminUrl, transactionsAdminUrl]) {
        const response = await request(app.getHttpServer())
          .get(url)
          .set('Authorization', player.authHeader)
          .expect(403);
        expect(response.body.error.code).toBe('ADMIN_REQUIRED');
      }

      const patch = await patchStatus(player, '00000000-0000-0000-0000-000000000001', 'reviewing', 403);
      expect(patch.body.error.code).toBe('ADMIN_REQUIRED');

      // PARA YOLU DA AYNI KAPIDAN GEÇER: iptal ucu, yönetici olmayan bir
      // oyuncuya 403 döner — yani başkalarının giriş ücretlerini iade
      // ettiremez. Var olmayan bir yarış kimliğiyle bile 403 (404 DEĞİL):
      // aksi hâlde hangi yarışların var olduğu yoklanabilirdi.
      const cancel = await request(app.getHttpServer())
        .post(cancelRaceUrl('00000000-0000-0000-0000-000000000003'))
        .set('Authorization', player.authHeader)
        .expect(403);
      expect(cancel.body.error.code).toBe('ADMIN_REQUIRED');
    });

    it('BAKİYE uçları yönetici olmayana 403 verir — para SIZMAZ', async () => {
      // Ayrı bir test, çünkü iddia farklı: `GET /admin/players` ve
      // `GET /admin/transactions` diğer okuma uçlarından AYRI bir sınıftır
      // — biri herkesin BAKİYESİNİ, diğeri tüm para hareketlerini taşır.
      // Yanıt gövdesinde tek bir oyuncu adı bile OLMAMALIDIR.
      const player = await registerTestPlayer(app, 'Bakiye Yoklayan');

      for (const url of [playersAdminUrl, transactionsAdminUrl]) {
        const response = await request(app.getHttpServer())
          .get(url)
          .set('Authorization', player.authHeader)
          .expect(403);
        expect(response.body.error.code).toBe('ADMIN_REQUIRED');
        // Hata zarfı `data` TAŞIMAZ (docs/API.md §1.1) — yani 403 gövdesi
        // kazara bir liste sızdıramaz.
        expect(response.body.data).toBeUndefined();
        expect(JSON.stringify(response.body)).not.toContain(player.playerId);
      }
    });

    it('yönetici olmayan, VAR OLMAYAN bir şikâyet kimliği için 404 DEĞİL 403 alır (IDOR)', async () => {
      // ASIL İDDİA: 404 dönseydi, yönetici olmayan bir oyuncu kimlikleri
      // deneyerek hangilerinin var olduğunu öğrenebilirdi. Yetki kapısı
      // `ReportNotFoundError` kontrolünden ÖNCE olduğu için ikisi de 403.
      const player = await registerTestPlayer(app, 'Kimlik Yoklayan');
      const response = await patchStatus(
        player,
        '00000000-0000-0000-0000-000000000002',
        'reviewing',
        403,
      );
      expect(response.body.error.code).toBe('ADMIN_REQUIRED');
    });

    it('token YOKSA 401 döner (403 değil — kimlik doğrulanmamış)', async () => {
      await request(app.getHttpServer()).get(reportsAdminUrl).expect(401);
      await request(app.getHttpServer()).get(auditLogUrl).expect(401);
    });

    it('ROL TOKENA GÖMÜLÜ DEĞİLDİR: aynı token, kolon değişince ANINDA yetki kazanır/kaybeder', async () => {
      // Bu, migration 0041'in "rol token'a gömülmez" kararının
      // ÇALIŞTIĞININ kanıtıdır. Rol JWT'ye konsaydı, yetki verilmesi için
      // YENİ BİR TOKEN alınması, geri alınması için de token süresinin
      // dolması gerekirdi.
      const player = await registerTestPlayer(app, 'Rol Tazeleyen');

      await request(app.getHttpServer())
        .get(reportsAdminUrl)
        .set('Authorization', player.authHeader)
        .expect(403);

      await makeAdmin(player.playerId);

      await request(app.getHttpServer())
        .get(reportsAdminUrl)
        .set('Authorization', player.authHeader)
        .expect(200);

      await makeAdmin(player.playerId, false);

      await request(app.getHttpServer())
        .get(reportsAdminUrl)
        .set('Authorization', player.authHeader)
        .expect(403);
    });
  });

  describe('GET /admin/reports', () => {
    it('kuyruk şikâyeti görünür adlarla ve `reviewedBy: null` ile döner', async () => {
      const admin = await registerTestPlayer(app, 'Kuyruk Yöneticisi');
      await makeAdmin(admin.playerId);
      const reporter = await registerTestPlayer(app, 'Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Şikâyet Edilen');

      const reportId = await createReport(reporter, reported, 'harassment');

      const response = await request(app.getHttpServer())
        .get(reportsAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.reports as Array<Record<string, unknown>>).find(
        (r) => r.reportId === reportId,
      );
      expect(row).toBeDefined();
      // Görünen adlar JOIN ile gelir — istemci N+1 istek atmak zorunda
      // kalmaz (bkz. `AdminReportView` doc yorumu).
      expect(row?.reporter).toEqual({ playerId: reporter.playerId, displayName: 'Şikâyet Eden' });
      expect(row?.reported).toEqual({ playerId: reported.playerId, displayName: 'Şikâyet Edilen' });
      expect(row?.category).toBe('harassment');
      expect(row?.reason).toBe('e2e testi');
      expect(row?.status).toBe('open');
      // GEÇİŞ ÇİZGİSİ SUNUCUDAN GELİR (28.09.2026): istemci kendi kuralını
      // yazmaz, çünkü iki kaynağın çeliştiği an sunucunun reddedeceği bir
      // düğmeyi geçerli gösterir. `open`dan üçü de serbesttir (§13.17).
      expect(row?.allowedTransitions).toEqual(['reviewing', 'resolved', 'dismissed']);
      // Henüz ele alınmadı: "kim" bilgisi YOKTUR (`status`'tan türetilemez).
      expect(row?.reviewedBy).toBeNull();
      expect(row?.reviewedAt).toBeNull();
    });

    it('KAPANMIŞ şikâyetler de listede kalır (kuyruk bir iş listesi değil, kayıt görünümüdür)', async () => {
      // Süzgeç sunucuda olsaydı "bu oyuncu daha önce şikâyet edilmiş miydi"
      // sorusu yanıtlanamazdı (bkz. port doc yorumu).
      const admin = await registerTestPlayer(app, 'Kapanmış Kuyruk Yöneticisi');
      await makeAdmin(admin.playerId);
      const reporter = await registerTestPlayer(app, 'Kapanmış Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Kapanmış Şikâyet Edilen');

      const reportId = await createReport(reporter, reported);
      await patchStatus(admin, reportId, 'dismissed', 200);

      const response = await request(app.getHttpServer())
        .get(reportsAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.reports as Array<Record<string, unknown>>).find(
        (r) => r.reportId === reportId,
      );
      expect(row?.status).toBe('dismissed');
      // TERMİNAL DURUM: `dismissed`/`resolved` ÇIKIŞSIZDIR — sunucu BOŞ
      // liste döner ve istemci "boş dizi = eylem yok" diye okur (bu yüzden
      // `undefined` DEĞİL `[]` olması önemlidir: `undefined` "bilinmiyor"
      // gibi görünürdü).
      expect(row?.allowedTransitions).toEqual([]);
      expect(row?.reviewedBy).toEqual({ playerId: admin.playerId, displayName: 'Kapanmış Kuyruk Yöneticisi' });
      expect(typeof row?.reviewedAt).toBe('string');
    });
  });

  describe('PATCH /admin/reports/:reportId', () => {
    it('geçerli geçişte durumu değiştirir, ele alan bilgisini yazar ve DENETİM KAYDI üretir', async () => {
      const admin = await registerTestPlayer(app, 'Güncelleyen Yönetici');
      await makeAdmin(admin.playerId);
      const reporter = await registerTestPlayer(app, 'Güncelleme Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Güncelleme Şikâyet Edilen');

      const reportId = await createReport(reporter, reported);
      expect(await countAuditRowsFor(reportId)).toBe(0);

      const response = await patchStatus(admin, reportId, 'reviewing', 200);
      expect(response.body.data.reportId).toBe(reportId);
      expect(response.body.data.status).toBe('reviewing');
      expect(response.body.data.reviewedBy).toEqual({
        playerId: admin.playerId,
        displayName: 'Güncelleyen Yönetici',
      });
      expect(typeof response.body.data.reviewedAt).toBe('string');

      // DB'DEN doğrula — yanıt gövdesi tek başına kanıt değildir.
      expect(await readStatus(reportId)).toBe('reviewing');

      const audit = await pool.query(
        `SELECT admin_id, action, target_type, target_id, details
           FROM admin_audit_log
          WHERE target_type = 'player_report' AND target_id = $1`,
        [reportId],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].admin_id).toBe(admin.playerId);
      expect(audit.rows[0].action).toBe('report.status_changed');
      expect(audit.rows[0].details).toEqual({ from: 'open', to: 'reviewing' });
    });

    it('`open`dan doğrudan kapanışa geçiş SERBESTTİR', async () => {
      const admin = await registerTestPlayer(app, 'Doğrudan Kapatan');
      await makeAdmin(admin.playerId);
      const reporter = await registerTestPlayer(app, 'Doğrudan Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Doğrudan Şikâyet Edilen');

      const reportId = await createReport(reporter, reported);
      await patchStatus(admin, reportId, 'resolved', 200);
      expect(await readStatus(reportId)).toBe('resolved');
    });

    it('YASAK GEÇİŞ 400 INVALID_REPORT_STATUS döner ve HİÇBİR ŞEY yazılmaz', async () => {
      // ASIL İDDİA: rollback. Yalnızca HTTP koduna bakmak yetmez —
      // durum değişmiş ama denetim kaydı yazılmamış (ya da tersi) bir
      // durum da 400 dönebilirdi. İkisi de AYNI transaction'da olduğu
      // için ikisi de yazılmamış olmalıdır.
      const admin = await registerTestPlayer(app, 'Yasak Geçiş Yöneticisi');
      await makeAdmin(admin.playerId);
      const reporter = await registerTestPlayer(app, 'Yasak Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Yasak Şikâyet Edilen');

      const reportId = await createReport(reporter, reported);
      await patchStatus(admin, reportId, 'resolved', 200);
      const auditAfterClose = await countAuditRowsFor(reportId);

      const response = await patchStatus(admin, reportId, 'open', 400);
      expect(response.body.error.code).toBe('INVALID_REPORT_STATUS');

      // Ne durum ne denetim kaydı değişti.
      expect(await readStatus(reportId)).toBe('resolved');
      expect(await countAuditRowsFor(reportId)).toBe(auditAfterClose);
    });

    it('AYNI duruma geçiş de 400 döner ve denetim kaydı ÜRETMEZ (bayat istemci)', async () => {
      const admin = await registerTestPlayer(app, 'Aynı Durum Yöneticisi');
      await makeAdmin(admin.playerId);
      const reporter = await registerTestPlayer(app, 'Aynı Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Aynı Şikâyet Edilen');

      const reportId = await createReport(reporter, reported);
      await patchStatus(admin, reportId, 'reviewing', 200);
      const before = await countAuditRowsFor(reportId);

      const response = await patchStatus(admin, reportId, 'reviewing', 400);
      expect(response.body.error.code).toBe('INVALID_REPORT_STATUS');
      // `reviewed_at` gereksiz ilerlemez ve günlük gürültüye boğulmaz.
      expect(await countAuditRowsFor(reportId)).toBe(before);
    });

    it('BİLİNMEYEN durum 400 INVALID_REPORT_STATUS döner', async () => {
      const admin = await registerTestPlayer(app, 'Bilinmeyen Durum Yöneticisi');
      await makeAdmin(admin.playerId);
      const reporter = await registerTestPlayer(app, 'Bilinmeyen Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Bilinmeyen Şikâyet Edilen');

      const reportId = await createReport(reporter, reported);

      for (const bogus of ['closed', 'OPEN', ' open ', '', 42, null]) {
        const response = await patchStatus(admin, reportId, bogus, 400);
        expect(response.body.error.code).toBe('INVALID_REPORT_STATUS');
      }
      // Hiçbiri durumu değiştirmedi.
      expect(await readStatus(reportId)).toBe('open');
      expect(await countAuditRowsFor(reportId)).toBe(0);
    });

    it('yönetici için VAR OLMAYAN şikâyet 404 REPORT_NOT_FOUND döner', async () => {
      const admin = await registerTestPlayer(app, 'Olmayanı Arayan Yönetici');
      await makeAdmin(admin.playerId);

      const response = await patchStatus(
        admin,
        '00000000-0000-0000-0000-000000000003',
        'reviewing',
        404,
      );
      expect(response.body.error.code).toBe('REPORT_NOT_FOUND');
    });

    it('geçersiz UUID yol parametresi 400 döner (veritabanına hiç gitmez)', async () => {
      const admin = await registerTestPlayer(app, 'Geçersiz UUID Yöneticisi');
      await makeAdmin(admin.playerId);

      await request(app.getHttpServer())
        .patch('/api/v1/admin/reports/not-a-uuid')
        .set('Authorization', admin.authHeader)
        .send({ status: 'reviewing' })
        .expect(400);
    });
  });

  describe('GET /admin/audit-log', () => {
    it('yazılan denetim kaydı günlükte görünür', async () => {
      const admin = await registerTestPlayer(app, 'Günlük Okuyan Yönetici');
      await makeAdmin(admin.playerId);
      const reporter = await registerTestPlayer(app, 'Günlük Şikâyet Eden');
      const reported = await registerTestPlayer(app, 'Günlük Şikâyet Edilen');

      const reportId = await createReport(reporter, reported);
      await patchStatus(admin, reportId, 'dismissed', 200);

      const response = await request(app.getHttpServer())
        .get(auditLogUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const entry = (response.body.data.entries as Array<Record<string, unknown>>).find(
        (e) => e.targetId === reportId,
      );
      expect(entry).toBeDefined();
      expect(entry?.action).toBe('report.status_changed');
      expect(entry?.targetType).toBe('player_report');
      expect(entry?.admin).toEqual({
        playerId: admin.playerId,
        displayName: 'Günlük Okuyan Yönetici',
      });
      expect(entry?.details).toEqual({ from: 'open', to: 'dismissed' });
      expect(typeof entry?.createdAt).toBe('string');
    });
  });

  describe('GET /admin/players — "Users" + "Wallet"', () => {
    it('oyuncuyu BAKİYESİYLE döner ve bakiye SAYI olarak gelir (BIGINT tuzağı)', async () => {
      // ASIL İDDİA `typeof === 'number'`: `money`/`gems`/`xp` BIGINT'tir ve
      // `pg` bunları varsayılan olarak METİN döner. Dönüşüm
      // (`toNumber`) unutulsaydı istemci `"1234"` görür ve `+` operatörünü
      // birleştirme olarak kullanırdı — hiçbir yerde hata ÇIKMADAN.
      const admin = await registerTestPlayer(app, 'Oyuncu Listeleyen');
      await makeAdmin(admin.playerId);
      const target = await registerTestPlayer(app, 'Bakiyeli Oyuncu');
      await pool.query('UPDATE players SET money = 1234, gems = 56, reputation = 7 WHERE id = $1', [
        target.playerId,
      ]);

      const response = await request(app.getHttpServer())
        .get(playersAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.players as Array<Record<string, unknown>>).find(
        (p) => p.playerId === target.playerId,
      );
      expect(row).toBeDefined();
      expect(row?.displayName).toBe('Bakiyeli Oyuncu');
      expect(row?.money).toBe(1234);
      expect(row?.gems).toBe(56);
      expect(row?.reputation).toBe(7);
      expect(typeof row?.money).toBe('number');
      expect(typeof row?.gems).toBe('number');
      expect(typeof row?.xp).toBe('number');
      // Giriş kimliği görünen addan AYRI taşınır: yönetici "aynı addan iki
      // hesap" durumunu ancak böyle ayırt eder (bkz. port doc yorumu).
      expect(typeof row?.username).toBe('string');
      expect((row?.username as string).length).toBeGreaterThan(0);
      expect(row?.isAdmin).toBe(false);
      expect(typeof row?.createdAt).toBe('string');
    });

    it('yöneticinin kendisi `isAdmin: true` ile görünür', async () => {
      // Bu alan olmadan "bu hesap neden bu ekranı görebiliyor" sorusu
      // panelden YANITLANAMAZ (yetki verme ucu bilinçli olarak yoktur).
      const admin = await registerTestPlayer(app, 'Kendini Gören Yönetici');
      await makeAdmin(admin.playerId);

      const response = await request(app.getHttpServer())
        .get(playersAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.players as Array<Record<string, unknown>>).find(
        (p) => p.playerId === admin.playerId,
      );
      expect(row?.isAdmin).toBe(true);
    });

    it('EN YENİ kayıt önce gelir', async () => {
      // Sıralama `created_at DESC, id DESC`tir. `created_at`i SQL ile
      // AYRIŞTIRMAK şart: iki oyuncu aynı milisaniyede doğabilir ve o
      // zaman sıralama ikincil anahtara düşer — yani test KARARSIZ olurdu.
      const admin = await registerTestPlayer(app, 'Sıralama Yöneticisi');
      await makeAdmin(admin.playerId);
      const eski = await registerTestPlayer(app, 'Eski Hesap');
      const yeni = await registerTestPlayer(app, 'Yeni Hesap');
      await pool.query("UPDATE players SET created_at = now() - interval '1 day' WHERE id = $1", [
        eski.playerId,
      ]);

      const response = await request(app.getHttpServer())
        .get(playersAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const ids = (response.body.data.players as Array<{ playerId: string }>).map((p) => p.playerId);
      expect(ids.indexOf(yeni.playerId)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(yeni.playerId)).toBeLessThan(ids.indexOf(eski.playerId));
    });
  });

  describe('GET /admin/races — "Races"', () => {
    /** Yarış satırı yaratır (doğrudan SQL — `gift.e2e-spec.ts`in bakiye kurulumuyla AYNI yöntem). */
    async function createRace(options: { createdBy?: string | null; entryFee?: number } = {}): Promise<string> {
      const entryFee = options.entryFee ?? 0;
      const result = await pool.query<{ id: string }>(
        // `engine_version`/`ruleset_version`/`config_version` (migration 0021)
        // ve `weather_config_version` (migration 0024) NOT NULL ve
        // VARSAYILANI YOKTUR (`DROP DEFAULT`): satırı yazan uygulama kodu
        // bunları HER ZAMAN geçmek zorundadır, bu yüzden test kurulumu da
        // geçer (değerler replay/audit için anlamsızdır ama sütunlar boş
        // bırakılamaz).
        `INSERT INTO races
           (name, distance_m, surface, weather, start_time, max_players, created_by,
            race_type, entry_fee, participant_limit,
            engine_version, ruleset_version, config_version, weather_config_version)
         VALUES ($1, 1200, 'grass', 'sunny', now() + interval '1 hour', 8, $2, $3, $4, 12,
                 'test-engine', 'test-ruleset', 'test-config', 'test-weather-config')
         RETURNING id`,
        [
          `e2e yarışı ${randomUUID().slice(0, 8)}`,
          options.createdBy ?? null,
          entryFee > 0 ? 'paid' : 'free',
          entryFee,
        ],
      );
      return result.rows[0].id;
    }

    /** Bir yarışa at girişi ekler (`status` verilmezse NULL — pratik/PvP girişi gibi). */
    async function addEntry(raceId: string, playerId: string, status: string | null): Promise<void> {
      const horse = await pool.query<{ id: string }>(
        'SELECT id FROM horses WHERE owner_id = $1 LIMIT 1',
        [playerId],
      );
      await pool.query(
        `INSERT INTO race_entries (race_id, horse_id, player_id, status) VALUES ($1, $2, $3, $4)`,
        [raceId, horse.rows[0].id, playerId, status],
      );
    }

    it('yarışı tüm alanlarıyla döner ve `createdBy` görünen adla gelir', async () => {
      const admin = await registerTestPlayer(app, 'Yarış Listeleyen');
      await makeAdmin(admin.playerId);
      const owner = await registerTestPlayer(app, 'Yarış Sahibi');
      const raceId = await createRace({ createdBy: owner.playerId, entryFee: 250 });

      const response = await request(app.getHttpServer())
        .get(racesAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.races as Array<Record<string, unknown>>).find(
        (r) => r.raceId === raceId,
      );
      expect(row).toBeDefined();
      expect(row?.status).toBe('scheduled');
      expect(row?.raceType).toBe('paid');
      expect(row?.entryFee).toBe(250);
      expect(row?.surface).toBe('grass');
      expect(row?.distanceM).toBe(1200);
      expect(row?.participantLimit).toBe(12);
      expect(row?.maxPlayers).toBe(8);
      expect(row?.joinedPlayers).toBe(0);
      // `entryFee`/`prizePool`/`tribuneFee` de BIGINT'tir → SAYI olmalı.
      expect(typeof row?.entryFee).toBe('number');
      expect(typeof row?.prizePool).toBe('number');
      expect(typeof row?.tribuneFee).toBe('number');
      expect(row?.createdBy).toEqual({ playerId: owner.playerId, displayName: 'Yarış Sahibi' });
      expect(typeof row?.startTime).toBe('string');
      // `scheduled` yarış İPTAL EDİLEBİLİR: reddin nedeni YOKTUR (`null`).
      // Düğmenin çizilip çizilmeyeceği kararı bu alandan verilir; kuralın
      // kendisi sunucuda (`checkRaceCancelable`) kalır.
      expect(row?.cancelRefusal).toBeNull();
    });

    it('iptal edilebilirlik SUNUCUDAN gelir — koşmuş yarış `ALREADY_FINISHED` döner', async () => {
      // Bu, `finish`in `Pause` gibi bir "eksik özellik" değil bir PARA
      // kuralı olduğunu ekrana taşıyan tek sinyaldir: `finished` bir yarışı
      // iptal etmek, kazanana ödenmiş `race_prize` yerine ödediği giriş
      // ücretini iade etmek olurdu (§13.19).
      const admin = await registerTestPlayer(app, 'İptal Reddini Gören');
      await makeAdmin(admin.playerId);
      const raceId = await createRace({ entryFee: 100 });
      await pool.query(`UPDATE races SET status = 'finished' WHERE id = $1`, [raceId]);

      const response = await request(app.getHttpServer())
        .get(racesAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.races as Array<Record<string, unknown>>).find(
        (r) => r.raceId === raceId,
      );
      expect(row?.status).toBe('finished');
      expect(row?.cancelRefusal).toBe('ALREADY_FINISHED');
    });

    it('SUNUCU ÜRETİMİ yarışta `createdBy: null`dır (INNER JOIN olsaydı satır listeden DÜŞERDİ)', async () => {
      const admin = await registerTestPlayer(app, 'Sunucu Yarışı Yöneticisi');
      await makeAdmin(admin.playerId);
      const raceId = await createRace({ createdBy: null });

      const response = await request(app.getHttpServer())
        .get(racesAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.races as Array<Record<string, unknown>>).find(
        (r) => r.raceId === raceId,
      );
      // İKİ İDDİA TEK TESTTE: satır VAR (JOIN onu düşürmedi) ve
      // `createdBy` `null` (yarısı dolu bir referans uydurulmadı).
      expect(row).toBeDefined();
      expect(row?.createdBy).toBeNull();
    });

    it('`joinedPlayers` İPTAL EDİLMİŞ katılımı SAYMAZ, NULL durumlu girişi SAYAR', async () => {
      // `race_entries.status` NULL olabilir (pratik/PvP girişleri, migration
      // 0037 notu) ve `status <> 'cancelled'` NULL'ı DÜŞÜRÜRDÜ. Doğru
      // operatör `IS DISTINCT FROM`tir — bu test tam olarak onu ölçer.
      const admin = await registerTestPlayer(app, 'Doluluk Yöneticisi');
      await makeAdmin(admin.playerId);
      const kalan = await registerTestPlayer(app, 'Katılımı Kalan');
      const ayrilan = await registerTestPlayer(app, 'Katılımı İptal');
      const raceId = await createRace({ createdBy: admin.playerId });

      await addEntry(raceId, kalan.playerId, null);
      await addEntry(raceId, ayrilan.playerId, 'cancelled');

      const response = await request(app.getHttpServer())
        .get(racesAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.races as Array<Record<string, unknown>>).find(
        (r) => r.raceId === raceId,
      );
      expect(row?.joinedPlayers).toBe(1);
      expect(typeof row?.joinedPlayers).toBe('number');
    });
  });

  describe('GET /admin/transactions — "Transactions" + "Gifts"', () => {
    /** Defter satırı yazar (`wallet.e2e-spec.ts` ile AYNI yöntem ve AYNI kısıt). */
    async function addTransaction(options: {
      playerId: string;
      type: string;
      amount: number;
      balanceBefore: number;
    }): Promise<string> {
      // `CHECK (balance_after = balance_before + amount)` (migration 0019)
      // veritabanında zorlanır — bu yüzden `balanceAfter` burada
      // HESAPLANIR, uydurulmaz.
      //
      // ⚠️ AÇIK `::bigint` DÖNÜŞÜMÜ ŞARTTIR: parametrelerin tipi bağlama
      // anında `unknown` kalır ve `unknown + unknown` PostgreSQL'de
      // çözümlenemez (`operator is not unique`). Sütunun tipini bilen bir
      // hedefe yazmak yerine burada açıkça dönüştürülür.
      const result = await pool.query<{ id: string }>(
        `INSERT INTO economy_transactions
           (player_id, type, amount, currency, reference_type, reference_id,
            balance_before, balance_after)
         VALUES ($1, $2, $3, 'money', 'race', NULL, $4, $4::bigint + $3::bigint)
         RETURNING id`,
        [options.playerId, options.type, options.amount, options.balanceBefore],
      );
      return result.rows[0].id;
    }

    it('defter satırını oyuncu adı ve İMZALI tutarla döner', async () => {
      const admin = await registerTestPlayer(app, 'Defter Okuyan');
      await makeAdmin(admin.playerId);
      const spender = await registerTestPlayer(app, 'Harcayan Oyuncu');
      const transactionId = await addTransaction({
        playerId: spender.playerId,
        type: 'race_entry_fee',
        amount: -250,
        balanceBefore: 1000,
      });

      const response = await request(app.getHttpServer())
        .get(transactionsAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.transactions as Array<Record<string, unknown>>).find(
        (t) => t.transactionId === transactionId,
      );
      expect(row).toBeDefined();
      expect(row?.player).toEqual({ playerId: spender.playerId, displayName: 'Harcayan Oyuncu' });
      expect(row?.type).toBe('race_entry_fee');
      // İŞARET KORUNUR: yöneticinin sorduğu soru "para hangi yöne gitti"dir.
      expect(row?.amount).toBe(-250);
      expect(row?.currency).toBe('money');
      expect(row?.balanceBefore).toBe(1000);
      expect(row?.balanceAfter).toBe(750);
      expect(typeof row?.amount).toBe('number');
      expect(typeof row?.balanceBefore).toBe('number');
      expect(typeof row?.balanceAfter).toBe('number');
      expect(row?.referenceType).toBe('race');
      expect(typeof row?.createdAt).toBe('string');
    });

    it('DEFTERİN DEĞİŞMEZİ yanıtta da geçerli: `balanceAfter = balanceBefore + amount`', async () => {
      // Bu kısıt veritabanında vardır (migration 0019). Burada ÖLÇÜLEN şey,
      // API katmanının onu BOZMADIĞIDIR: `toNumber` dönüşümlerinden biri
      // yanlış olsaydı (örn. `balanceAfter` yerine `balanceBefore`
      // döndürülseydi) bu iddia kırılırdı.
      const admin = await registerTestPlayer(app, 'Değişmez Ölçen');
      await makeAdmin(admin.playerId);
      const player = await registerTestPlayer(app, 'Değişmez Oyuncu');
      const transactionId = await addTransaction({
        playerId: player.playerId,
        type: 'daily_reward',
        amount: 500,
        balanceBefore: 100,
      });

      const response = await request(app.getHttpServer())
        .get(transactionsAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.transactions as Record<string, number | string>[]).find(
        (t) => t.transactionId === transactionId,
      );
      expect(row).toBeDefined();
      const before = row?.balanceBefore as number;
      const amount = row?.amount as number;
      const after = row?.balanceAfter as number;
      expect(after).toBe(before + amount);
    });

    it('HEDİYE satırı da bu listede görünür — "Gifts" ayrı bir defter DEĞİLDİR', async () => {
      // brief §34 "Gifts"i ayrı sayar; ama hediye `economy_transactions`
      // içinde bir `type`tır (migration 0034). Bu test, ayrı bir uç nokta
      // açmak yerine süzgeci istemciye bırakma kararının GÖRÜNÜR
      // sonucunu kanıtlar.
      const admin = await registerTestPlayer(app, 'Hediye Gören');
      await makeAdmin(admin.playerId);
      const sender = await registerTestPlayer(app, 'Hediye Gönderen');
      const transactionId = await addTransaction({
        playerId: sender.playerId,
        type: 'gift_send',
        amount: -50,
        balanceBefore: 200,
      });

      const response = await request(app.getHttpServer())
        .get(transactionsAdminUrl)
        .set('Authorization', admin.authHeader)
        .expect(200);

      const row = (response.body.data.transactions as Array<Record<string, unknown>>).find(
        (t) => t.transactionId === transactionId,
      );
      expect(row?.type).toBe('gift_send');
      expect(row?.amount).toBe(-50);
    });
  });

  describe('POST /admin/races/:raceId/cancel — brief §34 "Cancel"', () => {
    /**
     * Yarış satırı yaratır. `status` verilebilir çünkü testlerden biri
     * KOŞMUŞ (`finished`) bir yarışın iptal EDİLEMEDİĞİNİ kanıtlar.
     */
    async function createRace(options: {
      entryFee: number;
      prizePool: number;
      status?: string;
    }): Promise<string> {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO races
           (name, distance_m, surface, weather, start_time, max_players, created_by,
            race_type, entry_fee, prize_pool, participant_limit, status,
            engine_version, ruleset_version, config_version, weather_config_version)
         VALUES ($1, 1200, 'grass', 'sunny', now() + interval '1 hour', 8, NULL,
                 $2, $3, $4, 12, $5,
                 'test-engine', 'test-ruleset', 'test-config', 'test-weather-config')
         RETURNING id`,
        [
          `e2e iptal yarışı ${randomUUID().slice(0, 8)}`,
          options.entryFee > 0 ? 'paid' : 'free',
          options.entryFee,
          options.prizePool,
          options.status ?? 'scheduled',
        ],
      );
      return result.rows[0].id;
    }

    /** Oyuncunun bakiyesi — yanıt gövdesine GÜVENMEDEN, doğrudan SQL. */
    async function readMoney(playerId: string): Promise<number> {
      const result = await pool.query<{ money: string }>(
        'SELECT money FROM players WHERE id = $1',
        [playerId],
      );
      return Number(result.rows[0].money);
    }

    /**
     * Ücretli katılım: at girişi + GERÇEK bir `lobby_race_entry_fee` defter
     * satırı + bakiyeden düşüm. Üçü birlikte gerekir, çünkü iptal iade
     * tutarını `races.entry_fee`den DEĞİL defterden okur — bu kurulum
     * olmadan test, iade mantığını hiç ölçmezdi.
     */
    async function addPaidEntry(raceId: string, playerId: string, fee: number): Promise<void> {
      const horse = await pool.query<{ id: string }>(
        'SELECT id FROM horses WHERE owner_id = $1 LIMIT 1',
        [playerId],
      );
      await pool.query(
        `INSERT INTO race_entries (race_id, horse_id, player_id, status)
         VALUES ($1, $2, $3, NULL)`,
        [raceId, horse.rows[0].id, playerId],
      );
      const before = await readMoney(playerId);
      await pool.query('UPDATE players SET money = $2 WHERE id = $1', [playerId, before - fee]);
      await pool.query(
        `INSERT INTO economy_transactions
           (player_id, type, amount, currency, reference_type, reference_id,
            balance_before, balance_after)
         VALUES ($1, 'lobby_race_entry_fee', $2::bigint, 'money', 'race', $3, $4, $4::bigint + $2::bigint)`,
        [playerId, -fee, raceId, before],
      );
    }

    /**
     * BOT katılımı — `player_id` YOKTUR (migration 0025
     * `race_entries_horse_xor_bot_chk`). Botun ödediği bir para da yoktur;
     * bu satır, "havuz bot payı içeriyor ama iade edilmez" durumunu
     * kurmak için vardır.
     */
    async function addBotEntry(raceId: string, label: string): Promise<void> {
      await pool.query(
        `INSERT INTO race_entries (race_id, bot_label, status) VALUES ($1, $2, NULL)`,
        [raceId, label],
      );
    }

    /** Bu yarış için yazılmış İADE defter satırlarının sayısı. */
    async function countRefundRows(raceId: string): Promise<number> {
      const result = await pool.query(
        `SELECT count(*)::int AS count FROM economy_transactions
          WHERE type = 'race_entry_refund' AND reference_type = 'race' AND reference_id = $1`,
        [raceId],
      );
      return result.rows[0].count as number;
    }

    /** `admin_audit_log`taki `race.cancelled` satırı (yoksa `undefined`). */
    async function readCancelAudit(raceId: string): Promise<Record<string, unknown> | undefined> {
      const result = await pool.query<{ details: Record<string, unknown> }>(
        `SELECT details FROM admin_audit_log
          WHERE action = 'race.cancelled' AND target_type = 'race' AND target_id = $1`,
        [raceId],
      );
      return result.rows[0]?.details;
    }

    /** İptal çağrısı — beklenen kod ZORUNLU (çağrı yerinde okunur). */
    async function cancel(
      caller: RegisteredTestPlayer,
      raceId: string,
      expectedStatus: number,
    ): Promise<request.Response> {
      return request(app.getHttpServer())
        .post(cancelRaceUrl(raceId))
        .set('Authorization', caller.authHeader)
        .expect(expectedStatus);
    }

    it('ödemiş HER oyuncuya iade eder, havuzu sıfırlar ve denetim kaydı yazar', async () => {
      const admin = await registerTestPlayer(app, 'İptal Eden');
      await makeAdmin(admin.playerId);
      const a = await registerTestPlayer(app, 'İade Alan A');
      const b = await registerTestPlayer(app, 'İade Alan B');

      const raceId = await createRace({ entryFee: 250, prizePool: 500 });
      await addPaidEntry(raceId, a.playerId, 250);
      await addPaidEntry(raceId, b.playerId, 250);
      const beforeA = await readMoney(a.playerId);
      const beforeB = await readMoney(b.playerId);

      const response = await cancel(admin, raceId, 200);

      expect(response.body.data.raceId).toBe(raceId);
      expect(response.body.data.refundedPlayers).toBe(2);
      expect(response.body.data.refundedTotal).toBe(500);
      expect(typeof response.body.data.cancelledAt).toBe('string');

      // BAKİYELER — iddia SQL ile doğrulanır, yanıt gövdesiyle DEĞİL:
      // "iade edildi" cevabı tek başına parayı kanıtlamaz.
      expect(await readMoney(a.playerId)).toBe(beforeA + 250);
      expect(await readMoney(b.playerId)).toBe(beforeB + 250);

      // DEFTER: her iade için bir satır ve `CHECK (balance_after =
      // balance_before + amount)` korunmuş olmalı.
      const ledger = await pool.query<{ amount: string; balance_before: string; balance_after: string }>(
        `SELECT amount, balance_before, balance_after FROM economy_transactions
          WHERE type = 'race_entry_refund' AND reference_type = 'race' AND reference_id = $1
          ORDER BY player_id`,
        [raceId],
      );
      expect(ledger.rows).toHaveLength(2);
      for (const row of ledger.rows) {
        expect(Number(row.amount)).toBe(250);
        expect(Number(row.balance_after)).toBe(Number(row.balance_before) + Number(row.amount));
      }

      // HAVUZ SIFIRLANIR: iptal edilmiş bir yarışta kalıcı bir bakiye
      // kalmamalıdır.
      const race = await pool.query<{ status: string; prize_pool: string }>(
        'SELECT status, prize_pool FROM races WHERE id = $1',
        [raceId],
      );
      expect(race.rows[0].status).toBe('cancelled');
      expect(Number(race.rows[0].prize_pool)).toBe(0);

      // KATILIMLAR `cancelled` İŞARETLENİR, SİLİNMEZ.
      const entries = await pool.query<{ count: string }>(
        `SELECT count(*)::int AS count FROM race_entries
          WHERE race_id = $1 AND status = 'cancelled'`,
        [raceId],
      );
      expect(entries.rows[0].count).toBe(2);

      // DENETİM KAYDI — brief §34 "Finansal işlemler audit log'a
      // yazılmalı." Aynı transaction'da yazıldığı için burada GÖRÜNMESİ
      // gerekir.
      const details = await readCancelAudit(raceId);
      expect(details).toBeDefined();
      expect(details?.to).toBe('cancelled');
      expect(details?.refundedPlayers).toBe(2);
      expect(details?.refundedTotal).toBe(500);
    });

    it('BOT PAYI İADE EDİLMEZ — `refundedTotal` havuzun tamamı DEĞİLDİR', async () => {
      // Havuz 500, gerçek oyuncu 250 ödedi, kalan 250 bota aittir. Botun
      // `player_id`si yoktur, yani ödediği bir para da yoktur; onu iade
      // etmiş gibi saymak, ödenmemiş bir tutarı ödenmiş göstermek olurdu.
      const admin = await registerTestPlayer(app, 'Bot İptal Eden');
      await makeAdmin(admin.playerId);
      const real = await registerTestPlayer(app, 'Gerçek Katılımcı');

      const raceId = await createRace({ entryFee: 250, prizePool: 500 });
      await addPaidEntry(raceId, real.playerId, 250);
      await addBotEntry(raceId, 'bot-1');
      const before = await readMoney(real.playerId);

      const response = await cancel(admin, raceId, 200);

      expect(response.body.data.refundedPlayers).toBe(1);
      expect(response.body.data.refundedTotal).toBe(250);
      expect(await readMoney(real.playerId)).toBe(before + 250);
      // Bot payı havuzda KALMAZ: havuz yine sıfırlanır (sahipsiz bir
      // bakiye bırakmak, iptal edilmiş yarış için kalıcı bir kalıntı
      // yaratırdı).
      const race = await pool.query<{ prize_pool: string }>(
        'SELECT prize_pool FROM races WHERE id = $1',
        [raceId],
      );
      expect(Number(race.rows[0].prize_pool)).toBe(0);
    });

    it('ÜCRETSİZ yarışta para yoluna HİÇ girilmez — iade satırı yazılmaz', async () => {
      const admin = await registerTestPlayer(app, 'Ücretsiz İptal Eden');
      await makeAdmin(admin.playerId);
      const player = await registerTestPlayer(app, 'Ücretsiz Katılımcı');

      const raceId = await createRace({ entryFee: 0, prizePool: 0 });
      const horse = await pool.query<{ id: string }>(
        'SELECT id FROM horses WHERE owner_id = $1 LIMIT 1',
        [player.playerId],
      );
      await pool.query(
        `INSERT INTO race_entries (race_id, horse_id, player_id, status) VALUES ($1, $2, $3, NULL)`,
        [raceId, horse.rows[0].id, player.playerId],
      );
      const before = await readMoney(player.playerId);

      const response = await cancel(admin, raceId, 200);

      expect(response.body.data.refundedPlayers).toBe(0);
      expect(response.body.data.refundedTotal).toBe(0);
      expect(await readMoney(player.playerId)).toBe(before);
      expect(await countRefundRows(raceId)).toBe(0);
      // Katılım yine de iptal işaretlenir: yarış artık yoktur.
      const entries = await pool.query<{ count: string }>(
        `SELECT count(*)::int AS count FROM race_entries
          WHERE race_id = $1 AND status = 'cancelled'`,
        [raceId],
      );
      expect(entries.rows[0].count).toBe(1);
    });

    it('İKİNCİ iptal 409 RACE_NOT_CANCELABLE döner ve İKİNCİ KEZ ÖDEMEZ', async () => {
      // Çift iadeyi engelleyen şey `Idempotency-Key` DEĞİL, durum
      // geçişinin kendisidir (`SettleRaceUseCase` ile AYNI gerekçe). Bu
      // test tam olarak onu ölçer: ikinci çağrıdan sonra bakiye ve defter
      // satır sayısı DEĞİŞMEMİŞ olmalıdır.
      const admin = await registerTestPlayer(app, 'İki Kez İptal Eden');
      await makeAdmin(admin.playerId);
      const player = await registerTestPlayer(app, 'Tek İade Alan');

      const raceId = await createRace({ entryFee: 100, prizePool: 100 });
      await addPaidEntry(raceId, player.playerId, 100);

      await cancel(admin, raceId, 200);
      const afterFirst = await readMoney(player.playerId);

      const second = await cancel(admin, raceId, 409);
      expect(second.body.error.code).toBe('RACE_NOT_CANCELABLE');

      expect(await readMoney(player.playerId)).toBe(afterFirst);
      expect(await countRefundRows(raceId)).toBe(1);
      // Denetim günlüğü de İKİNCİ satırı almaz — gerçekleşmemiş bir
      // işlemin kaydı olmamalıdır.
      const audit = await pool.query<{ count: string }>(
        `SELECT count(*)::int AS count FROM admin_audit_log
          WHERE action = 'race.cancelled' AND target_id = $1`,
        [raceId],
      );
      expect(audit.rows[0].count).toBe(1);
    });

    it('KOŞMUŞ (`finished`) yarış iptal EDİLEMEZ — dağıtılmış ödül geri alınamaz', async () => {
      // Bu iddianın asıl değeri şurada: iade tutarı DEFTERDEN okunur. Bir
      // kazananın defterinde `lobby_race_entry_fee` DEĞİL `race_prize`
      // satırı vardır; iptale izin verilseydi kazanana ödediği ücret
      // iade edilir, ödülü ise yerinde kalırdı — sessizce yanlış bir
      // muhasebe, hiçbir hata mesajı olmadan.
      const admin = await registerTestPlayer(app, 'Bitmiş Yarış Yöneticisi');
      await makeAdmin(admin.playerId);
      const player = await registerTestPlayer(app, 'Bitmiş Yarış Oyuncusu');

      const raceId = await createRace({ entryFee: 100, prizePool: 0, status: 'finished' });
      await addPaidEntry(raceId, player.playerId, 100);
      const before = await readMoney(player.playerId);

      const response = await cancel(admin, raceId, 409);
      expect(response.body.error.code).toBe('RACE_NOT_CANCELABLE');

      expect(await readMoney(player.playerId)).toBe(before);
      expect(await countRefundRows(raceId)).toBe(0);
      const race = await pool.query<{ status: string }>(
        'SELECT status FROM races WHERE id = $1',
        [raceId],
      );
      expect(race.rows[0].status).toBe('finished');
      expect(await readCancelAudit(raceId)).toBeUndefined();
    });

    it('olmayan yarış için 404 RACE_NOT_FOUND döner (yönetici için)', async () => {
      // Yönetici OLMAYAN için aynı çağrı 403'tür (yukarıdaki kapı testi):
      // 404 ile 403 karşılaştırılarak yarış kimlikleri yoklanamaz.
      const admin = await registerTestPlayer(app, 'Yarış Bulamayan');
      await makeAdmin(admin.playerId);

      const response = await cancel(admin, randomUUID(), 404);
      expect(response.body.error.code).toBe('RACE_NOT_FOUND');
    });

    it('geçersiz uuid veritabanına HİÇ gitmez — 400 döner', async () => {
      // `ParseUUIDPipe` yol parametresini korur (pipe'lar esbuild altında
      // da çalışır — CLAUDE.md kural 5); aksi hâlde `22P02` ile 500
      // görülürdü.
      const admin = await registerTestPlayer(app, 'Uuid Denetleyen');
      await makeAdmin(admin.playerId);

      await request(app.getHttpServer())
        .post('/api/v1/admin/races/yaris-1/cancel')
        .set('Authorization', admin.authHeader)
        .expect(400);
    });
  });
});
