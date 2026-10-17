-- 17.10.2026 (brief §17 "At sahibi gelen hediyeleri toplu alabilsin") — tribün
-- hediyesinde at sahibinin payı artık gönderimde ÖDENMEZ; hediye kutusunda
-- bekler ve sahibi topladığında tek defter satırıyla (`tribune_gift_credit`,
-- referans = toplama kimliği) hesabına geçer. Gönderenin ödemesi değişmedi.
-- Yalnızca ekleme: 0101 öncesi satırların payı gönderimde ödenmişti → toplanmış
-- sayılır (`collected_at = created_at`, `collect_id` NULL — o satırların
-- defteri hediye kimliğine bağlıdır). Hiçbir satır silinmez (mali kayıt).
ALTER TABLE tribune_gifts ADD COLUMN collected_at TIMESTAMPTZ;
ALTER TABLE tribune_gifts ADD COLUMN collect_id UUID;
UPDATE tribune_gifts SET collected_at = created_at WHERE collected_at IS NULL;
ALTER TABLE tribune_gifts ADD CONSTRAINT tribune_gifts_collect_id_requires_collected
  CHECK (collect_id IS NULL OR collected_at IS NOT NULL);

CREATE INDEX idx_tribune_gifts_uncollected ON tribune_gifts (recipient_id, created_at) WHERE collected_at IS NULL;
CREATE INDEX idx_tribune_gifts_recipient ON tribune_gifts (recipient_id, created_at DESC);

COMMENT ON COLUMN tribune_gifts.collected_at IS 'Sahibin payı topladığı an (NULL = hediye kutusunda bekliyor). 0101 öncesi satırlar gönderim anıyla doldu.';
COMMENT ON COLUMN tribune_gifts.collect_id IS 'Toplama işlemi kimliği = defter satırının reference_id''si (0101 öncesi satırlarda NULL).';
