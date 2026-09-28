import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { FriendshipStatus, NotificationType } from '@at-sevdalisi/shared-types';
import type {
  DirectMessageRow,
  FriendFacts,
  FriendRequestFacts,
  FriendshipRow,
  RemoveFriendshipInput,
  RespondToRequestInput,
  SaveFriendRequestInput,
  SaveMessageInput,
  SocialOverviewFacts,
  SocialOverviewQuery,
  SocialRepository,
} from '../../application/ports/social.repository';
import {
  buildFriendAcceptedPayload,
  buildFriendRequestPayload,
  buildMessagePreview,
  buildMessageReceivedPayload,
} from '../../domain/social/notification';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';

/** `friendships` satır şekli (snake_case). */
interface FriendshipDbRow {
  id: string;
  player_low_id: string;
  player_high_id: string;
  requested_by_id: string;
  status: string;
  created_at: Date;
  responded_at: Date | null;
}

/** Arkadaş/istek listesi JOIN sonucu (`friendships` + `players`). */
interface SocialListRow {
  friendship_id: string;
  requested_by_id: string;
  created_at: Date;
  responded_at: Date | null;
  player_id: string;
  display_name: string;
  level: number;
}

/** `direct_messages` + gönderen adı JOIN sonucu. */
interface DirectMessageDbRow {
  message_id: string;
  sender_id: string;
  recipient_id: string;
  sender_display_name: string;
  body: string;
  created_at: Date;
  read_at: Date | null;
}

/**
 * Arkadaşlık + mesajlaşma repository'si (proje sahibinin açık talebi,
 * 27.09.2026).
 *
 * **BU DOSYADA PARA YOK.** Ne `players` satırı güncellenir ne
 * `economy_transactions` yazılır. Hediye gönderimi ayrı dilimdir (bkz.
 * port doc yorumu).
 *
 * **`withTransaction` (PHASE 13'te EKLENDİ) — sebep para değil ATOMLİK.**
 * Bu dosya eskiden tek ifadeyle yazıyordu ("atomiklik zaten ifade
 * düzeyinde") ve `withTransaction` ÇAĞIRMIYORDU. 28.09.2026'da üç yazma
 * yoluna BİLDİRİM eklendi: `friend_request`, `friend_accepted`,
 * `message_received`. Bildirim, birincil satırla BİRLİKTE anlamlıdır
 * (`postgres-race-invite.repository.ts` → `saveInvite` ile AYNI gerekçe):
 * iki ayrı ifade olarak yazılsalardı ikincisi düşerse ortada GÖRÜNMEZ bir
 * arkadaşlık isteği/mesaj kalırdı — karşı taraf onu hiç öğrenemezdi.
 * Bu yüzden üç metot artık tek transaction'da iki yazma yapar.
 *
 * **`respondToRequest` İSTİSNADIR:** `rejected` yanıtı bildirim ÜRETMEZ
 * (bilinçli — "reddedildin" bir ürün kararıdır ve brief §28 onu istemez);
 * yalnızca `accepted` bildirir.
 *
 * **KANONİK ÇİFT SORUMLULUĞU ÇAĞIRANDA:** `player_low_id < player_high_id`
 * CHECK'i ters sırayı reddeder; bu yüzden `findPair`, `areFriends` ve
 * `removeFriendship` girdileri HAZIR kanonik sıra bekler
 * (`domain/social/friendship.ts` `canonicalPair`). Sırayı burada yeniden
 * hesaplamak, iki farklı yerde iki farklı sıralama mantığı doğururdu —
 * ve `canonicalPair`'in JS/PG sıralama uyumu notu (bkz. o dosyanın başlığı)
 * TEK bir yerde kalmalıdır.
 *
 * **`CASE WHEN` ile karşı tarafı bulma:** satırda "kim ben" bilgisi yoktur
 * (çift kanoniktir), bu yüzden liste sorguları karşı tarafı
 * `CASE WHEN player_low_id = $1 THEN player_high_id ELSE player_low_id END`
 * ile çıkarır. Bu, `otherParty` yardımcısının SQL karşılığıdır.
 */
