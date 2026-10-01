import type { Pool, PoolClient } from 'pg';

/**
 * "Bu at henüz koşulmamış bir lobi yarışına kayıtlı mı?" — TEK tanım
 * (30.09.2026). Üç yol bunu kullanır: lobi katılımı
 * (`PostgresRaceRepository.joinLobbyRace`), pazar ilanı
 * (`PostgresHorseRepository.isInActiveRace` → `CreateMarketListingUseCase`)
 * ve pazar satın alması (`PostgresMarketPurchaseRepository`). Tanım üç yere
 * kopyalansaydı biri `locking`i unuttuğu gün satılmış at yine eski sahibi
 * adına koşardı ve bu hiçbir yerde hata üretmezdi.
 *
 * **AKTİF = `scheduled` VEYA `locking`.** `locking` şarttır: kilitlenen
 * yarışın snapshot'ı alınmıştır ama ödül henüz dağıtılmamıştır; o arada
 * sahiplik değişirse ödül yine katılım satırının `player_id`sine (satıcıya)
 * gider. `finished`/`cancelled` yarışlar atı bağlamaz. Pratik/PvP yarışları
 * satıra `finished` olarak doğduğu için buraya hiç takılmaz.
 *
 * **İPTAL EDİLMİŞ KATILIM SAYILMAZ** (`IS DISTINCT FROM`, `<>` DEĞİL —
 * pratik satırlarında `status` NULL'dur; `NULL <> 'x'` NULL döner).
 *
 * Kilit ALMAZ — çağıran, gerekiyorsa `horses` satırını ÖNCE kendisi
 * `FOR UPDATE` ile kilitler (katılım ve satın alma yolları bunu yapar;
 * ikisi de aynı at satırında sıraya girdiği için "aynı anda katıl + sat"
 * penceresi kapanır).
 */
export async function isHorseInActiveRace(
  executor: Pool | PoolClient,
  horseId: string,
  excludeRaceId: string | null = null,
): Promise<boolean> {
  const result = await executor.query<{ found: number }>(
    `SELECT 1 AS found
     FROM race_entries e
     JOIN races r ON r.id = e.race_id
     WHERE e.horse_id = $1
       AND e.player_id IS NOT NULL
       AND e.status IS DISTINCT FROM 'cancelled'
       AND r.status IN ('scheduled', 'locking')
       AND ($2::uuid IS NULL OR r.id <> $2::uuid)
     UNION ALL
     -- 01.10.2026 — süren oyuncu kontrollü yarıştaki at da kilitlidir
     -- (satılırsa ödül/XP yanlış sahibe giderdi).
     SELECT 1 AS found FROM interactive_races i
     WHERE i.horse_id = $1 AND i.status = 'running'
     LIMIT 1`,
    [horseId, excludeRaceId],
  );
  return result.rows.length > 0;
}
