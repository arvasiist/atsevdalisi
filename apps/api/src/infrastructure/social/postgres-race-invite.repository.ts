import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { RaceInviteStatus } from '@at-sevdalisi/shared-types';
import type {
  InvitableRaceFacts,
  RaceInviteRepository,
  RaceInviteRow,
  RespondRaceInviteInput,
  SaveRaceInviteInput,
} from '../../application/ports/race-invite.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

/** `race_invites` + JOIN'den gelen adlar (snake_case). */
interface RaceInviteDbRow {
  id: string;
  race_id: string;
  race_name: string;
  inviter_id: string;
  inviter_display_name: string;
  invitee_id: string;
  status: string;
  created_at: Date;
  responded_at: Date | null;
}

/** Davet edilebilirlik sorgusunun satır şekli. */
interface InvitableRaceDbRow {
  race_id: string;
  race_name: string;
  status: string;
  start_time: Date;
}

/**
 * Yarış daveti repository'si (brief §16, §42 PHASE 11).
 *
 * **BU DOSYADA PARA YOK.** Hiçbir `players` satırı güncellenmez,
 * `economy_transactions` yazılmaz, `FOR UPDATE` ile kilit alınmaz. Davet
 * bir bildirimdir, bir ödeme değildir; daveti kabul etmek de yarışa
 * katılmak DEĞİLDİR (giriş ücreti `JoinRaceUseCase`in tek yolundan geçer —
 * CLAUDE.md kural 7).
 *
 * **TEK İSTİSNA — `saveInvite` `withTransaction` KULLANIR.** Sebep para
 * değil ATOMLİKtir: `race_invites` satırı ile `notifications` satırı
 * BİRLİKTE anlamlıdır. İki ayrı ifade olarak yazılsalardı ikincisi düşerse
 * ortada görünmez bir davet kalırdı — davet edilen kişi onu hiç öğrenemez,
 * üstelik `race_invites_race_invitee_uq` tekil indeksi yüzünden AYNI
 * yarışa ikinci kez de davet edilemezdi (kalıcı olarak ulaşılamaz satır).
 * Bu, `postgres-gift.repository.ts`in "iki satır birlikte yazılmalı"
 * gerekçesinin PARA DIŞI karşılığıdır.
 *
 * **`race_name`/`inviter_display_name` JOIN'DEN gelir** (`saveMessage` ile
 * AYNI desen): brief §16'nın istediği cümle ("Ömer seni At Sevdalısı Cup
 * yarışına davet etti.") tam olarak bu iki alanla kurulur ve istemcinin
 * her davet satırı için ikinci bir istek atması N+1 olurdu.
 */
@Injectable()
export class PostgresRaceInviteRepository implements RaceInviteRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findRaceForInvite(raceId: string): Promise<InvitableRaceFacts | null> {
    const result = await this.pool.query<InvitableRaceDbRow>(
      'SELECT id AS race_id, name AS race_name, status, start_time FROM races WHERE id = $1',
      [raceId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      raceId: row.race_id,
      raceName: row.race_name,
      status: row.status,
      startTime: row.start_time,
    };
  }

  async countOutgoingPending(inviterId: string): Promise<number> {
    const result = await this.pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM race_invites
       WHERE inviter_id = $1 AND status = 'pending'`,
      [inviterId],
    );
    // `count(*)` + `::int` — boş kümede bile TEK satır döner; `?? 0`
    // yalnızca `noUncheckedIndexedAccess` içindir.
    return result.rows[0]?.total ?? 0;
  }

  async saveInvite(input: SaveRaceInviteInput): Promise<RaceInviteRow | null> {
    return withTransaction(this.pool, async (client) => {
      // `ON CONFLICT (race_id, invitee_id) DO NOTHING`: iki eşzamanlı
      // davetten yalnızca biri satır yazar, diğeri `RETURNING` BOŞ döner →
      // `null` → çağıran `RaceInviteAlreadyExistsError`. `DO UPDATE`
      // KULLANILMAZ (arkadaşlıktaki `rejected` → `pending` dönüşünün
      // aksine): tekil indeks `status`'tan bağımsızdır, yani reddedilmiş
      // bir davet de yeniden gönderilemez — aynı bildirimi tekrar tekrar
      // üretmek tam olarak engellemek istediğimiz spam'dir.
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO race_invites (id, race_id, inviter_id, invitee_id, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (race_id, invitee_id) DO NOTHING
         RETURNING id`,
        [input.inviteId, input.raceId, input.inviterId, input.inviteeId],
      );
      const inviteId = inserted.rows[0]?.id;
      // Satır yazılmadıysa bildirim de YAZILMAZ: aksi hâlde reddedilen
      // ikinci istek karşı tarafa İKİNCİ bir bildirim bırakırdı.
      if (inviteId === undefined) return null;

