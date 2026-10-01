-- 01.10.2026 — ATIN GÖRÜNÜŞÜ (3D sahne "oyuncunun atını" göstersin diye).
-- Değer kümeleri `packages/shared-types/src/horse.ts` HORSE_COAT_COLORS /
-- HORSE_FACE_MARKINGS / HORSE_LEG_MARKINGS ile AYNIDIR (test migration'ı
-- okuyarak karşılaştırır).
--
-- Yeni atlar uygulamada config ağırlıklarıyla üretilir (`domain/horse/
-- appearance.ts`). Mevcut atlar burada kimliklerinin özetinden TEKDÜZE
-- doldurulur — determinist (aynı at hep aynı don) ama config ağırlıklarını
-- izlemez; geçmiş atlar için bilinçli basitlik.
ALTER TABLE horses
  ADD COLUMN coat_color TEXT NOT NULL DEFAULT 'bay'
    CONSTRAINT horses_coat_color_valid CHECK (coat_color IN ('bay', 'dark_bay', 'chestnut', 'black', 'grey', 'palomino')),
  ADD COLUMN face_marking TEXT NOT NULL DEFAULT 'none'
    CONSTRAINT horses_face_marking_valid CHECK (face_marking IN ('none', 'star', 'stripe', 'blaze', 'snip')),
  ADD COLUMN leg_marking TEXT NOT NULL DEFAULT 'none'
    CONSTRAINT horses_leg_marking_valid CHECK (leg_marking IN ('none', 'socks', 'stockings'));

UPDATE horses SET
  coat_color   = (ARRAY['bay', 'dark_bay', 'chestnut', 'black', 'grey', 'palomino'])[1 + ((hashtext(id::text || ':coat')::bigint % 6 + 6) % 6)::int],
  face_marking = (ARRAY['none', 'star', 'stripe', 'blaze', 'snip'])[1 + ((hashtext(id::text || ':face')::bigint % 5 + 5) % 5)::int],
  leg_marking  = (ARRAY['none', 'socks', 'stockings'])[1 + ((hashtext(id::text || ':leg')::bigint % 3 + 3) % 3)::int];

-- Varsayılanlar KALIR: test fikstürleri ve dev seed `horses`a doğrudan SQL
-- ile yazar. Uygulamanın iki INSERT yolu (başlangıç atı, tay) görünüşü
-- AÇIKÇA yazar; `appearance.e2e-spec.ts` yeni atların config'ten geldiğini
-- (hep 'bay/none/none' olmadığını) iddia eder.
