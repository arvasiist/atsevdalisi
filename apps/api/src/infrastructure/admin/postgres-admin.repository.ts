import { Inject, Injectable } from '@nestjs/common';
import type { Currency, RaceStatus, RaceSurface, ReportCategory, ReportStatus } from '@at-sevdalisi/shared-types';
import type { Pool } from 'pg';
import {
  type AdminAuditLogRecord,
  type AdminPlayerAccountRecord,
  type AdminRaceRecord,
  type AdminReportRecord,
  type AdminRepository,
  type AdminTransactionRecord,
} from '../../application/ports/admin.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

/**
 * `AdminRepository`'nin PostgreSQL implementasyonu (brief §34,
 * §42 PHASE 15-B).
 *
 * **BU DOSYA `FOR UPDATE` KULLANAN İKİNCİ OKUMA-YAZMA YOLUDUR** —
 * birincisi `PostgresPlayerRepository.updateWithLock`tur (para yolu).
 * Buradaki kilit PARA İÇİN DEĞİL, GEÇİŞ KURALI içindir: iki yönetici
 * aynı şikâyeti aynı anda farklı durumlara çekerse, kilit olmadan
 * ikisi de `open` okur, ikisi de geçerli bir geçiş hesaplar ve son
 * yazan kazanır — arada bir geçiş KAYBOLUR, denetim günlüğü ise
 * gerçekleşmemiş bir sırayı anlatırdı.
 *
 * `ON DELETE RESTRICT` (migration 0041) bu dosyada bir ŞEY
 * GEREKTİRMEZ: yönetici silme diye bir yol yoktur; kısıt yalnızca
 * gelecekte biri denerse veritabanında durur.
 */

/** Kuyruk satırı — `player_reports` + İKİ `players` JOIN'i (snake_case). */
interface AdminReportDbRow {
  report_id: string;
  reporter_id: string;
  reporter_display_name: string;
  reported_id: string;
  reported_display_name: string;
  category: string;
  reason: string | null;
  status: string;
  created_at: Date;
  reviewed_by_id: string | null;
  reviewed_by_display_name: string | null;
  reviewed_at: Date | null;
}

/** Denetim günlüğü satırı — `admin_audit_log` + `players` JOIN'i. */
interface AdminAuditLogDbRow {
  id: string;
  admin_id: string;
  admin_display_name: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: Date;
}

/** Oyuncu listesi satırı — `players` (snake_case). */
interface AdminPlayerAccountDbRow {
  id: string;
  username: string;
  display_name: string;
  level: number;
  /** `BIGINT` — `pg` bunu METİN olarak döndürür (aşağıdaki `toNumber` notu). */
  xp: string;
  money: string;
  gems: string;
  reputation: number;
  is_admin: boolean;
  created_at: Date;
}

/** Yarış listesi satırı — `races` + iki `players` JOIN'i (snake_case). */
interface AdminRaceDbRow {
  race_id: string;
  name: string;
  status: string;
  race_type: string;
  surface: string;
  distance_m: number;
  entry_fee: string;
  prize_pool: string;
  tribune_fee: string;
  participant_limit: number;
  max_players: number;
  joined_players: string;
  start_time: Date;
  created_at: Date;
  created_by_id: string | null;
  created_by_display_name: string | null;
}

/** Defter satırı — `economy_transactions` + `players` JOIN'i (snake_case). */
interface AdminTransactionDbRow {
  id: string;
  player_id: string;
  player_display_name: string;
  type: string;
  amount: string;
  currency: string;
  reference_type: string | null;
  reference_id: string | null;
  balance_before: string;
  balance_after: string;
  created_at: Date;
}

