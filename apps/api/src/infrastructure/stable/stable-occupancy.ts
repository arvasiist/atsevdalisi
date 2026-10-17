import type { Pool, PoolClient } from 'pg';

/**
 * 16.10.2026 (brief §5) — ahırda DOLU yer = atlar + doğumu beklenen gebelikler.
 * Tayın yeri döllenmede ayrılır; at alan her yol (pazar, müzayede, ırk
 * mağazası, döllenme) aynı sayımı kullanır, yoksa gebelik sırasında alınan
 * atla doğum ahırı taşırırdı. Çağıran oyuncu satırını KİLİTLEMİŞ olmalıdır.
 */
export async function countStableOccupancy(executor: Pool | PoolClient, playerId: string): Promise<number> {
  const result = await executor.query<{ occupied: string }>(
    `SELECT (SELECT COUNT(*) FROM horses WHERE owner_id = $1)
          + (SELECT COUNT(*) FROM pregnancies WHERE owner_id = $1 AND status = 'gestating') AS occupied`,
    [playerId],
  );
  return Number(result.rows[0]?.occupied ?? 0);
}
