-- ⚠️ Geri alma, kutuda bekleyen (toplanmamış) payları kaybettirir: o satırlar
-- için gönderen ödemiş, sahibe kredi yazılmamıştır.
DROP INDEX IF EXISTS idx_tribune_gifts_recipient;
DROP INDEX IF EXISTS idx_tribune_gifts_uncollected;
ALTER TABLE tribune_gifts DROP CONSTRAINT IF EXISTS tribune_gifts_collect_id_requires_collected;
ALTER TABLE tribune_gifts DROP COLUMN IF EXISTS collect_id;
ALTER TABLE tribune_gifts DROP COLUMN IF EXISTS collected_at;