/**
 * `BIGINT` → `number` — **BU DÖNÜŞÜM ATLANAMAZ.**
 *
 * `pg` sürücüsü `int8`i (ve `COUNT(*)` sonucunu) JavaScript `number`ına
 * ÇEVİRMEZ, çünkü 2^53 üzerindeki değerler sessizce yuvarlanırdı; ham
 * değer bir **metin** olarak gelir. `as unknown as number` ile susturmak,
 * JSON yanıtında `"money": "1250"` gibi bir METİN üretirdi ve istemci
 * `+` operatörünü birleştirme olarak kullanırdı. Bu yüzden dönüşüm tek
 * bir yardımcıda, AÇIKÇA yapılır.
 *
 * Buradaki tutarlar `players.money`/`economy_transactions.amount`tır;
 * oyunun ekonomisi 2^53 Çip'e ulaşmadığı sürece `number` güvenlidir ve
 * istemci sözleşmesi (`AdminPlayerAccountView.money: number`) bunu
 * ZATEN varsayar — dönüşümü gizlemek yerine burada açıkça yapıyoruz.
 */
function toNumber(value: string): number {
  return Number(value);
}

/**
 * Kuyruk ve güncelleme sorgularının PAYLAŞTIĞI kolon listesi.
 *
 * **NEDEN TEK YERDE:** `updateReportStatusWithLock` satırı
 * `RETURNING` ile, `listReports` ise `SELECT` ile okur; iki sorgunun
 * kolon listesi ayrışırsa `AdminReportRecord` alanlarından biri
 * sessizce `undefined` olurdu. Tek sabit, bunu yapısal olarak
 * imkânsız kılar.
 */
const REPORT_COLUMNS = `
  r.id            AS report_id,
  r.reporter_id,
  reporter.display_name AS reporter_display_name,
  r.reported_id,
  reported.display_name AS reported_display_name,
  r.category,
  r.reason,
  r.status,
  r.created_at,
  r.reviewed_by   AS reviewed_by_id,
  reviewer.display_name AS reviewed_by_display_name,
  r.reviewed_at
`;

/**
 * `REPORT_COLUMNS`in gerektirdiği JOIN'ler.
 *
 * **ÜÇ AYRI JOIN, ÇÜNKÜ ÜÇ FARKLI OYUNCU:** şikâyet eden, şikâyet edilen
 * ve (varsa) ele alan yönetici. Bunları use-case içinde ayrı sorgularla
 * toplamak, kuyruk başına 2N+1 gidiş-dönüş üretirdi (N+1 —
 * `findBlockedPlayers` ile AYNI yasak). `reviewer` JOIN'i `LEFT`tir:
 * henüz ele alınmamış şikâyetler kuyruğun ÇOĞUNLUĞUDUR ve `INNER JOIN`
 * onların TAMAMINI listeden düşürürdü.
 */
const REPORT_JOINS = `
  FROM player_reports r
  JOIN players reporter ON reporter.id = r.reporter_id
  JOIN players reported ON reported.id = r.reported_id
  LEFT JOIN players reviewer ON reviewer.id = r.reviewed_by
`;

