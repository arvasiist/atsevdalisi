-- 0063 — PRATİK/PvP KATILIMINA KOŞTURAN OYUNCU (03.10.2026, Faz 14).
--
-- Faz 14 yolculuk testi buldu: pratik ve PvP katılımları `player_id`
-- yazmıyordu; sıralama/sezon/görev yarışı atın ŞİMDİKİ sahibine yazıyordu.
-- At satılınca satıcının geçmişi alıcıya geçiyor, sezon ÖDÜLÜ (para)
-- kazanmış at satın alınarak devralınabiliyordu. Yeni satırlar artık
-- `player_id` yazar (repository). Bu migration ESKİ satırları defterden
-- doldurur: tek gerçek katılımlı yarışta pratik ücret/ödül satırını yazan
-- TEK oyuncu koşturan oyuncudur (pratik yarış yalnızca atın sahibine açıktı).
-- Defter kaydı olmayan (ücretsiz, ödülsüz) eski satırlar NULL kalır ve
-- sorgular eskisi gibi at sahibine düşer — tahmin YAZILMAZ.
WITH single_human AS (
  SELECT e.race_id, MIN(e.id::text)::uuid AS entry_id
    FROM race_entries e
   WHERE e.bot_label IS NULL
   GROUP BY e.race_id
  HAVING COUNT(*) = 1 AND BOOL_AND(e.player_id IS NULL)
),
payer AS (
  SELECT s.entry_id, MIN(t.player_id::text)::uuid AS player_id
    FROM single_human s
    JOIN economy_transactions t
      ON t.reference_id = s.race_id::text
     AND t.type IN ('practice_race_entry_fee', 'practice_race_prize')
   GROUP BY s.entry_id
  HAVING COUNT(DISTINCT t.player_id) = 1
)
UPDATE race_entries e
   SET player_id = payer.player_id
  FROM payer
 WHERE e.id = payer.entry_id;
