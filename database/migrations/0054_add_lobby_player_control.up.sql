-- 01.10.2026 — LOBİ YARIŞINDA OYUNCU KONTROLÜ (kırbaç / yön / sakin).
--
-- `player_control`: yarışı açan seçer (turnuva ve takvim için config). FALSE
-- olan yarışın akışı DEĞİŞMEZ (kilit → hemen kesinleşme).
-- TRUE ise kilit anı canlı koşunun başlangıcıdır: `live_starts_at` kilitte
-- yazılır, yarış sunucuda gerçek zamanlı akar ve ANCAK bitince kesinleşir.
-- Her oyuncu yalnızca kendi atına komut verir (`race_entries.player_commands`);
-- bağlantısı kopan oyuncunun atını jokey yapay zekâsı sürer (kopma DB'ye
-- dokunmaz — CLAUDE.md §13.27 kuralı korunur).

ALTER TABLE races
  ADD COLUMN player_control BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN live_starts_at TIMESTAMPTZ NULL;

ALTER TABLE race_entries
  ADD COLUMN player_commands JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN races.player_control IS 'Oyuncu kontrollü canlı yarış (kilitten sonra gerçek zamanlı akar, bitince kesinleşir).';
COMMENT ON COLUMN races.live_starts_at IS 'Kontrollü yarışta kapıların açıldığı an (kilit + geri sayım). Diğer yarışlarda NULL.';
COMMENT ON COLUMN race_entries.player_commands IS 'Oyuncunun segment komutları ({"3": {"whips":2,"laneShift":0,"ease":false}}); kesinleşmede motora girer.';
