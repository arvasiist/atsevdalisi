-- At ekipmanı (brief §14 PHASE 14 — STABLE, §17 PHASE 17 — ECONOMY;
-- claude/hizli-bitirme-plani.md'nin proje sahibi tarafından
-- önceliklendirdiği "düşük riskli, karar gerektirmeyen" dilim).
--
-- `equipment_type` beş sabit değerle sınırlıdır — `packages/shared-types/
-- src/horse.ts` `EquipmentType` ile BİREBİR aynı tutulmalıdır (bkz. o tipin
-- doc yorumu).
--
-- `quality` diğer kalite alanlarıyla (ör. horses.quality) AYNI NUMERIC(5,2)
-- 0-100 ölçeğini kullanır.
CREATE TABLE horse_equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id        UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  equipment_type  TEXT NOT NULL CHECK (equipment_type IN ('saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps')),
  name            TEXT NOT NULL,
  quality         NUMERIC(5,2) NOT NULL CHECK (quality >= 0 AND quality <= 100),
  equipped        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE horse_equipment IS 'At ekipman envanteri; performans etkisi domain/equipment/performance.ts''te ayrı, küçük bir çarpansal modifikatör olarak hesaplanır (brief §14/§17)';

-- Bir atın kendi ekipman envanterini listelemek/aramak için (docs/API.md
-- §4 GET /horses/{id}/equipment) — `training_sessions`'ın horse_id
-- index'iyle (migration 0009) AYNI gerekçe.
CREATE INDEX idx_horse_equipment_horse_id ON horse_equipment (horse_id);

-- KISMİ (partial) tekil index — `market_listings`'in "bir atın en fazla
-- bir aktif ilanı olabilir" kısıtıyla (migration 0023) AYNI desen: bir at,
-- AYNI ekipman tipinden AYNI ANDA yalnızca BİR tanesini kuşanabilir.
-- Uygulama katmanı (`PostgresHorseEquipmentRepository.equip`) bunu ZATEN
-- kendi transaction'ında (önce eskisini kuşandırma, sonra yeniyi kuşandır)
-- sağlamaya çalışır, ama bu index onu VERİTABANI SEVİYESİNDE de garanti
-- eder — iki eşzamanlı `equip` isteği bu kısıtı asla ihlal edemez.
CREATE UNIQUE INDEX idx_horse_equipment_one_equipped_per_type
  ON horse_equipment (horse_id, equipment_type)
  WHERE equipped = true;
