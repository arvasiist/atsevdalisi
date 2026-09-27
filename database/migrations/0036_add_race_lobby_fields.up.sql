-- Oyuncunun OLUŞTURDUĞU ücretli yarış (brief §1-§7, §9-§11, §42 PHASE 1).
--
-- GEREKÇE: `races` (migration 0006) şu ana kadar YALNIZCA SUNUCUNUN
-- kurguladığı yarışlar için kullanılıyordu — pratik yarış
-- (`POST /horses/:id/practice-race`) ve PvP eşleştirme. İkisinde de
-- yarışı sunucu üretir, oyuncu yalnızca katılır. Brief §1 ise oyuncunun
-- KENDİ yarışını açmasını ve dokuz alanı belirlemesini ister: yarış adı,
-- at sayısı, katılım ücreti, maksimum oyuncu, başlangıç zamanı, pist,
-- mesafe, yarış tipi, tribün kapasitesi.
--
-- MEVCUT SÜTUNLARIN ÇOĞU ZATEN YETİYOR (brief §29: "mevcut entity'leri
-- gereksiz yere yeniden oluşturma. Mevcut yapıya entegre et."): `name`,
-- `distance_m`, `surface`, `weather`, `participant_limit`, `entry_fee`,
-- `start_time`, `simulation_seed` migration 0006'dan beri var. Bu
-- migration YALNIZCA eksik olanı ekler.
--
-- NEDEN `participant_limit` = AT SAYISI ama `max_players` = OYUNCU SAYISI
-- (brief §6: "yarışın at sayısı ile oyuncu sayısını birbirinden ayır"):
-- §6'nın örneği "12 atlık yarış = 8 oyuncu + 4 AI horse"tur. Tek bir
-- sütunla bu ifade EDİLEMEZ; iki ayrı tavan gerekir. `participant_limit`
-- motorun kaç at koşturacağını (start gate / şerit sayısı, §7), yeni
-- `max_players` ise kaç GERÇEK oyuncunun para yatırabileceğini söyler.

ALTER TABLE races
  -- Yarışı AÇAN oyuncu (§1). `NULL` olabilir çünkü bu tabloda ZATEN
  -- sunucu üretimi yarışlar var (pratik/PvP) ve onların bir oluşturucusu
  -- yoktur. `ON DELETE SET NULL`: oyuncu silinirse yarış KALIR — geçmiş
  -- ve replay bozulmaz, yalnızca sahiplik bağı kopar (`race_entries`'in
  -- aksine burada CASCADE YANLIŞ olurdu: başkalarının koştuğu bir yarışın
  -- kaydını, o yarışı açan kişi hesabını silince yok etmek veri kaybıdır).
  ADD COLUMN created_by UUID REFERENCES players(id) ON DELETE SET NULL,
  -- Kaç GERÇEK oyuncunun katılabileceği (§1 "Maksimum oyuncu", §6
  -- MAX_PLAYERS). Mevcut satırlar için aşağıda `participant_limit`'e
  -- eşitlenir; yeni yarışlarda `<= participant_limit` olmak zorundadır.
  ADD COLUMN max_players INTEGER,
  -- §1 "Yarış tipi". `paid` ise giriş ücreti ALINIR, `free` ise alınmaz.
  -- Ayrı bir `tribune_type` sütunu YOKTUR: §9'un "Tribün: FREE PAID"
  -- ayrımı tam olarak `tribune_fee > 0` sınırıdır ve iki alanı ayrı
  -- tutmak "FREE ama 25 Çip" gibi çelişkili bir satırı mümkün kılardı.
  ADD COLUMN race_type TEXT NOT NULL DEFAULT 'free',
  -- Tribün giriş ücreti (§10). 0 = FREE. `BIGINT` çünkü `entry_fee` ile
  -- AYNI birim (Çip) ve AYNI tablo — tip uyuşmazlığı olmasın.
  ADD COLUMN tribune_fee BIGINT NOT NULL DEFAULT 0,
  -- İzleyici kapasitesi (§11). Dolduğunda istemci "TRIBUNE FULL" gösterir.
  -- Bu sütun §1'in açık talebi olduğu için yarış OLUŞTURULURKEN yazılır;
  -- kapasiteyi UYGULAYAN akış (bilet satışı + doluluk kontrolü) PHASE
  -- 6'nın işidir — sütun şimdi eklenir ki sonradan bir "backfill"
  -- migration'ı gerekmesin.
  ADD COLUMN spectator_capacity INTEGER NOT NULL DEFAULT 500;

-- MEVCUT SATIRLARIN GERİ DOLDURULMASI (backfill).
--
-- SIRA ÖNEMLİDİR: `race_type` aşağıdaki CHECK'ten ÖNCE doğru değere
-- getirilmezse, giriş ücreti olan (100/250/500/1000/2000) TÜM mevcut
-- pratik yarış satırları `races_race_type_matches_fee` kısıtını İHLAL
-- ederdi ve migration yarıda kalırdı.
UPDATE races SET race_type = CASE WHEN entry_fee > 0 THEN 'paid' ELSE 'free' END;

-- Sunucu üretimi yarışlarda "oyuncu tavanı" kavramı yoktu; alan büyüklüğü
-- tek tavandı. En yakın doğru karşılık `participant_limit`'tir.
UPDATE races SET max_players = participant_limit WHERE max_players IS NULL;

-- DİKKAT — BU SATIR AŞAĞIDAKİ `races_name_length` KISITINDAN **ÖNCE**
-- ÇALIŞMAK ZORUNDADIR. Sonra çalışsaydı, 60 karakterden uzun TEK bir
-- mevcut satır `ALTER TABLE`'ı düşürür ve migration yarıda kalırdı
-- (kısıt eklenirken var olan satırlar da taranır). Veriye bağlı bir
-- düşme, aynı kodun bir ortamda geçip başka bir ortamda patlaması
-- demektir — bu yüzden normalizasyon kısıttan ÖNCE, tek bir yerde durur.
UPDATE races SET name = left(name, 60) WHERE char_length(name) > 60;

ALTER TABLE races
  ALTER COLUMN max_players SET NOT NULL,
  -- En az bir oyuncu olmalı — 0 oyunculu bir yarış hiç başlayamaz.
  ADD CONSTRAINT races_max_players_positive CHECK (max_players > 0),
  -- §6: oyuncu sayısı at sayısını AŞAMAZ. Bu olmadan 12 atlık bir yarışa
  -- 13. oyuncu kaydı yapılabilir ve 13. oyuncunun atı start gate'te
  -- (yalnızca 12 yuva) yer bulamazdı — sunucu tarafında sessiz bir
  -- tutarsızlık.
  ADD CONSTRAINT races_max_players_within_field CHECK (max_players <= participant_limit),
  ADD CONSTRAINT races_race_type_valid CHECK (race_type IN ('free', 'paid')),
  -- `race_type` ile `entry_fee` ÇELİŞEMEZ. Bu kısıt olmadan "free ama
  -- 500 Çip giriş ücretli" bir satır yazılabilir ve para yolu (giriş
  -- ücreti tahsilatı) hangisine güveneceğini bilemezdi.
  ADD CONSTRAINT races_race_type_matches_fee CHECK ((race_type = 'paid') = (entry_fee > 0)),
  ADD CONSTRAINT races_tribune_fee_non_negative CHECK (tribune_fee >= 0),
  ADD CONSTRAINT races_spectator_capacity_positive CHECK (spectator_capacity > 0),
  -- Yalnızca ÜST sınır veritabanında tutulur. ALT sınır (3 karakter,
  -- `config/race-lobby.config.json → nameLength.min`) DOMAIN'de uygulanır:
  -- bu tabloda, bu migration'dan ÖNCE üretilmiş sunucu adları var ve
  -- onların hepsinin >= 3 karakter olduğunu kanıtlamanın bir yolu yok —
  -- veriye bağlı bir kısıt, migration'ı ortamdan ortama FARKLI biçimde
  -- düşürebilirdi. Üst sınır ise `left()` ile normalize edildiğinden
  -- güvenle eklenir.
  ADD CONSTRAINT races_name_length CHECK (char_length(name) BETWEEN 1 AND 60);

