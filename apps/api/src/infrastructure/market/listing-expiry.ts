import type { Pool, PoolClient } from 'pg';

/**
 * SABİT FİYATLI İLAN SÜRE DOLUMU — TEK ATOMİK İFADE (08.10.2026).
 *
 * Eskiden süpürme önce `SELECT` ile süresi dolanları okuyor, sonra her
 * satırı KOŞULSUZ `UPDATE … WHERE id = $1` ile `expired` yapıyordu: arada
 * eşzamanlı bir satın alma ilanı `sold` yaparsa süpürme onu `expired`a GERİ
 * yazardı (para ve at el değiştirmiş, ilan kaydı yanlış). Artık geçiş
 * `status = 'active'` koşulunun İÇİNDE ve tek ifadededir — bir satır yalnızca
 * bir kez `expired` olur ve satıcının `listing_expired` bildirimi AYNI
 * ifadede yazılır (iki kez yazılamaz).
 *
 * Müzayede ASLA burada süpürülmez: teklifli bir müzayede `expired` yapılsaydı
 * emanet askıda kalırdı — onu `AuctionSettleScheduler` kapatır.
 *
 * `listingId` verilirse yalnızca o ilan (satın alma yolu, satır zaten
 * `FOR UPDATE` kilitli); verilmezse süresi dolan bütün sabit fiyatlı ilanlar.
 */
export async function expireDueFixedPriceListings(
  db: Pool | PoolClient,
  now: Date,
  listingId: string | null = null,
): Promise<string[]> {
  const result = await db.query<{ listing_id: string }>(
    `WITH expired AS (
       UPDATE market_listings l
          SET status = 'expired'
        WHERE l.status = 'active'
          AND l.listing_type = 'fixed_price'
          AND l.expires_at IS NOT NULL
          AND l.expires_at <= $1
          AND ($2::uuid IS NULL OR l.id = $2::uuid)
        RETURNING l.id, l.seller_id, l.horse_id, l.price
     ),
     notified AS (
       INSERT INTO notifications (player_id, type, payload)
       SELECT e.seller_id, 'listing_expired',
              jsonb_build_object(
                'listingId', e.id,
                'horseId', e.horse_id,
                'horseName', COALESCE(h.name, ''),
                'price', e.price::float8)
         FROM expired e
         LEFT JOIN horses h ON h.id = e.horse_id
         JOIN players p ON p.id = e.seller_id AND p.deleted_at IS NULL
       RETURNING player_id
     )
     SELECT e.id AS listing_id FROM expired e`,
    [now, listingId],
  );
  return result.rows.map((row) => row.listing_id);
}
