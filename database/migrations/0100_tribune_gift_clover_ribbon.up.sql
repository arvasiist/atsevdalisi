-- 16.10.2026 (brief §17) — tribün hediyesi kataloğuna dört yapraklı yonca ve
-- kurdele. Anahtar listesi config (grandstand.tribuneGifts.items) ile BİREBİR;
-- kısıt ADIYLA yeniden yazılır. Mevcut satırlar değişmez.
ALTER TABLE tribune_gifts DROP CONSTRAINT tribune_gifts_gift_key_valid;
ALTER TABLE tribune_gifts ADD CONSTRAINT tribune_gifts_gift_key_valid CHECK (gift_key IN (
  'carrot', 'clover', 'apple', 'evil-eye', 'ribbon', 'horseshoe', 'rose-garland', 'trophy'));
