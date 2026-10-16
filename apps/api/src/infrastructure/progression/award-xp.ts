import type { PoolClient } from 'pg';
import type { ProgressionConfig } from '@at-sevdalisi/game-config';
import { applyXpGain, type LevelProgressResult } from '../../domain/progression/progression';

/**
 * XP'YI ÇAĞIRANIN TRANSACTION'INDA YAZAR (01.10.2026).
 *
 * Yarışın parası/sonucu hangi transaction'da yazılıyorsa XP de ORADA
 * yazılır: ayrı bir transaction olsaydı, geri alınmış bir yarış oyuncuya
 * yine de XP bırakabilirdi (bildirim/defter kuralıyla aynı gerekçe).
 * Satır `FOR UPDATE` ile kilitlenir — eşzamanlı iki yarış aynı oyuncunun
 * XP'sini okuyup birbirinin yazımını EZMESİN.
 *
 * `xp <= 0` ise hiçbir şey yazılmaz. Satır yoksa (silinmiş at/oyuncu)
 * `null` döner; XP bir para yolu değildir, eksik satır yarışı düşürmez.
 */
export async function awardXpInTransaction(
  client: PoolClient,
  table: 'players' | 'horses',
  id: string,
  xp: number,
  config: ProgressionConfig,
  now: Date = new Date(),
): Promise<LevelProgressResult | null> {
  if (xp <= 0) {
    return null;
  }
  // Tablo adı parametre olamaz; yalnızca iki sabit değerden biri gelir (tip kapalı).
  const result = await client.query<{ level: number; xp: string }>(
    `SELECT level, xp FROM ${table === 'players' ? 'players' : 'horses'} WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const progress = applyXpGain(row.level, Number(row.xp), xp, config);
  await client.query(
    `UPDATE ${table === 'players' ? 'players' : 'horses'} SET level = $2, xp = $3, updated_at = $4 WHERE id = $1`,
    [id, progress.level, progress.xp, now],
  );
  return progress;
}
