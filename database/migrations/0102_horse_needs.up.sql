-- 17.10.2026 (brief §14 "Beslenme ve su ihtiyacı") — atın yem ve su ihtiyacı
-- SAYAÇ TUTULMADAN son beslenme (`horse_feed_log`) ve son su bakımından
-- (`horse_care_log`, 'water') TÜRETİLİR. Bu sütun yalnızca ölçümün başlangıç
-- çıpasıdır: hiç beslenmemiş at "aç" sayılmasın diye ihtiyaç bu andan ölçülür.
-- Mevcut atlar migration anını alır (yürürlük anında hepsi tok başlar, kimse
-- habersiz cezalanmaz); yeni at oluşturulduğu anı alır. Yalnızca ekleme.
ALTER TABLE horses ADD COLUMN needs_anchor_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN horses.needs_anchor_at IS 'Yem/su ihtiyacının ölçüldüğü başlangıç anı (0102). İhtiyaç = son beslenme/su ile bu andan geç olanı.';

-- Son beslenme anı at başına sık okunur (ahır listesi, antrenman).
CREATE INDEX idx_horse_feed_log_horse_fed_at ON horse_feed_log (horse_id, fed_at DESC);
