-- BLOCK / REPORT — sosyal moderasyon (brief §33, §42 PHASE 15).
--
-- GEREKÇE: bugüne kadar bir oyuncunun İSTEMEDİĞİ teması kesmesinin TEK
-- yolu arkadaşlıktan çıkmaktı ve o da yalnızca mesaj yolunu kapatıyordu.
-- Hediye ve yarış daveti ARKADAŞLIK gerektirdiği için dolaylı olarak
-- kapanıyordu; ama "arkadaş kalıp rahatsız edilme" durumunun karşılığı
-- YOKTU — ve brief §33 tam olarak bunu ister: "Blocklanan kullanıcı:
-- mesaj gönderemez, gift gönderemez, race invite gönderemez."
--
-- **İKİ TABLO, İKİ AYRI AMAÇ.** `player_blocks` bir DURUM'dur (kaldırılana
-- kadar yürürlükte) ve yazma yollarını KAPATIR; `player_reports` bir
-- OLAY kaydıdır (bir kez yazılır, değişmez) ve yalnızca moderasyon
-- kuyruğunu besler. İkisini tek tabloda birleştirmek, "engelledim" ile
-- "şikâyet ettim" arasındaki farkı (biri geri alınabilir, diğeri bir
-- İHBAR kaydıdır) silerdi.
--
-- **ENGELLEME ARKADAŞLIĞI SİLMEZ.** Arkadaşlık ayrı bir tablodur
-- (migration 0033) ve burada ona DOKUNULMAZ: engelleme EK bir kapıdır,
-- mevcut ilişkinin yerine geçmez. Aksi hâlde engeli kaldıran oyuncu
-- arkadaşlığını da kaybetmiş bulurdu — geri alınamayan bir yan etki.
-- Aynı gerekçeyle mesaj GEÇMİŞİ de silinmez (`RemoveFriendUseCase` ile
-- AYNI ilke: geçmiş korunur, yalnızca YENİ yazma engellenir).
CREATE TABLE player_blocks (
  -- KANONİK ÇİFT YOKTUR — `friendships`in (migration 0033) AKSİNE.
  -- Arkadaşlık SİMETRİKTİR (iki taraf da aynı şeyi kabul eder), engelleme
  -- ise YÖNLÜDÜR: A'nın B'yi engellemesi, B'nin A'yı engellemesi demek
  -- DEĞİLDİR. Bu yüzden birincil anahtar (blocker, blocked) İKİLİSİDİR ve
  -- sıra anlamlıdır.
  blocker_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (blocker_id, blocked_id),

  -- Kendini engellemek anlamsızdır; domain kontrolü (`assertNotSelfBlock`)
  -- asıl kapıdır, bu CHECK onu atlayan bir çağırana karşı son savunmadır
  -- (`friendships_not_self` / `gift_sends_not_self` ile AYNI desen).
  CONSTRAINT player_blocks_not_self CHECK (blocker_id <> blocked_id)
);

COMMENT ON TABLE player_blocks IS 'Yönlü oyuncu engelleme (brief §33). Arkadaşlığı SİLMEZ, mesaj/hediye/davet/arkadaşlık isteği yollarını KAPATIR. Kanonik çift YOKTUR — engelleme simetrik değildir.';
COMMENT ON COLUMN player_blocks.created_at IS 'Engelin konduğu an. Engelin KALDIRILMASI satırı siler (geçmiş tutulmaz — bu bir DURUM tablosudur, denetim kaydı değil).';

-- ⚠️ `blocked_id` İNDEKSİ ŞARTTIR, süs değildir: yazma yollarının sorduğu
-- soru "A, B'yi engelledi mi" DEĞİL, "bu İKİ oyuncu arasında HERHANGİ bir
-- yönde engel var mı"dır (`isBlockedBetween`) — yani sorgu hem
-- `blocker_id` hem `blocked_id` üzerinden süzülür. Birincil anahtar
-- yalnızca birinciyi karşılar; bu indeks olmadan ters yön her seferinde
-- tam tablo taraması olurdu.
CREATE INDEX idx_player_blocks_blocked ON player_blocks (blocked_id);

-- ŞİKÂYET KAYDI. Bu tablo bir KUYRUK'tur: `status` sütunu brief §34'ün
-- yönetim panelinin ("Reports / Chat Reports") okuyacağı alandır.
CREATE TABLE player_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- `domain/social/moderation.ts` → `REPORT_CATEGORIES` ile BİREBİR aynı
  -- küme. `race_entries.tactical_style` (migration 0006) ile AYNI disiplin:
  -- domain DB kısıtını YANSITIR, tersi değil — kategori listesi burada
  -- GENİŞLERSE domain'de de genişlemek zorundadır, yoksa `23514` ile 500
  -- dönerdi.
  category    TEXT NOT NULL CHECK (category IN (
                'spam', 'harassment', 'cheating', 'offensive_name', 'other'
              )),
  -- Serbest metin, İSTEĞE BAĞLI. Uzunluk sınırı BURADA TEKRARLANMAZ:
  -- `config/social.config.json → reportReasonMaxLength` bir ÜRÜN kararıdır
  -- ve `domain/social/moderation.ts` içinde `normalizeReportReason` ile
  -- uygulanır (hediye üst sınırı ile AYNI gerekçe — migration 0034 notu).
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                'open', 'reviewing', 'resolved', 'dismissed'
              )),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT player_reports_not_self CHECK (reporter_id <> reported_id)
);

COMMENT ON TABLE player_reports IS 'Oyuncu şikâyeti (brief §33). Bir OLAY kaydıdır — engellemenin aksine geri alınmaz. `status` brief §34 yönetim panelinin kuyruğudur.';
COMMENT ON COLUMN player_reports.category IS 'domain/social/moderation.ts REPORT_CATEGORIES ile birebir. DB kısıtı domain listesini YANSITIR, tersi değil.';
COMMENT ON COLUMN player_reports.status IS 'Moderasyon kuyruğu durumu (brief §34). Şu an yalnızca ''open'' yazılır; geçişler yönetim paneli diliminde gelecek.';

-- "Bu oyuncu hakkındaki şikâyetler" — yönetim panelinin (brief §34)
-- birincil sorgusu ve gelecekteki "tekrarlayan şikâyet" tespitinin temeli.
CREATE INDEX idx_player_reports_reported ON player_reports (reported_id, created_at DESC);
-- Kuyruk görünümü: açık şikâyetler en yeniden eskiye.
CREATE INDEX idx_player_reports_status ON player_reports (status, created_at DESC);
