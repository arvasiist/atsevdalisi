-- 01.10.2026 — YARIŞ TAKVİMİ.
--
-- Sunucu, `config/race-lobby.config.json` → `calendar.programs` tanımına
-- göre lobi yarışlarını önceden açar. Yarışın kendisi sıradan bir lobi
-- yarışıdır (`races`, `created_by` NULL); bu tablo yalnızca "bu yarış hangi
-- programın hangi yuvası" bilgisini taşır.
--
-- BİRİNCİL ANAHTAR (program_id, start_time) = TEKRAR KORUMASI: iki sunucu
-- örneği ya da yeniden başlatma aynı yuvayı ikinci kez açamaz.
-- DURUM SÜTUNU YOK — durum bağlı yarıştan türetilir (turnuva ile aynı ilke).

CREATE TABLE race_calendar_slots (
  program_id  TEXT NOT NULL CHECK (program_id ~ '^[a-z0-9-]{1,40}$'),
  start_time  TIMESTAMPTZ NOT NULL,
  race_id     UUID NOT NULL UNIQUE REFERENCES races(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, start_time)
);

COMMENT ON TABLE race_calendar_slots IS 'Yarış takvimi yuvası → sunucunun açtığı lobi yarışı. Durum bağlı yarıştan türetilir.';
