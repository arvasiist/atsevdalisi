-- FAZ 1'de domain/stable zaten `stableLevel`'i bir PARAMETRE olarak
-- kabul ediyordu (bkz. `getStableCapacity`), ancak hiçbir migration bunu
-- kalıcı bir sütuna bağlamamıştı — bu, FAZ 2'nin ahır yükseltme özelliği
-- (brief §32 "Upgrade örneği") için burada tamamlanan bir FAZ 1 eksiğidir.
-- Her oyuncunun tek bir ahırı vardır (ayrı bir `stables` tablosu yoktur,
-- `horses.owner_id` doğrudan `players`e bağlanır) — bu yüzden seviye
-- doğrudan `players` üzerinde tutulur.
ALTER TABLE players ADD COLUMN stable_level INTEGER NOT NULL DEFAULT 1 CHECK (stable_level >= 1);

-- Personel tablosu (brief §33 Personel Sistemi). `jockey` rolü buraya
-- DAHİL DEĞİLDİR — jokeyler zaten kendi zengin tablosuna sahiptir
-- (bkz. 0004_create_jockeys). owner_id NULL = piyasadaki kiralanmamış aday.
CREATE TABLE staff (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role                TEXT NOT NULL CHECK (role IN ('trainer', 'vet', 'farrier', 'groom', 'geneticist', 'scout', 'farm_manager')),
  name                TEXT NOT NULL,
  skill               NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (skill BETWEEN 0 AND 100),
  experience          INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
  salary              BIGINT NOT NULL DEFAULT 0 CHECK (salary >= 0),
  specialization      TEXT,
  morale              NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (morale BETWEEN 0 AND 100),
  contract_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = süresiz sözleşme (brief §33 "contract" alanı).
  contract_duration_months INTEGER CHECK (contract_duration_months IS NULL OR contract_duration_months > 0),
  owner_id            UUID REFERENCES players(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE staff IS 'Personel Sistemi (brief §33), jokey hariç — bkz. domain/staff/README.md';

CREATE INDEX idx_staff_owner_id ON staff(owner_id);

CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