-- `maxOpenRacesPerPlayer` tavanı (config) her yarış açma isteğinde
-- "bu oyuncunun kaç AÇIK yarışı var?" sorusunu sorar. `status` de sorguya
-- girdiğinden bileşik indeks seçildi: tek sütunlu bir indeks, yarışların
-- çoğu 'finished' olduğunda neredeyse tüm satırları tarardı.
CREATE INDEX idx_races_created_by_status ON races (created_by, status);

COMMENT ON COLUMN races.created_by IS 'Yarışı AÇAN oyuncu (brief §1). NULL = sunucu üretimi yarış (pratik/PvP) — onların oluşturucusu yoktur.';
COMMENT ON COLUMN races.max_players IS 'Bu yarışa katılabilecek azami GERÇEK oyuncu sayısı (brief §6 MAX_PLAYERS). participant_limit''ten (at sayısı) KÜÇÜK ya da eşit olmalıdır; kalan koltuklar AI atlarıyla dolar.';
COMMENT ON COLUMN races.race_type IS 'brief §1 "yarış tipi": paid = giriş ücreti alınır, free = alınmaz. entry_fee ile ÇELİŞEMEZ (races_race_type_matches_fee).';
COMMENT ON COLUMN races.tribune_fee IS 'Tribün giriş ücreti (brief §10). 0 = FREE, >0 = PAID. Ayrı bir tribune_type sütunu yoktur — tip bu değerden türetilir.';
COMMENT ON COLUMN races.spectator_capacity IS 'Azami izleyici sayısı (brief §11). Dolduğunda "TRIBUNE FULL". Kapasiteyi UYGULAYAN akış PHASE 6''dadır.';
