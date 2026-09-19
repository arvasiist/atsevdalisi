-- AUDIT_REPORT.md Bulgu R2 (Medium) — "Yalnızca oyuncunun segmenti kalıcı,
-- botların tam alan (full-field) replay'i mümkün değil" (bkz. Fix notu).
--
-- Kök neden: `race_entries.horse_id` GERÇEK bir `horses(id)` satırına
-- FOREIGN KEY'dir (migration 0006) — botlar (`domain/race/bot-generator.ts`
-- `generateBotEntrants`) hiçbir zaman gerçek bir `horses` satırına sahip
-- olmadığından (`horseId` alanları yalnızca "bot-1"/"bot-2" gibi simülasyon
-- içi ETİKETLERDİR, geçerli bir UUID bile değildir), bu FK botların
-- `race_entries`'e YAZILMASINI YAPISAL olarak ENGELLİYORDU. Bu yüzden tam
-- alan replay'i şimdiye kadar yalnızca `simulationSeed` + versiyonlarla
-- YENİDEN SİMÜLE ederek mümkündü, DB'den doğrudan okunamıyordu.
--
-- Çözüm — sahte bir `horses` satırı İCAT ETMEK YERİNE (bu, "botlar gerçek
-- oyuncu/at kaydı DEĞİLDİR" ayrımını bulanıklaştırır ve `findRecentResultsByOwnerId`
-- gibi mevcut, "yalnızca GERÇEK sahiplik" varsayan sorguları kirletirdi):
--   1. `horse_id` NOT NULL kısıtı kaldırılır (bot satırları için NULL olur).
--   2. Yeni `bot_label` sütunu eklenir — bot satırları için `generateBotEntrants`'ın
--      ürettiği ORİJİNAL etiketi (`"bot-1"` vb.) taşır, gerçek at satırları
--      için her zaman NULL'dur.
--   3. CHECK kısıtı: HER satır ya bir GERÇEK ata (`horse_id` dolu) ya da bir
--      BOTA (`bot_label` dolu) aittir — İKİSİ BİRDEN dolu/boş olamaz. Bu,
--      "her satırın tam olarak bir kimliği vardır" garantisini veritabanı
--      seviyesinde SESSİZCE değil, AÇIKÇA zorunlu kılar.
--   4. `(race_id, bot_label)` üzerinde kısmi bir UNIQUE index — aynı yarışta
--      aynı bot etiketinin YANLIŞLIKLA iki kez yazılmasını engeller (`(race_id,
--      horse_id)` üzerindeki mevcut UNIQUE kısıt zaten gerçek atlar için AYNI
--      korumayı sağlıyordu, NULL horse_id'ler o kısıtı hiç TETİKLEMEZ).
--
-- Mevcut sorgular ETKİLENMEZ: `findRecentResultsByOwnerId` (`postgres-race.
-- repository.ts`) `JOIN horses h ON h.id = re.horse_id` kullanıyor — bu bir
-- INNER JOIN olduğundan `horse_id IS NULL` olan bot satırları OTOMATİK
-- olarak dışarıda kalır, sorgu davranışı DEĞİŞMEZ.
ALTER TABLE race_entries
  ALTER COLUMN horse_id DROP NOT NULL;

ALTER TABLE race_entries
  ADD COLUMN bot_label TEXT;

ALTER TABLE race_entries
  ADD CONSTRAINT race_entries_horse_xor_bot_chk
  CHECK ((horse_id IS NOT NULL AND bot_label IS NULL) OR (horse_id IS NULL AND bot_label IS NOT NULL));

CREATE UNIQUE INDEX race_entries_race_bot_label_uq
  ON race_entries (race_id, bot_label)
  WHERE bot_label IS NOT NULL;

COMMENT ON COLUMN race_entries.bot_label IS 'AUDIT_REPORT.md R2 — bot rakibin generateBotEntrants tarafından üretilen orijinal simülasyon-içi etiketi ("bot-1" vb.); GERÇEK bir at satırı için her zaman NULL (bkz. horse_id XOR bot_label CHECK kısıtı)';
