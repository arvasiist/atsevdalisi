-- Yonca/kurdele hediyesi gönderilmişse geri alma REDDEDİLİR (mali kayıt silinmez).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tribune_gifts WHERE gift_key IN ('clover', 'ribbon')) THEN
    RAISE EXCEPTION '0100 geri alınamaz: yonca/kurdele tribün hediyesi kayıtları var';
  END IF;
END $$;
ALTER TABLE tribune_gifts DROP CONSTRAINT tribune_gifts_gift_key_valid;
ALTER TABLE tribune_gifts ADD CONSTRAINT tribune_gifts_gift_key_valid CHECK (gift_key IN (
  'carrot', 'apple', 'evil-eye', 'horseshoe', 'rose-garland', 'trophy'));
