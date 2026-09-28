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
 *   (1) YETKİ KAPISI GERÇEKTEN KAPALI: yönetici olmayan bir oyuncu üç uç
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
 * **PARA YOLU YOKTUR:** bu dilimdeki hiçbir uç `economy_transactions`
 * yazmaz ve `players` bakiyesine dokunmaz. Denetim günlüğü bir YETKİ
 * kaydıdır, muhasebe defteri DEĞİLDİR (bkz. migration 0041 notu).
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
  const reportStatusUrl = (reportId: string) => `/api/v1/admin/reports/${reportId}`;
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
    it('yönetici OLMAYAN üç uç noktada da 403 ADMIN_REQUIRED alır', async () => {
      const player = await registerTestPlayer(app, 'Yönetici Değil');

      const list = await request(app.getHttpServer())
        .get(reportsAdminUrl)
        .set('Authorization', player.authHeader)
        .expect(403);
      expect(list.body.error.code).toBe('ADMIN_REQUIRED');

      const audit = await request(app.getHttpServer())
        .get(auditLogUrl)
        .set('Authorization', player.authHeader)
        .expect(403);
      expect(audit.body.error.code).toBe('ADMIN_REQUIRED');

      const patch = await patchStatus(player, '00000000-0000-0000-0000-000000000001', 'reviewing', 403);
      expect(patch.body.error.code).toBe('ADMIN_REQUIRED');
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
});
