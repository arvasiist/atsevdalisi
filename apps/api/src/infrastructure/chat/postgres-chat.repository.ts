import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import type { ChatRepository, RaceChatMessageRow, SaveRaceMessageInput } from '../../application/ports/chat.repository';

/**
 * `ChatRepository`'nin PostgreSQL karşılığı (brief §13). `PostgresSocialRepository`
 * ile AYNI desen: `PG_POOL` (`@Global()` `DatabaseModule`'den) enjekte edilir,
 * tek ifadeli sorgular kullanılır.
 *
 * **`withTransaction` GEREKMEZ** (bilinçli): burada yazılan tek şey bir
 * sohbet satırıdır — para/mülkiyet/envanter DEĞİL. `PostgresSocialRepository`'nin
 * `saveMessage`'ı için verdiği kararın AYNISI geçerlidir (bkz. CLAUDE.md
 * "PARA/MUTASYON YOLU": `FOR UPDATE` + defter kaydı PARA yolları içindir).
 * Sohbet mesajı kaybolursa hiçbir oyuncu bir şey KAYBETMEZ.
 */
@Injectable()
export class PostgresChatRepository implements ChatRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * INSERT + `players` JOIN'i TEK ifadede (CTE) yapılır — iki ayrı sorgu
   * (yaz, sonra `username` için oku) arasında bir `await` boşluğu bırakır
   * ve aynı satırı iki kez okumak için bir gerekçe YOKTUR. `RETURNING`
   * zaten satırın tamamını verir; eksik olan tek alan `username`'dir.
   */
  async save(input: SaveRaceMessageInput): Promise<RaceChatMessageRow> {
    const result = await this.pool.query<RaceChatMessageRow>(
      `WITH inserted AS (
         INSERT INTO race_messages (race_id, player_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, race_id, player_id, body, created_at
       )
       SELECT i.id AS "messageId",
              i.race_id AS "raceId",
              i.player_id AS "playerId",
              p.username AS "username",
              i.body AS "body",
              i.created_at AS "createdAt"
       FROM inserted i
       JOIN players p ON p.id = i.player_id`,
      [input.raceId, input.playerId, input.body],
    );
    // `INSERT ... RETURNING` + JOIN her zaman TAM olarak bir satır döner:
    // `player_id` FK'si oyuncunun varlığını, JOIN ise eşleşmeyi garanti
    // eder. Yine de `rows[0]`'ı körlemesine `!` ile zorlamak yerine
    // (CLAUDE.md ruhu: sessiz `undefined` yerine görünür hata) burada
    // açık bir kontrol vardır — bu dal NORMALDE çalışmaz.
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Sohbet mesajı yazıldı ama okunamadı (INSERT ... RETURNING boş döndü).');
    }
    return row;
  }

  /**
   * Son `limit` mesaj, KRONOLOJİK sırada.
   *
   * **İç SELECT neden `DESC`, dış SELECT neden `ASC`:** "son N" almak için
   * `ORDER BY created_at DESC LIMIT n` ŞARTTIR (artan sırada `LIMIT`
   * yarışın İLK mesajlarını verirdi). Ama istemciye kronolojik sıra
   * gitmelidir (bkz. `RaceChatHistoryPayload` doc yorumu). İki gereksinimi
   * karşılamanın yolu budur — sıralamayı JS'te ters çevirmek yerine
   * (N satır için gereksiz bir kopya) veritabanında yapılır.
   */
  async findRecent(raceId: string, limit: number): Promise<RaceChatMessageRow[]> {
    const result = await this.pool.query<RaceChatMessageRow>(
      `SELECT * FROM (
         SELECT m.id AS "messageId",
                m.race_id AS "raceId",
                m.player_id AS "playerId",
                p.username AS "username",
                m.body AS "body",
                m.created_at AS "createdAt"
         FROM race_messages m
         JOIN players p ON p.id = m.player_id
         WHERE m.race_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2
       ) recent
       ORDER BY recent."createdAt" ASC`,
      [raceId, limit],
    );
    return result.rows;
  }
}