@Injectable()
export class PostgresSocialRepository implements SocialRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    // `notificationPreviewLength` için — repository'ler config OKUR
    // (`postgres-breeding.repository.ts` ile AYNI desen, CLAUDE.md kural 6:
    // sihirli sayı yok).
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findPair(lowId: string, highId: string): Promise<FriendshipRow | null> {
    const result = await this.pool.query<FriendshipDbRow>(
      'SELECT * FROM friendships WHERE player_low_id = $1 AND player_high_id = $2',
      [lowId, highId],
    );
    const row = result.rows[0];
    return row ? rowToFriendship(row) : null;
  }

  async findById(friendshipId: string): Promise<FriendshipRow | null> {
    const result = await this.pool.query<FriendshipDbRow>('SELECT * FROM friendships WHERE id = $1', [
      friendshipId,
    ]);
    const row = result.rows[0];
    return row ? rowToFriendship(row) : null;
  }

  async countFriends(playerId: string): Promise<number> {
    const result = await this.pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM friendships
       WHERE status = 'accepted' AND (player_low_id = $1 OR player_high_id = $1)`,
      [playerId],
    );
    // `count(*)` + `::int` — boş kümede bile TEK satır döner, yani
    // `rows[0]` her zaman vardır; `?? 0` yalnızca `noUncheckedIndexedAccess`
    // içindir, gerçek bir "sıfır arkadaş" durumunu temsil etmez.
    return result.rows[0]?.total ?? 0;
  }

  async countOutgoingPending(playerId: string): Promise<number> {
    const result = await this.pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM friendships
       WHERE status = 'pending' AND requested_by_id = $1`,
      [playerId],
    );
    return result.rows[0]?.total ?? 0;
  }

  async findOverview(input: SocialOverviewQuery): Promise<SocialOverviewFacts> {
    // Üç sorgu PARALEL koşar: birbirlerine bağımlı değiller ve özet uç
    // noktasının tüm amacı tek turda dönmektir (bkz. `SocialOverviewView`).
    const [friendsResult, requestsResult, unreadResult] = await Promise.all([
      this.pool.query<SocialListRow>(
        `SELECT f.id AS friendship_id, f.requested_by_id, f.created_at, f.responded_at,
                p.id AS player_id, p.display_name, p.level
         FROM friendships f
         JOIN players p ON p.id = CASE WHEN f.player_low_id = $1 THEN f.player_high_id ELSE f.player_low_id END
         WHERE f.status = 'accepted' AND (f.player_low_id = $1 OR f.player_high_id = $1)
         ORDER BY COALESCE(f.responded_at, f.created_at) DESC
         LIMIT $2`,
        [input.playerId, input.friendsLimit],
      ),
      this.pool.query<SocialListRow>(
        `SELECT f.id AS friendship_id, f.requested_by_id, f.created_at, f.responded_at,
                p.id AS player_id, p.display_name, p.level
         FROM friendships f
         JOIN players p ON p.id = CASE WHEN f.player_low_id = $1 THEN f.player_high_id ELSE f.player_low_id END
         WHERE f.status = 'pending' AND (f.player_low_id = $1 OR f.player_high_id = $1)
         ORDER BY f.created_at DESC
         LIMIT $2`,
        [input.playerId, input.requestsLimit],
      ),
      this.pool.query<{ unread: number }>(
        'SELECT count(*)::int AS unread FROM direct_messages WHERE recipient_id = $1 AND read_at IS NULL',
        [input.playerId],
      ),
    ]);

    const friends: FriendFacts[] = friendsResult.rows.map((row) => ({
      friendshipId: row.friendship_id,
      playerId: row.player_id,
      displayName: row.display_name,
      level: row.level,
      // `responded_at` kabul anıdır; bozuk/eski bir satırda NULL olabilir
      // diye `created_at`e düşülür (sorgudaki `COALESCE` ile aynı kural —
      // API sözleşmesi `friendsSince`'i ASLA null yapmaz).
      friendsSince: row.responded_at ?? row.created_at,
    }));

    // `direction` BURADA türetilir: satırda "ben" bilgisi olmadığı için
    // isteği ben başlattıysam `outgoing`, başkası başlattıysa `incoming`.
    const incomingRequests: FriendRequestFacts[] = [];
    const outgoingRequests: FriendRequestFacts[] = [];
    for (const row of requestsResult.rows) {
      const view: FriendRequestFacts = {
        requestId: row.friendship_id,
        playerId: row.player_id,
        displayName: row.display_name,
        level: row.level,
        direction: row.requested_by_id === input.playerId ? 'outgoing' : 'incoming',
        createdAt: row.created_at,
      };
      if (view.direction === 'incoming') {
        incomingRequests.push(view);
      } else {
        outgoingRequests.push(view);
      }
    }

    return {
      friends,
      incomingRequests,
      outgoingRequests,
      unreadMessageCount: unreadResult.rows[0]?.unread ?? 0,
    };
  }

  async saveFriendRequest(input: SaveFriendRequestInput): Promise<FriendshipRow | null> {
    return withTransaction(this.pool, async (client) => {
      // `ON CONFLICT ... DO UPDATE ... WHERE` KALBİ BURADA: `WHERE
      // friendships.status = 'rejected'` koşulu sağlanmazsa (satır `pending`
      // ya da `accepted` ise) NE insert NE update olur ve `RETURNING` BOŞ
      // döner. Bu, "yarış durumunda ikinci istek" için veritabanı düzeyinde
      // bir kapıdır — `assertFriendRequestAllowed`'ın (uygulama katmanı)
      // yarış koşuluna karşı son savunma hattı. Çağıran `null` görürse
      // `FriendshipAlreadyExistsError('pending')` fırlatır.
      const result = await client.query<FriendshipDbRow>(
        `INSERT INTO friendships (player_low_id, player_high_id, requested_by_id, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (player_low_id, player_high_id) DO UPDATE
           SET requested_by_id = EXCLUDED.requested_by_id,
               status = 'pending',
               created_at = now(),
               responded_at = NULL
           WHERE friendships.status = 'rejected'
         RETURNING *`,
        [input.lowId, input.highId, input.requesterId],
      );
      const row = result.rows[0];
      // Satır yazılmadıysa bildirim de YAZILMAZ (`saveInvite` ile AYNI
      // kural): aksi hâlde 409 alan ikinci istek, karşı tarafa İKİNCİ bir
      // bildirim bırakırdı.
      if (!row) return null;

      // Bildirim KARŞI TARAFA gider. İstek sahibi çiftin İKİ UCUNDAN
      // biridir (çağıran `assertNotSelf` ile bunu garanti etmiştir), o
      // yüzden karşı taraf "öteki uç"tur.
      const addresseeId = input.requesterId === input.lowId ? input.highId : input.lowId;
      const displayName = await this.selectDisplayName(client, input.requesterId);
      await this.insertNotification(
        client,
        addresseeId,
        'friend_request',
        buildFriendRequestPayload({ requestId: row.id, playerId: input.requesterId, displayName }),
      );
      return rowToFriendship(row);
    });
  }

  async respondToRequest(input: RespondToRequestInput): Promise<FriendshipRow | null> {
    return withTransaction(this.pool, async (client) => {
      // `requested_by_id <> $2` — KENDİ gönderdiğin isteği yanıtlayamazsın.
      // `status = 'pending'` — kabul edilmiş bir satır yeniden yanıtlanamaz
      // (iki eşzamanlı `accept`'ten yalnızca biri satırı günceller).
      const result = await client.query<FriendshipDbRow>(
        `UPDATE friendships
         SET status = $3, responded_at = $4
         WHERE id = $1 AND status = 'pending' AND requested_by_id <> $2
           AND (player_low_id = $2 OR player_high_id = $2)
         RETURNING *`,
        [input.friendshipId, input.responderId, input.status, input.respondedAt],
      );
      const row = result.rows[0];
      if (!row) return null;

      // YALNIZCA `accepted` bildirir (bkz. sınıf doc yorumu). Reddedilen
      // bir istekte karşı tarafa "reddedildin" demek, brief §28'in
      // istemediği bir ürün kararı olurdu — üstelik istek sahibi zaten
      // isteği geri çekebiliyor.
      if (input.status === 'accepted') {
        const displayName = await this.selectDisplayName(client, input.responderId);
        await this.insertNotification(
          client,
          // Bildirim İSTEK SAHİBİNE gider — `requested_by_id` satırdan
          // okunur (yanıtlayanın kim olduğu değil, KİMİN beklediği önemli).
          row.requested_by_id,
          'friend_accepted',
          buildFriendAcceptedPayload({
            friendshipId: row.id,
            playerId: input.responderId,
            displayName,
          }),
        );
      }
      return rowToFriendship(row);
    });
  }

  async removeFriendship(input: RemoveFriendshipInput): Promise<boolean> {
    // Durum FİLTRESİ YOK (bilinçli): bu uç nokta hem "arkadaşlıktan çıkar"
    // hem "bekleyen isteğimi geri çek" anlamına gelir. Yalnızca
    // `accepted`'a izin verilseydi, yanlışlıkla gönderilen bir istek
    // `pendingRequestsLimit`'e kadar birikip yeni istek göndermeyi
    // KİLİTLERDİ (tek çıkış yolu karşı tarafın yanıtlaması olurdu).
    const result = await this.pool.query(
      'DELETE FROM friendships WHERE player_low_id = $1 AND player_high_id = $2',
      [input.lowId, input.highId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async areFriends(lowId: string, highId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM friendships
       WHERE player_low_id = $1 AND player_high_id = $2 AND status = 'accepted'
       LIMIT 1`,
      [lowId, highId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async saveMessage(input: SaveMessageInput): Promise<DirectMessageRow> {
    return withTransaction(this.pool, async (client) => {
      // CTE ile INSERT + JOIN tek gidiş-dönüşte: gönderen adı olmadan
      // `DirectMessageView` üretilemez ve ikinci bir sorgu N+1 olurdu.
      const result = await client.query<DirectMessageDbRow>(
        `WITH inserted AS (
           INSERT INTO direct_messages (sender_id, recipient_id, body)
           VALUES ($1, $2, $3)
           RETURNING id, sender_id, recipient_id, body, created_at, read_at
         )
         SELECT i.id AS message_id, i.sender_id, i.recipient_id, i.body, i.created_at, i.read_at,
                p.display_name AS sender_display_name
         FROM inserted i
         JOIN players p ON p.id = i.sender_id`,
        [input.senderId, input.recipientId, input.body],
      );
      const row = result.rows[0];
      if (!row) {
        // `INSERT ... RETURNING` + JOIN her zaman bir satır döner (gönderen
        // satırı FK ile garantidir). Buraya düşmek şema/bağlantı seviyesinde
        // beklenmedik bir durumdur — sessizce `undefined` döndürmek yerine
        // AÇIKÇA fırlatılır (`postgres-grandstand.repository.ts`'teki AYNI
        // gerekçe).
        throw new Error(`Mesaj yazılamadı (sender_id: ${input.senderId}).`);
      }

      // Önizleme SUNUCUDA kırpılır ve gövde istemciye GİTMEZ — bildirim
      // ucu bir okuma yolu DEĞİLDİR (bkz. `notificationPreviewLength` doc
      // yorumu). Gönderen adı zaten JOIN'den geldi, ikinci sorgu yok.
      await this.insertNotification(
        client,
        input.recipientId,
        'message_received',
        buildMessageReceivedPayload({
          messageId: row.message_id,
          playerId: input.senderId,
          displayName: row.sender_display_name,
          preview: buildMessagePreview(input.body, this.config.social.notificationPreviewLength),
        }),
      );
      return rowToMessage(row);
    });
  }

  async findConversation(playerId: string, otherPlayerId: string, limit: number): Promise<DirectMessageRow[]> {
    const result = await this.pool.query<DirectMessageDbRow>(
      `SELECT m.id AS message_id, m.sender_id, m.recipient_id, m.body, m.created_at, m.read_at,
              p.display_name AS sender_display_name
       FROM direct_messages m
       JOIN players p ON p.id = m.sender_id
       WHERE (m.sender_id = $1 AND m.recipient_id = $2)
          OR (m.sender_id = $2 AND m.recipient_id = $1)
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [playerId, otherPlayerId, limit],
    );
    return result.rows.map(rowToMessage);
  }

  async markConversationRead(playerId: string, otherPlayerId: string, readAt: Date): Promise<number> {
    // `read_at IS NULL` koşulu ŞART: aksi halde ikinci okuma, ilk okumanın
    // zaman damgasını EZERDİ (mesajın gerçekten ne zaman okunduğu bilgisi
    // kaybolurdu). Yalnızca HENÜZ okunmamış satırlar yazılır.
    const result = await this.pool.query(
      `UPDATE direct_messages SET read_at = $3
       WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [playerId, otherPlayerId, readAt],
    );
    return result.rowCount ?? 0;
  }

  async findInbox(playerId: string, limit: number): Promise<DirectMessageRow[]> {
    const result = await this.pool.query<DirectMessageDbRow>(
      `SELECT m.id AS message_id, m.sender_id, m.recipient_id, m.body, m.created_at, m.read_at,
              p.display_name AS sender_display_name
       FROM direct_messages m
       JOIN players p ON p.id = m.sender_id
       WHERE m.recipient_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [playerId, limit],
    );
    return result.rows.map(rowToMessage);
  }

  /**
   * Oyuncunun `display_name`ini okur. **BULUNAMAZSA FIRLATIR** — sessizce
   * boş dize döndürmek, karşı tarafa "sana birinden bildirim var ama adı
   * yok" gibi bozuk bir kart gösterirdi; oysa buraya düşmek şema
   * seviyesinde beklenmedik bir durumdur (`saveMessage`'ın "satır
   * yazıldı ama okunamadı" gerekçesiyle AYNI). Oyuncu satırının varlığı
   * çağıran tarafta FK ile zaten garantidir.
   */
  private async selectDisplayName(executor: PoolClient, playerId: string): Promise<string> {
    const result = await executor.query<{ display_name: string }>(
      'SELECT display_name FROM players WHERE id = $1',
      [playerId],
    );
    const name = result.rows[0]?.display_name;
    if (name === undefined) {
      throw new Error(`Bildirim için oyuncu adı okunamadı (player_id: ${playerId}).`);
    }
    return name;
  }

  /**
   * Bildirim satırını yazar — ÇAĞIRANIN transaction'ı İÇİNDE.
   *
   * **`executor: PoolClient` (Pool DEĞİL):** bu metot bilinçli olarak
   * havuzdan BAĞIMSIZ bir bağlantı kabul etmez; imzası "ben ancak bir
   * transaction'ın içinde çağrılırım" der. `Pool` kabul etseydi, bir gün
   * yanlışlıkla transaction DIŞINDAN çağrılır ve atomiklik sessizce
   * kaybolurdu — CLAUDE.md'nin `@Inject()` tuzağıyla aynı sınıftan,
   * derleyicinin yakalayabildiği bir hata (bkz. `NotificationRepository`
   * port doc yorumu).
   *
   * `payload` PARAMETRE olarak ve `JSON.stringify` ile geçer (SQL içinde
   * `jsonb_build_object` DEĞİL): şekil sözleşmesi `NotificationPayloadByType`
   * TS tarafındadır ve `build*Payload` fonksiyonları onu derleme zamanında
   * zorlar. Payload'ı SQL'de kurmak, alan adlarının tip tanımından sessizce
   * kaymasına izin verirdi.
   */
  private async insertNotification(
    executor: PoolClient,
    playerId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await executor.query(
      'INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)',
      [playerId, type, JSON.stringify(payload)],
    );
  }
}

function rowToFriendship(row: FriendshipDbRow): FriendshipRow {
  return {
    id: row.id,
    playerLowId: row.player_low_id,
    playerHighId: row.player_high_id,
    requestedById: row.requested_by_id,
    // `status` DB CHECK ile kısıtlıdır (migration 0033) — cast güvenlidir.
    status: row.status as FriendshipStatus,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

function rowToMessage(row: DirectMessageDbRow): DirectMessageRow {
  return {
    messageId: row.message_id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    senderDisplayName: row.sender_display_name,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}