      await client.query(
        `INSERT INTO notifications (player_id, type, payload) VALUES ($1, 'race_invite', $2::jsonb)`,
        [input.inviteeId, JSON.stringify(input.notificationPayload)],
      );

      // Satırı JOIN ile GERİ OKUMAK zorunludur: `race_name` ve
      // `inviter_display_name` başka tablolardadır ve `RETURNING` yalnızca
      // `race_invites` sütunlarını verebilir. Aynı transaction içinde
      // okunduğu için yazılan satır GÖRÜLÜR.
      const row = await this.selectById(client, inviteId);
      if (!row) {
        // Teorik olarak imkânsız (az önce aynı transaction'da yazıldı) —
        // sessizce `undefined` döndürmek yerine AÇIKÇA fırlatılır
        // (`saveMessage` ile AYNI gerekçe).
        throw new Error(`Davet yazıldı ama okunamadı (invite_id: ${inviteId}).`);
      }
      return row;
    });
  }

  async findById(inviteId: string): Promise<RaceInviteRow | null> {
    return this.selectById(this.pool, inviteId);
  }

  async respond(input: RespondRaceInviteInput): Promise<RaceInviteRow | null> {
    // `invitee_id = $2` — KENDİ gönderdiğin daveti yanıtlayamazsın.
    // `status = 'pending'` — yanıtlanmış bir davet yeniden yanıtlanamaz
    // (iki eşzamanlı `accept`'ten yalnızca biri satırı günceller).
    // İki koşul da SQL'de TEKRARLANIR: uygulama katmanı zaten kapıyı
    // kapatmıştır ama yarış koşuluna karşı son savunma hattı buradadır
    // (`respondToRequest` ile AYNI desen).
    const result = await this.pool.query<{ id: string }>(
      `UPDATE race_invites SET status = $3, responded_at = $4
       WHERE id = $1 AND invitee_id = $2 AND status = 'pending'
       RETURNING id`,
      [input.inviteId, input.inviteeId, input.status, input.respondedAt],
    );
    const updatedId = result.rows[0]?.id;
    if (updatedId === undefined) return null;
    return this.selectById(this.pool, updatedId);
  }

  /**
   * Tek satırı adlarıyla birlikte okur. `Pool` ve `PoolClient` ikisini de
   * kabul eder — aynı sorgu hem transaction içinden (`saveInvite`) hem
   * dışından (`findById`) çağrılır; sorguyu iki kez yazmak, iki kopyanın
   * kaçınılmaz olarak ayrışmasına yol açardı.
   */
  private async selectById(
    executor: Pool | PoolClient,
    inviteId: string,
  ): Promise<RaceInviteRow | null> {
    const result = await executor.query<RaceInviteDbRow>(
      `SELECT i.id, i.race_id, r.name AS race_name, i.inviter_id,
              p.display_name AS inviter_display_name, i.invitee_id,
              i.status, i.created_at, i.responded_at
       FROM race_invites i
       JOIN races r ON r.id = i.race_id
       JOIN players p ON p.id = i.inviter_id
       WHERE i.id = $1`,
      [inviteId],
    );
    const row = result.rows[0];
    return row ? rowToInvite(row) : null;
  }
}

function rowToInvite(row: RaceInviteDbRow): RaceInviteRow {
  return {
    id: row.id,
    raceId: row.race_id,
    raceName: row.race_name,
    inviterId: row.inviter_id,
    inviterDisplayName: row.inviter_display_name,
    inviteeId: row.invitee_id,
    // `status` DB CHECK ile kısıtlıdır (migration 0039) — cast güvenlidir
    // (`rowToFriendship` ile AYNI gerekçe).
    status: row.status as RaceInviteStatus,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}
