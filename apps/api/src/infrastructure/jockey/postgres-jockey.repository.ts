import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Jockey } from '@at-sevdalisi/shared-types';
import {
  JockeyAlreadyHiredError,
  JockeyAlreadyOwnedError,
  JockeyNotFoundError,
  JockeyNotOwnedError,
} from '../../domain/jockey/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { debit } from '../../domain/economy/wallet';
import { PG_POOL, withTransaction } from '../database/database.module';
import type {
  HireJockeyInput,
  HireJockeyResult,
  JockeyRepository,
  ReleaseJockeyInput,
  ReleaseJockeyResult,
} from '../../application/ports/jockey.repository';

/** `jockeys` satırının HAM hâli (pg sürücüsü `NUMERIC`/`BIGINT`i METİN döner). */
interface JockeyRow {
  id: string;
  name: string;
  experience: number;
  start_skill: string;
  tactical_skill: string;
  sprint_skill: string;
  horse_control: string;
  risk_management: string;
  track_knowledge: string;
  salary: string;
  owner_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * ⚠️ `pg` `NUMERIC`/`BIGINT` sütunları **METİN** döner (CLAUDE.md'nin
 * `toNumber()` uyarısı, `postgres-admin.repository.ts` ile AYNI tuzak).
 * `Number(...)` unutulursa `jockey.startSkill` `"82.00"` olur ve
 * `calculateJockeySkillComposite` onu `*` ile çarpar — JavaScript bunu
 * sessizce sayıya çevirir, yani hata GÖRÜNMEZ ama `experience` gibi
 * `+` ile toplanan alanlar **birleştirme** yapardı (`"120" + 1 = "1201"`).
 * Bu yüzden dönüşüm TEK bir yerde toplanır.
 */
function rowToJockey(row: JockeyRow): Jockey {
  return {
    id: row.id,
    name: row.name,
    experience: Number(row.experience),
    startSkill: Number(row.start_skill),
    tacticalSkill: Number(row.tactical_skill),
    sprintSkill: Number(row.sprint_skill),
    horseControl: Number(row.horse_control),
    riskManagement: Number(row.risk_management),
    trackKnowledge: Number(row.track_knowledge),
    salary: Number(row.salary),
    ownerId: row.owner_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const JOCKEY_COLUMNS =
  'id, name, experience, start_skill, tactical_skill, sprint_skill, horse_control, risk_management, track_knowledge, salary, owner_id, created_at, updated_at';

/**
 * `JockeyRepository`nin PostgreSQL implementasyonu (PHASE 6.2).
 *
 * **`hire` PROJEDEKİ EN KÜÇÜK PARA YOLUDUR — ve yine de TAM kurala
 * uyar:** `SELECT ... FOR UPDATE` + AYNI transaction'da
 * `economy_transactions` satırı (CLAUDE.md kural 7). Küçük olduğu için
 * kuralı gevşetmek caziptir; ama "kilit olmadan oku, sonra yaz" tam
 * olarak çift kiralamanın (aynı jokeyin iki oyuncuya gitmesi) ve
 * kaybolan güncellemenin (aynı bakiyeden iki kez düşülmesi) yoludur.
 *
 * **KİLİT SIRASI: `jockeys` → `players`.** İki kilit de kendi türünün
 * içinde sıralıdır (tek satır / tek oyuncu), yani çapraz kilitlenme
 * oluşamaz. `joinLobbyRace`in `races` → `players` sırasıyla ÇAKIŞMAZ:
 * ortak tek kaynak `players`tır ve o her ikisinde de SONRA kilitlenir.
 */
@Injectable()
export class PostgresJockeyRepository implements JockeyRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAvailable(): Promise<Jockey[]> {
    const result = await this.pool.query<JockeyRow>(
      // `salary` ARTAN: ucuz jokey önce görünür — liste bir "vitrin"dir ve
      // alfabetik sıralama oyuncuyu fiyat hakkında kör bırakırdı.
      `SELECT ${JOCKEY_COLUMNS} FROM jockeys WHERE owner_id IS NULL ORDER BY salary ASC, name ASC`,
    );
    return result.rows.map(rowToJockey);
  }

  async findById(jockeyId: string): Promise<Jockey | null> {
    const result = await this.pool.query<JockeyRow>(`SELECT ${JOCKEY_COLUMNS} FROM jockeys WHERE id = $1 LIMIT 1`, [
      jockeyId,
    ]);
    return result.rows[0] ? rowToJockey(result.rows[0]) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Jockey | null> {
    const result = await this.pool.query<JockeyRow>(
      `SELECT ${JOCKEY_COLUMNS} FROM jockeys WHERE owner_id = $1 LIMIT 1`,
      [ownerId],
    );
    return result.rows[0] ? rowToJockey(result.rows[0]) : null;
  }

  async hire(input: HireJockeyInput): Promise<HireJockeyResult> {
    return withTransaction(this.pool, async (client) => {
      // (1) Jokey satırı KİLİTLENİR ve `owner_id` KİLİT ALTINDA okunur.
      // Dışarıda okunan bir değerle karar vermek, iki eşzamanlı kiralamanın
      // aynı jokeyi İKİ oyuncuya vermesine izin verirdi (TOCTOU) — ve bu
      // hiçbir yerde hata üretmezdi.
      const jockeyResult = await client.query<JockeyRow>(
        `SELECT ${JOCKEY_COLUMNS} FROM jockeys WHERE id = $1 FOR UPDATE`,
        [input.jockeyId],
      );
      const jockeyRow = jockeyResult.rows[0];
      if (jockeyRow === undefined) {
        throw new JockeyNotFoundError(input.jockeyId);
      }
      if (jockeyRow.owner_id !== null) {
        throw new JockeyAlreadyOwnedError(input.jockeyId);
      }

      // (2) Oyuncunun ZATEN bir jokeyi var mı? Bu kontrol de kilit altında
      // yapılır: aksi hâlde iki farklı jokeyi aynı anda kiralayan bir oyuncu
      // İKİSİNİ de alırdı (`findByOwnerId` tekil döndüğü için ikincisi
      // görünmez olurdu — sessiz bir kayıp).
      const existing = await client.query<{ id: string }>('SELECT id FROM jockeys WHERE owner_id = $1 LIMIT 1', [
        input.playerId,
      ]);
      const existingId = existing.rows[0]?.id;
      if (existingId !== undefined) {
        throw new JockeyAlreadyHiredError(existingId);
      }

      const salary = Number(jockeyRow.salary);

      // (3) Bakiye. `players` kilidi `jockeys`ten SONRA alınır (yukarıdaki
      // sınıf doc yorumundaki kilit sırası).
      const balanceResult = await client.query<{ money: string }>(
        'SELECT money FROM players WHERE id = $1 FOR UPDATE',
        [input.playerId],
      );
      const balanceRow = balanceResult.rows[0];
      if (balanceRow === undefined) {
        throw new PlayerNotFoundError(input.playerId);
      }
      const balanceBefore = Number(balanceRow.money);

      // ⚠️ `salary = 0` OLABİLİR (sütun varsayılanı 0). `wallet.ts`in kuralı
      // ve `economy_transactions.amount <> 0` CHECK'i gereği SIFIR TUTARLI
      // bir hareket deftere YAZILMAZ — muhasebe anlamında hiç
      // gerçekleşmemiştir. Bu yüzden ücretsiz bir jokeyde ne `UPDATE
      // players` ne de defter satırı yazılır; kiralama yine de gerçekleşir.
      let balanceAfter = balanceBefore;
      if (salary > 0) {
        const wallet = debit({ money: balanceBefore, gems: 0 }, salary, 'money');
        balanceAfter = wallet.money;
        await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
          input.playerId,
          balanceAfter,
          input.now,
        ]);
      }

      // (4) Sahiplik devri — aynı transaction.
      const updated = await client.query<JockeyRow>(
        `UPDATE jockeys SET owner_id = $2, updated_at = $3 WHERE id = $1 RETURNING ${JOCKEY_COLUMNS}`,
        [input.jockeyId, input.playerId, input.now],
      );
      const updatedRow = updated.rows[0];
      if (updatedRow === undefined) {
        // Ulaşılamaz: satır yukarıda FOR UPDATE ile bulundu. Savunma amaçlı.
        throw new JockeyNotFoundError(input.jockeyId);
      }

      // (5) Defter — bakiye güncellemesiyle AYNI transaction (CLAUDE.md 7).
      if (salary > 0) {
        await client.query(
          `INSERT INTO economy_transactions
             (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            input.playerId,
            'jockey_hire',
            // İMZALI: negatif = düşüm. `debit`in ürettiği yeni bakiyeden
            // türetilir, ayrıca hesaplanmaz — iki kaynak asla ayrışmasın.
            balanceAfter - balanceBefore,
            'money',
            'jockeys',
            input.jockeyId,
            balanceBefore,
            balanceAfter,
          ],
        );
      }

      return { jockey: rowToJockey(updatedRow), paid: salary, balanceBefore, balanceAfter };
    });
  }

  /**
   * Jokeyi serbest bırakır (`owner_id = NULL`) — **PARA HAREKET ETMEZ.**
   *
   * **NEDEN YİNE DE `withTransaction`:** tek bir `UPDATE` yeterdi, ama
   * karar (sahiplik) KİLİT ALTINDA okunmak zorundadır. `UPDATE ... WHERE
   * id = $1 AND owner_id = $2` yazıp etkilenen satır sayısına bakmak da
   * atomiktir; ancak o zaman "bulunamadı" ile "senin değil" ayırt
   * EDİLEMEZ — ikisi de 0 satır döndürür ve istemciye yanlış kod
   * giderdi. Kilitli okuma bu ayrımı gerçek kılar.
   *
   * **`players` KİLİTLENMEZ.** `hire`dan farklı olarak burada bakiye
   * okunmaz/yazılmaz; kilit sırası (`jockeys` → `players`) bozulmaz,
   * çünkü ikinci kilit hiç alınmaz. Bu, `hire` ile çapraz kilitlenme
   * riskini de ortadan kaldırır.
   */
  async release(input: ReleaseJockeyInput): Promise<ReleaseJockeyResult> {
    return withTransaction(this.pool, async (client) => {
      const jockeyResult = await client.query<JockeyRow>(
        `SELECT ${JOCKEY_COLUMNS} FROM jockeys WHERE id = $1 FOR UPDATE`,
        [input.jockeyId],
      );
      const jockeyRow = jockeyResult.rows[0];
      if (jockeyRow === undefined) {
        throw new JockeyNotFoundError(input.jockeyId);
      }
      // İKİ ALT DURUM (sahipsiz / başkasında) TEK hataya düşer — yön
      // sızdırılmaz (bkz. `JockeyNotOwnedError` doc yorumu).
      if (jockeyRow.owner_id !== input.playerId) {
        throw new JockeyNotOwnedError(input.jockeyId);
      }

      const updated = await client.query<JockeyRow>(
        `UPDATE jockeys SET owner_id = NULL, updated_at = $2 WHERE id = $1 RETURNING ${JOCKEY_COLUMNS}`,
        [input.jockeyId, input.now],
      );
      const updatedRow = updated.rows[0];
      if (updatedRow === undefined) {
        // Ulaşılamaz: satır yukarıda FOR UPDATE ile bulundu. Savunma amaçlı.
        throw new JockeyNotFoundError(input.jockeyId);
      }

      // DEFTER SATIRI YOK — bilinçli. Bakiye değişmediği için yazılacak
      // bir muhasebe hareketi de yoktur (`amount <> 0` CHECK'i sıfır
      // tutarlı bir satırı zaten reddederdi).
      return { jockey: rowToJockey(updatedRow) };
    });
  }
}