@Injectable()
export class PostgresAdminRepository implements AdminRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async isAdmin(playerId: string): Promise<boolean> {
    const result = await this.pool.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM players WHERE id = $1',
      [playerId],
    );
    // Oyuncu YOKSA `false` döner, hata DEĞİL: çağıran zaten
    // `AuthGuard`'dan geçmiş bir oyuncudur; buraya düşen `undefined`
    // (silinmiş bir hesabın token'ı) yalnızca "yönetici değil" demektir
    // ve doğru cevap 403'tür, 404 değil — kaynak oyuncunun kendisi
    // değildir.
    return result.rows[0]?.is_admin === true;
  }

  async listReports(limit: number): Promise<AdminReportRecord[]> {
    const result = await this.pool.query<AdminReportDbRow>(
      `SELECT ${REPORT_COLUMNS}
       ${REPORT_JOINS}
       ORDER BY r.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => this.rowToReport(row));
  }

  async updateReportStatusWithLock<T>(
    reportId: string,
    adminId: string,
    mutate: (report: AdminReportRecord) => { status: ReportStatus; result: T },
  ): Promise<{ report: AdminReportRecord; result: T } | null> {
    return withTransaction(this.pool, async (client) => {
      // `FOR UPDATE OF r` — yalnızca ŞİKÂYET satırı kilitlenir, JOIN'lenen
      // `players` satırları DEĞİL: onları kilitlemek, bir şikâyeti
      // kapatırken ilgisiz bir oyuncunun satırını da bloke ederdi
      // (satır kilitleri transaction boyunca tutulur).
      const current = await client.query<AdminReportDbRow>(
        `SELECT ${REPORT_COLUMNS}
         ${REPORT_JOINS}
         WHERE r.id = $1
         FOR UPDATE OF r`,
        [reportId],
      );
      const currentRow = current.rows[0];
      if (!currentRow) {
        return null;
      }

      const report = this.rowToReport(currentRow);
      // Domain kuralı (geçiş çizgesi) BURADA çalışır — fırlatırsa
      // `withTransaction` ROLLBACK eder: ne durum ne denetim kaydı
      // yazılır (bkz. port doc yorumu).
      const { status, result } = mutate(report);

      // `reviewed_by` = İŞLEMİ YAPAN yönetici (`adminId`), `report.reviewedById`
      // DEĞİL — o, bir ÖNCEKİ ele alanı taşır. İkisini karıştırmak,
      // "kim kapattı" sorusuna "onu ilk inceleyen kimdi" cevabını
      // verdirirdi; aradaki fark denetim günlüğünde görünmez olurdu.
      await client.query(
        `UPDATE player_reports
            SET status = $2, reviewed_by = $3, reviewed_at = now()
          WHERE id = $1`,
        [reportId, status, adminId],
      );

      const updated = await client.query<AdminReportDbRow>(
        `SELECT ${REPORT_COLUMNS}
         ${REPORT_JOINS}
         WHERE r.id = $1`,
        [reportId],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) {
        // Satır yukarıda `FOR UPDATE` ile okundu ve aynı transaction
        // içinde güncellendi; buraya düşmek bir PROGRAMLAMA hatasıdır.
        // Sessizce `null` dönmek, yazılmamış bir güncellemeyi başarı
        // gibi gösterirdi.
        throw new Error(`Şikâyet güncellendi ama yeniden okunamadı: ${reportId}`);
      }

      // DENETİM KAYDI — AYNI transaction (bkz. port doc yorumu: ikisi
      // ayrılsaydı geri alınmış bir güncellemenin kaydı ortada kalırdı ve
      // bu hiçbir yerde hata üretmezdi).
      await client.query(
        `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          adminId,
          'report.status_changed',
          'player_report',
          reportId,
          JSON.stringify({ from: report.status, to: status }),
        ],
      );

      return { report: this.rowToReport(updatedRow), result };
    });
  }

  async listAuditLog(limit: number): Promise<AdminAuditLogRecord[]> {
    const result = await this.pool.query<AdminAuditLogDbRow>(
      `SELECT a.id, a.admin_id, admin.display_name AS admin_display_name,
              a.action, a.target_type, a.target_id, a.details, a.created_at
         FROM admin_audit_log a
         JOIN players admin ON admin.id = a.admin_id
        ORDER BY a.created_at DESC
        LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      adminDisplayName: row.admin_display_name,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      createdAt: row.created_at,
    }));
  }

  async listPlayerAccounts(limit: number): Promise<AdminPlayerAccountRecord[]> {
    // `ORDER BY created_at DESC, id DESC` — `created_at` TEK BAŞINA
    // deterministik DEĞİLDİR: aynı milisaniyede doğan iki hesap (e2e
    // kurulumu tam olarak bunu yapar) sıralamada yer değiştirebilir ve
    // `LIMIT` hangi satırın kırpıldığını belirsizleştirirdi. İkincil
    // anahtar bu belirsizliği kapatır.
    const result = await this.pool.query<AdminPlayerAccountDbRow>(
      `SELECT id, username, display_name, level, xp, money, gems, reputation, is_admin, created_at
         FROM players
        ORDER BY created_at DESC, id DESC
        LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      playerId: row.id,
      username: row.username,
      displayName: row.display_name,
      level: row.level,
      xp: toNumber(row.xp),
      money: toNumber(row.money),
      gems: toNumber(row.gems),
      reputation: row.reputation,
      isAdmin: row.is_admin,
      createdAt: row.created_at,
    }));
  }

  async listRaces(limit: number): Promise<AdminRaceRecord[]> {
    // `joined_players` KORELASYONLU BİR ALTSORGU DEĞİL, `LEFT JOIN
    // LATERAL` ile sayılır: `race_entries` üzerindeki
    // `(race_id, player_id)` benzersizliği (migration 0037) sayımı
    // doğrudan `COUNT(*)` yapmayı güvenli kılar. `status IS DISTINCT FROM
    // 'cancelled'` ŞARTTIR (`IS DISTINCT FROM`, yalnızca `<>` değil):
    // ayrılan oyuncunun satırı SİLİNMEZ, `cancelled` işaretlenir
    // (migration 0037 notu), yani `<>` NULL'lı satırları düşürürdü —
    // `PostgresRaceRepository` ile AYNI desen (bkz. satır ~1047 notu).
    //
    // `created_by` JOIN'i `LEFT`: sunucu üretimi yarışların (pratik/PvP)
    // oluşturucusu YOKTUR ve `INNER JOIN` onların tamamını listeden
    // düşürürdü.
    const result = await this.pool.query<AdminRaceDbRow>(
      `SELECT r.id AS race_id, r.name, r.status, r.race_type, r.surface, r.distance_m,
              r.entry_fee, r.prize_pool, r.tribune_fee, r.participant_limit, r.max_players,
              r.start_time, r.created_at,
              r.created_by AS created_by_id,
              creator.display_name AS created_by_display_name,
              COALESCE(joined.joined_players, 0) AS joined_players
         FROM races r
         LEFT JOIN players creator ON creator.id = r.created_by
         LEFT JOIN LATERAL (
              SELECT COUNT(*) AS joined_players
                FROM race_entries e
               WHERE e.race_id = r.id
                 AND e.status IS DISTINCT FROM 'cancelled'
         ) joined ON true
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      raceId: row.race_id,
      name: row.name,
      status: row.status as RaceStatus,
      raceType: row.race_type as 'free' | 'paid',
      surface: row.surface as RaceSurface,
      distanceM: row.distance_m,
      entryFee: toNumber(row.entry_fee),
      prizePool: toNumber(row.prize_pool),
      tribuneFee: toNumber(row.tribune_fee),
      participantLimit: row.participant_limit,
      maxPlayers: row.max_players,
      joinedPlayers: toNumber(row.joined_players),
      startTime: row.start_time,
      createdAt: row.created_at,
      createdById: row.created_by_id,
      createdByDisplayName: row.created_by_display_name,
    }));
  }

  async listTransactions(limit: number): Promise<AdminTransactionRecord[]> {
    // `JOIN players` (INNER): `player_id` NOT NULL + `ON DELETE CASCADE`
    // olduğundan (migration 0019) eşleşmeyen satır İMKÂNSIZDIR. Burada
    // `LEFT JOIN` kullanmak, olmayan bir durumu varmış gibi göstermek
    // olurdu — ve "sahibi silinmiş para hareketi" diye bir şey olamaz:
    // hesap silinince defter satırları da gider.
    const result = await this.pool.query<AdminTransactionDbRow>(
      `SELECT t.id, t.player_id, p.display_name AS player_display_name,
              t.type, t.amount, t.currency, t.reference_type, t.reference_id,
              t.balance_before, t.balance_after, t.created_at
         FROM economy_transactions t
         JOIN players p ON p.id = t.player_id
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      transactionId: row.id,
      playerId: row.player_id,
      playerDisplayName: row.player_display_name,
      type: row.type,
      amount: toNumber(row.amount),
      currency: row.currency as Currency,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      balanceBefore: toNumber(row.balance_before),
      balanceAfter: toNumber(row.balance_after),
      createdAt: row.created_at,
    }));
  }

  /** `AdminReportDbRow` → `AdminReportRecord` (snake_case → camelCase). */
  private rowToReport(row: AdminReportDbRow): AdminReportRecord {
    return {
      reportId: row.report_id,
      reporterId: row.reporter_id,
      reporterDisplayName: row.reporter_display_name,
      reportedId: row.reported_id,
      reportedDisplayName: row.reported_display_name,
      category: row.category as ReportCategory,
      reason: row.reason,
      status: row.status as ReportStatus,
      createdAt: row.created_at,
      reviewedById: row.reviewed_by_id,
      reviewedByDisplayName: row.reviewed_by_display_name,
      reviewedAt: row.reviewed_at,
    };
  }
}
