-- 09.10.2026 — KULÜP İÇİ YARIŞ (sahibinin kararı). Lider/subay yalnızca
-- kendi kulübünün üyelerinin katılabildiği bir lobi yarışı açabilir.
-- NULL = herkese açık (mevcut satırlar değişmez).
--
-- Yabancı anahtar BİLİNÇLİ OLARAK YOK: kulüp feshedilince (`DELETE FROM
-- clubs`) ON DELETE SET NULL yarışı sessizce HERKESE açardı, CASCADE parası
-- ödenmiş yarışı silerdi, RESTRICT ise geçmiş yarışı olan kulübün feshini
-- sonsuza dek engellerdi. Sütun kalır; kulüp yoksa üyesi de yoktur → katılım
-- kapısı herkese KAPALIDIR (bilinmeyen ırk sınıfıyla aynı ilke).
ALTER TABLE races ADD COLUMN club_id UUID NULL;
CREATE INDEX races_club_id_idx ON races (club_id) WHERE club_id IS NOT NULL;
