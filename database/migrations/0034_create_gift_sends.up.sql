-- Hediye gönderimi (proje sahibinin açık talebi, 27.09.2026 — üç parçanın
-- ÜÇÜNCÜSÜ: "tribün, arkadaşlık + mesajlaşma, hediye gönderimi").
--
-- GEREKÇE: oyuncular arasında ÇİP/ELMAS transferinin ilk yoludur. Bu tablo
-- olmadan oyuncular arası para akışı YALNIZCA At Pazarı üzerinden (at satarak)
-- mümkündü — yani bir oyuncunun arkadaşına doğrudan "borç vermesi" ya da
-- ödüllendirmesi imkânsızdı.
--
-- **ÖN KOŞUL ARKADAŞLIKTIR** (`migration 0033`). Bu kural BİLİNÇLİ olarak
-- veritabanı kısıtı DEĞİLDİR: arkadaşlık tablosu bir DURUM makinesidir ve
-- gönderim anındaki duruma bakar; iki tablo arasında bir FK kurmak "arkadaşlık
-- silinince hediye kaydı da silinsin" gibi yanlış bir sonuç üretirdi
-- (hediye GEÇMİŞTİR, silinmemelidir). Kural `SendGiftUseCase`'te zorlanır ve
-- ikinci hat olarak gönderim transaction'ının İÇİNDE yeniden doğrulanır.
--
-- **BU BİR TRANSFERDİR, SINK DEĞİL.** Tribün biletinden (migration 0032) temel
-- farkı budur: bilet geliri kimseye geçmez (sink), hediyede ise düşülen tutar
-- ALICIYA eklenir. `economy_transactions`'a her gönderim için İKİ satır yazılır
-- (`gift_send_debit` NEGATİF, `gift_send_credit` POZİTİF, AYNI `reference_id`
-- ile eşleştirilebilir) — bkz. migration 0019'un "çift-kayıt" notu.
CREATE TABLE gift_sends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- `economy_transactions.currency` ile AYNI liste (`CHECK (currency IN
  -- ('money','gems'))`, migration 0019) — iki tablonun ayrışmaması
  -- `apps/api/test/database/economy-currency.spec.ts` ile korunur.
  currency     TEXT NOT NULL CHECK (currency IN ('money', 'gems')),
  -- `amount > 0`: yön ZATEN `sender_id`/`recipient_id` ile bellidir, bu yüzden
  -- miktar İŞARETSİZDİR (ledger satırlarının aksine). Sıfır/negatif bir hediye
  -- muhasebede anlamsızdır; üst sınır `config/gift.config.json →
  -- maxAmount`'ta yaşar ve BİLİNÇLİ olarak burada tekrarlanmaz (o bir oyun
  -- dengesi değeridir, veri bütünlüğü kuralı değil — bilet fiyatı ile AYNI
  -- gerekçe).
  amount       BIGINT NOT NULL CHECK (amount > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Kendine hediye gönderilemez. Domain kontrolü (`assertNotSelfGift`) asıl
  -- kapıdır; bu CHECK, domain'i atlayan yeni bir çağıran eklenirse verinin
  -- bozulmasını engeller (`friendships_not_self` ile AYNI desen).
  CONSTRAINT gift_sends_not_self CHECK (sender_id <> recipient_id)
);

COMMENT ON TABLE gift_sends IS 'Oyuncular arası Çip/Elmas hediyesi (proje sahibinin talebi, 27.09.2026). TRANSFER''dir (para yok olmaz) — her satır `economy_transactions`''ta İKİ kayıt üretir. Ön koşul: kabul edilmiş arkadaşlık.';
COMMENT ON COLUMN gift_sends.amount IS 'İŞARETSİZ miktar (yön sender/recipient ile bellidir). Üst sınır config''tedir, DB''de tekrarlanmaz.';

-- GÜNLÜK LİMİT sorgusu: "bu gönderen kayan pencerede kaç hediye gönderdi"
-- (`config/gift.config.json → dailyLimit` + `dailyWindowHours`,
-- `DAILY_GIFT_LIMIT_REACHED`). Pencere UZUNLUĞU burada SABİTLENMEZ —
-- sorgu `created_at >= now() - ($2::int * interval '1 hour')` biçimindedir
-- ve `$2` config'ten gelir (gömülü bir `interval '24 hours'` sihirli sayı
-- olurdu). `sender_id` önce gelir çünkü sorgu HER ZAMAN tek bir gönderene
-- göredir.
CREATE INDEX idx_gift_sends_sender ON gift_sends (sender_id, created_at DESC);
-- "Bana gelen hediyeler" listesi.
CREATE INDEX idx_gift_sends_recipient ON gift_sends (recipient_id, created_at DESC);
