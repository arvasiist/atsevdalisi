-- 0037 — LOBİ YARIŞINA KATILMA (brief §2/§3/§6, PHASE 1b).
--
-- `race_entries` bugüne kadar YALNIZCA sunucunun ürettiği yarışları
-- (pratik yarış + PvP eşleşme) tutuyordu ve bu yollarda at sahipliği
-- `horses.owner_id` üzerinden CANLI okunuyordu. Oyuncunun kendi açtığı
-- ÜCRETLİ bir yarışa katılması iki yeni olgu getirir:
--
--   1. KATILIMCI KİMLİĞİ DONAR. Ücret katılım anında alınır; at
--      sonradan satılırsa ödülü ATI SATAN değil, ÜCRETİ ÖDEYEN almalıdır.
--      `horses.owner_id` canlı okunduğu sürece bu yanlış kişiye ödenirdi.
--      Bu yüzden `player_id` katılım anında yazılır ve DONDURULUR.
--   2. HAZIR-OLMA DURUMU. brief §6 katılımdan sonra READY düğmesi ve
--      WAITING/READY/NOT_READY/CANCELLED durumlarını ister.
--
-- DİKKAT — `status` BİLİNÇLİ olarak NULLABLE ve DEFAULT'suz:
-- pratik yarış ve PvP girişleri ZATEN KOŞMUŞ yarışların satırlarıdır;
-- onlara `waiting` yazmak yalan olurdu. Hazır-olma durumu YALNIZCA lobi
-- yarışlarında anlamlıdır, diğerlerinde NULL kalır. Aynı gerekçe
-- `player_id` için de geçerlidir (bot girişlerinde zaten NULL olmalıdır).

ALTER TABLE race_entries
  ADD COLUMN player_id UUID REFERENCES players(id) ON DELETE CASCADE;

ALTER TABLE race_entries
  ADD COLUMN status TEXT;

-- Bot girişinin sahibi OLAMAZ (botun oyuncusu yoktur). Gerçek at girişinde
-- ise sahip ZORUNLU DEĞİLDİR: eski/pratik yollar bu sütunu yazmaz, bkz.
-- yukarıdaki DİKKAT notu.
ALTER TABLE race_entries
  ADD CONSTRAINT race_entries_bot_has_no_player_chk
  CHECK (player_id IS NULL OR horse_id IS NOT NULL);

-- brief §6 — READY sisteminin durum kümesi. `config/race-lobby.config.json`
-- içindeki `entryStatuses` ile BİREBİR aynı olmak zorundadır
-- (`race-lobby-config.spec.ts` bu dosyayı OKUYARAK doğrular).
ALTER TABLE race_entries
  ADD CONSTRAINT race_entries_status_valid
  CHECK (status IS NULL OR status IN ('waiting', 'ready', 'not_ready', 'cancelled'));

-- BİR OYUNCU BİR YARIŞA YALNIZCA BİR ATLA GİREBİLİR.
-- Kısmi (partial) indeks: yalnızca `player_id` DOLU satırları kapsar, yani
-- pratik/PvP/bot girişlerini etkilemez. Kuralın veritabanında zorlanması
-- şarttır — uygulama katmanındaki ön kontrol ile eşzamanlı iki istek
-- arasındaki yarış (TOCTOU) yalnızca bu indeksle kapanır.
CREATE UNIQUE INDEX race_entries_race_player_uq
  ON race_entries (race_id, player_id)
  WHERE player_id IS NOT NULL;

-- "Bu yarışa kaç GERÇEK oyuncu katıldı" (brief §5 doluluk) sorgusu ve
-- "benim katılımlarım" listesi bu indeksten okur.
CREATE INDEX idx_race_entries_player_id ON race_entries (player_id);

COMMENT ON COLUMN race_entries.player_id IS
  'brief §2 — katılım anında DONDURULAN katılımcı. Pratik/PvP girişlerinde ve bot girişlerinde NULL (orada sahiplik horses.owner_id üzerinden canlı okunur).';
COMMENT ON COLUMN race_entries.status IS
  'brief §6 hazır-olma durumu (waiting/ready/not_ready/cancelled). YALNIZCA lobi yarışlarında anlamlıdır; sunucu üretimi yarışlarda NULL.';
