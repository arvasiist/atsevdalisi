-- Arkadaşlık + doğrudan mesajlaşma (proje sahibinin açık talebi, 27.09.2026).
--
-- GEREKÇE: oyun şu ana kadar TAMAMEN tek-kişilikti — bir oyuncunun diğerini
-- ADIYLA tanımasının (sıralama tablosu dışında) hiçbir yolu yoktu ve
-- oyuncular arası hiçbir doğrudan iletişim kanalı yoktu. Bu iki tablo o
-- boşluğu kapatır ve BİR SONRAKİ dilimin (hediye gönderimi) ön koşuludur:
-- hediye yalnızca ARKADAŞA gönderilebilir, yani "arkadaş" kavramının
-- veritabanında gerçek bir karşılığı olmalıdır.
--
-- NEDEN İKİ TABLO (neden tek "social" tablosu değil): arkadaşlık bir
-- DURUM makinesidir (pending/accepted/rejected) ve ÇİFT başına TEK satırdır;
-- mesaj ise bir OLAY akışıdır (sınırsız satır, zaman damgası, okundu
-- bilgisi). İkisini aynı tabloya sıkıştırmak, mesaj satırlarının
-- arkadaşlık durumunu tekrar tekrar taşımasına yol açardı.

-- ============================================================
-- friendships
-- ============================================================
--
-- **KANONİK ÇİFT SAKLANIR (`player_low_id` < `player_high_id`).** Bu,
-- tasarımın en kritik kararıdır ve bir hatayı YAPISAL OLARAK imkânsız
-- kılar: A→B ile B→A iki AYRI satır olsaydı, `UNIQUE (requester_id,
-- addressee_id)` kısıtı bunların İKİSİNİ de kabul ederdi — yani iki oyuncu
-- birbirine AYNI ANDA istek gönderdiğinde "iki taraflı bekleyen istek"
-- durumu doğar ve "arkadaş mıyız" sorusunun tek bir cevabı kalmazdı.
-- Kanonik sıralama + UNIQUE ile bu durum imkânsızdır: ikinci istek ya
-- mevcut satıra çarpar (23505) ya da mevcut satır kabul edilir.
--
-- `requested_by_id` isteği KİMİN başlattığını ayrıca tutar (low/high
-- sırasından BAĞIMSIZ) — "gelen istekler" ile "giden istekler" listesi
-- yalnızca bu alanla ayrılır; onsuz, isteği kimin başlattığı bilgisi
-- kanonik sıralamada KAYBOLURDU.
CREATE TABLE friendships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_low_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_high_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  requested_by_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- İsteğe cevap verildiği an (`accept`/`reject`) — `pending` iken NULL.
  -- Ayrı bir sütun: `status`'tan türetilemez (kabul ve red aynı anda
  -- olabilir, ama ZAMANI farklıdır ve "ne zaman" sorusu denetim için
  -- gereklidir).
  responded_at    TIMESTAMPTZ,

  -- Kendine arkadaşlık isteği gönderilemez. Bu kontrol DOMAIN katmanında da
  -- vardır (`assertNotSelf`) ama burada DB seviyesinde de durur: domain
  -- kontrolü atlanırsa (yeni bir çağıran eklenirse) veri bozulmaz.
  CONSTRAINT friendships_not_self CHECK (player_low_id <> player_high_id),
  -- Kanonik sıralamanın KENDİSİ kısıt olarak yazılır — böylece uygulama
  -- kodu yanlış sırada yazsa bile (ör. yeni bir repository metodu) INSERT
  -- reddedilir, sessizce İKİNCİ bir "ters" satır oluşmaz.
  CONSTRAINT friendships_low_lt_high CHECK (player_low_id < player_high_id),
  -- İsteği başlatan, çiftin TARAFLARINDAN biri olmalıdır (üçüncü bir
  -- oyuncu olamaz).
  CONSTRAINT friendships_requester_is_party CHECK (requested_by_id IN (player_low_id, player_high_id)),
  CONSTRAINT friendships_unique_pair UNIQUE (player_low_id, player_high_id)
);

