-- 09.10.2026 — MASA KURALLARI (sahibinin kararı). Lobi yarışı bir masada
-- (`config/economy.config.json` → `raceTiers[].id`) açılabilir; masa giriş
-- bedelinin ne zaman kesileceğini (katılırken / start anında), ödül
-- dağılımını ve kaybeden iadesini belirler. NULL = masasız (eski kurallar:
-- katılırken kesilir, genel dağılım, iade yok) — mevcut satırlar değişmez.
ALTER TABLE races ADD COLUMN table_id TEXT NULL;
ALTER TABLE races ADD CONSTRAINT races_table_id_valid CHECK (
  table_id IS NULL OR table_id IN ('local', 'regional', 'national', 'elite', 'championship')
);
