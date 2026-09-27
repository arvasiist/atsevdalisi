-- GERİ ALMA UYARISI (bilinçli): bu down migration, `reference_id`'de UUID
-- OLMAYAN tek bir satır varsa (örn. 'arpa' gibi yem kalemi slug'ları) 22P02
-- ile BAŞARISIZ olur. Bu kasıtlıdır — sessizce veri kaybetmek yerine geri
-- alma durur ve sorunu görünür kılar. Gerçekten geri alınması gerekirse önce
-- o satırların temizlenmesi/taşınması gerekir (bkz. migration 0031 up
-- dosyasındaki gerekçe).

ALTER TABLE economy_transactions
  ALTER COLUMN reference_id TYPE UUID USING reference_id::uuid;

COMMENT ON COLUMN economy_transactions.reference_id IS NULL;
