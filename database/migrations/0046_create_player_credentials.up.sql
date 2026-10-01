-- 30.09.2026 — E-POSTA + ŞİFRE GİRİŞİ (proje sahibinin talebi).
--
-- SORUN: hesaplar yalnızca tarayıcıda (localStorage'daki JWT) yaşıyordu.
-- Tarayıcı verisi silinince, başka cihaza geçilince ya da 30 günlük token
-- süresi dolunca oyuncu hesabını — atlarını ve parasını — KALICI olarak
-- kaybediyordu. Google/Apple girişi kimlik bilgisi beklediği için
-- kullanılamıyordu.
--
-- ÇÖZÜM: misafir oyuncu bir e-posta + şifre bağlar ("Hesabını kaydet");
-- sonra herhangi bir cihazdan giriş yapar. Oyuncu satırı DEĞİŞMEZ — atlar,
-- para ve geçmiş aynı `player_id`de kalır.
--
-- ŞİFRE DÜZ METİN TUTULMAZ: `password_hash` scrypt çıktısıdır ve kendi
-- parametrelerini + tuzunu taşır (`scrypt$N$r$p$tuz$özet`), yani config'teki
-- maliyet sonradan artırılsa bile eski özetler doğrulanabilir kalır.
--
-- E-POSTA KÜÇÜK HARFE NORMALLEŞTİRİLİR (uygulamada); tekillik yine de
-- `lower(email)` üzerindeki indeksle VERİTABANINDA zorlanır — eşzamanlı iki
-- kayıt ön kontrolü birlikte geçse bile ikincisi indekse takılır.

CREATE TABLE player_credentials (
  player_id      UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  email          TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX player_credentials_email_uq ON player_credentials (lower(email));

COMMENT ON TABLE player_credentials IS 'E-posta + şifre girişi (30.09.2026). Oyuncu başına en fazla bir satır (PK). password_hash scrypt özetidir, parametreleri ve tuzu içinde taşır; düz şifre ASLA saklanmaz.';
