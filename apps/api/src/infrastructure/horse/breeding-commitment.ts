import type { Pool, PoolClient } from 'pg';

/**
 * 16.10.2026 (brief §4–§5) — at gebe (kısrak olarak) ya da yanıt bekleyen bir
 * çiftleştirme teklifinde (kısrak ya da aygır olarak) mi? Böyle bir at
 * satışa çıkamaz ve satılamaz: emanetteki ücret ve ayrılmış ahır yeri yanlış
 * sahipte kalırdı. Tek tanım: ilan açma ön kontrolü + satın alma/müzayede
 * kapanışı transaction'ı aynı sorguyu kullanır.
 */
export async function hasBreedingCommitment(executor: Pool | PoolClient, horseId: string): Promise<boolean> {
  const result = await executor.query<{ found: number }>(
    `SELECT 1 AS found FROM pregnancies WHERE mare_id = $1 AND status = 'gestating'
     UNION ALL
     SELECT 1 AS found FROM breeding_offers
      WHERE (mare_id = $1 OR stallion_id = $1) AND status = 'pending'
     LIMIT 1`,
    [horseId],
  );
  return result.rows.length > 0;
}