COMMENT ON TABLE friendships IS 'Oyuncular arası arkadaşlık (proje sahibinin talebi, 27.09.2026). Çift başına TEK satır — kanonik sıralama (low < high) sayesinde A→B ile B→A aynı satırdır.';
COMMENT ON COLUMN friendships.requested_by_id IS 'İsteği BAŞLATAN taraf — "gelen" ve "giden" istek listelerini ayıran tek alan.';
COMMENT ON COLUMN friendships.status IS 'pending (yanıt bekliyor) | accepted (arkadaşız) | rejected (reddedildi; tekrar istek gönderilebilir — bkz. SendFriendRequestUseCase).';

-- "Benim arkadaşlarım" / "bana gelen istekler" sorguları iki yönde de
-- çalışır (kanonik sıralama hangi taraf olduğumu ÖNCEDEN bilmeyi imkânsız
-- kılar) — bu yüzden HER İKİ sütun için de index gerekir. Tek bir bileşik
-- index (low, high) yalnızca low tarafını hızlandırırdı.
CREATE INDEX idx_friendships_low ON friendships (player_low_id, status);
CREATE INDEX idx_friendships_high ON friendships (player_high_id, status);

-- ============================================================
-- direct_messages
-- ============================================================
--
-- Mesajlaşma ARKADAŞLIK ŞARTINA bağlıdır (uygulama katmanında zorlanır:
-- `SendMessageUseCase` → `NotFriendsError`). Bu kural BİLİNÇLİ olarak DB
-- kısıtı DEĞİLDİR: arkadaşlık kaldırıldığında geçmiş mesajlar SİLİNMEMELİDİR
-- (kullanıcı geçmişini kaybetmez, yalnızca YENİ mesaj gönderemez).
CREATE TABLE direct_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Üst sınır BURADA da vardır (`config/social.config.json →
  -- maxMessageLength` ile AYNI değer, 500): domain kontrolü asıl kapıdır,
  -- bu CHECK ise başka bir çağıran (ör. gelecekte bir yönetim aracı)
  -- domain'i atlarsa veritabanının sessizce sınırsız metin kabul etmesini
  -- engeller. `char_length` BİLİNÇLİDİR: `length()` byte değil KARAKTER
  -- sayar ve Türkçe karakterler (ş, ğ, İ) UTF-8'de 2 byte olsa da
  -- kullanıcı için 1 karakterdir.
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Okundu bilgisi: NULL = okunmadı. Ayrı bir `is_read` boolean'ı yerine
  -- ZAMAN damgası — "ne zaman okundu" denetim için gereklidir ve
  -- `read_at IS NOT NULL` ile boolean'a bedavaya çevrilir.
  read_at      TIMESTAMPTZ,

  CONSTRAINT direct_messages_not_self CHECK (sender_id <> recipient_id)
);

COMMENT ON TABLE direct_messages IS 'Oyuncular arası doğrudan mesaj (proje sahibinin talebi, 27.09.2026). Gönderim ARKADAŞLIK şartına bağlıdır (uygulama katmanında); arkadaşlık kaldırılırsa geçmiş mesajlar KORUNUR.';
COMMENT ON COLUMN direct_messages.read_at IS 'NULL = okunmadı. Zaman damgası tercih edildi (boolean yerine) — "ne zaman okundu" denetlenebilir olsun diye.';

-- Sohbet ekranı: iki oyuncu arasındaki mesajlar, yeniden eskiye. İki yönü
-- de kapsayan TEK bir index kurulamaz (sender/recipient simetrik DEĞİL —
-- mesajın YÖNÜ vardır), bu yüzden sohbet sorgusu `(sender_id = a AND
-- recipient_id = b) OR (sender_id = b AND recipient_id = a)` biçimindedir
-- ve iki index'i de kullanır.
CREATE INDEX idx_direct_messages_sender ON direct_messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_direct_messages_recipient ON direct_messages (recipient_id, created_at DESC);
-- Okunmamış sayacı (`GET /players/:id/social` → `unreadMessageCount`) için.
CREATE INDEX idx_direct_messages_unread ON direct_messages (recipient_id) WHERE read_at IS NULL;
