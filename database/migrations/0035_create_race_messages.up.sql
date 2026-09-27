-- Yarış sohbeti (brief §13 "Race Chat", proje sahibinin açık talebi, 27.09.2026).
--
-- GEREKÇE: canlı yarış izleyicisi (katılımcı VEYA tribün bileti sahibi)
-- şu ana kadar yarışı yalnızca İZLEYEBİLİYORDU — aynı yarışı izleyen iki
-- oyuncunun birbiriyle konuşmasının hiçbir yolu yoktu. Brief §13 bu kanalı
-- açıkça ister ("Chat WebSocket üzerinden gerçek zamanlı çalışmalı").
--
-- NEDEN `direct_messages` YENİDEN KULLANILMADI (brief §29: "mevcut
-- entity'leri gereksiz yere yeniden oluşturma"): `direct_messages` bir
-- ÇİFT (sender→recipient) ekseninde tanımlıdır ve gönderim ARKADAŞLIK
-- şartına bağlıdır (`NotFriendsError`). Yarış sohbeti ise bir ODA
-- (race_id) eksenindedir: alıcı DİNAMİKTİR (yarışı o an izleyen herkes),
-- arkadaşlık şartı YOKTUR ve geçmiş yarışla birlikte ANLAMINI yitirir.
-- İkisini tek tabloya sıkıştırmak, her satırın "alıcısı olmayan" özel bir
-- hâlini taşımasına yol açardı — bu yüzden ayrı tablo DOĞRU olan.

CREATE TABLE race_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Yarış silinirse sohbeti de gider (ON DELETE CASCADE): bu satırlar
  -- yarışın DIŞINDA hiçbir anlam taşımaz — `direct_messages`'ın aksine
  -- ("arkadaşlık bitse de geçmiş korunur", bkz. migration 0033 notu)
  -- burada korunacak bir kişisel geçmiş YOKTUR.
  race_id    UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  -- Oyuncu silinirse mesajları da gider. `player_id` sunucunun KENDİ
  -- kimlik doğrulamasından gelir (gateway `handshake.auth.token` →
  -- `client.data.playerId`) — istemci gövdesinden ASLA okunmaz
  -- (CLAUDE.md "SUNUCU OTORİTESİ").
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Üst sınır `config/chat.config.json → maxMessageLength` ile AYNI değer
  -- (300). Domain kontrolü asıl kapıdır (`normalizeMessageBody`); bu CHECK
  -- başka bir çağıran domain'i atlarsa veritabanının sessizce sınırsız
  -- metin kabul etmesini engeller — `direct_messages.body` ile AYNI
  -- gerekçe (bkz. migration 0033). `char_length` BİLİNÇLİDİR: byte değil
  -- KARAKTER sayar (ş, ğ, İ UTF-8'de 2 byte ama kullanıcı için 1 karakter).
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE race_messages IS 'Yarış odası sohbeti (brief §13). Alıcı DİNAMİKTİR: mesaj, o an yarışı izleyen herkese yayınlanır — satır başına bir alıcı YOKTUR.';
COMMENT ON COLUMN race_messages.player_id IS 'Gönderen. SUNUCUNUN doğruladığı oturumdan gelir (client.data.playerId) — istemci gövdesinden okunmaz.';

-- Sohbet geçmişi sorgusu: bir yarışın son N mesajı. `DESC` bilinçlidir —
-- "son N" istenir, "ilk N" değil (bkz. `PostgresChatRepository.findRecent`
-- sorgusundaki iç/dış SELECT ters çevirmesi).
CREATE INDEX idx_race_messages_race ON race_messages (race_id, created_at DESC);
