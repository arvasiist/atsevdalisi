-- 0097 — AHIR BÖLMELERİ (16.10.2026, sahibinin isteği: "seviye yükseldikçe
-- yandaki boşluklara at alabilsin, ahır düzenlenebilsin").
--
-- `horses.stall_number`: atın sahibinin ahırındaki bölmesi (1..kapasite).
-- NULL = henüz yerleştirilmemiş — sunucu en düşük boş bölmeye yerleştirir
-- (`domain/stable/layout.ts` → `resolveStableLayout`, kayıt sırasına göre).
-- Mevcut atlara DOKUNULMAZ (hepsi NULL kalır → türetilmiş yerleşim); oyuncu
-- ilk kez taşıma yapınca yerleşim kalıcılaşır.
ALTER TABLE horses ADD COLUMN stall_number SMALLINT CHECK (stall_number IS NULL OR stall_number >= 1);

-- Bir sahibin iki atı aynı bölmede olamaz (eşzamanlı iki taşıma bile).
CREATE UNIQUE INDEX horses_owner_stall_uq ON horses (owner_id, stall_number) WHERE stall_number IS NOT NULL;

-- At el değiştirince (pazar, müzayede, başka her yol) bölmesi BOŞALIR —
-- yeni sahibin ahırında eski numara çakışırdı. Tetikleyici her yolu kapsar;
-- yeni bir sahiplik yolu yazan bunu unutamaz.
CREATE OR REPLACE FUNCTION horses_clear_stall_on_owner_change() RETURNS trigger AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    NEW.stall_number := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_horses_clear_stall_on_owner_change BEFORE UPDATE OF owner_id ON horses
  FOR EACH ROW EXECUTE FUNCTION horses_clear_stall_on_owner_change();

COMMENT ON COLUMN horses.stall_number IS
  'Sahibin ahırındaki bölme (1..kapasite). NULL = sunucu en düşük boş bölmeye yerleştirir. Sahip değişince tetikleyici NULL yapar.';
