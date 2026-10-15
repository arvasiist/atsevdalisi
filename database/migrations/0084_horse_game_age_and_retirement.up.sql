-- 15.10.2026 — S5 (docs/OYUN_DONGUSU_DENETIMI.md B7/B11), sahibinin kararı:
-- oyun yaşı hızlı akar (config/horse-growth.config.json → gameMonthsPerRealDay,
-- 1 gerçek gün = 1 oyun ayı).
--
-- aging_started_at: hızlı yaşlanmanın başladığı an. Yaş = o andaki takvim yaşı
-- (birth_date'ten) + o andan beri geçen gün × ölçek (domain/horse/age-curve.ts
-- → computeHorseAgeMonths). Mevcut satırlar migration anını alır → bugünkü
-- yaşlarını KORURLAR; birth_date'e DOKUNULMAZ. Yeni atta oluşturulma anıdır.
ALTER TABLE horses ADD COLUMN aging_started_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- retired_at: emeklilik anı (POST /horses/:id/retire). Emeklilik GERİ ALINMAZ;
-- damızlık için iki ebeveynin de emekli olması şarttır. Kısıt tek yönlüdür:
-- emeklilik anı yazılmış at başka bir duruma DÖNEMEZ (ör. bir yol emekli atı
-- yanlışlıkla 'active' yazarsa veritabanı reddeder). Eski elle yazılmış
-- 'retired' satırları (retired_at NULL) geçerli kalır — tahmini tarih yazılmaz.
ALTER TABLE horses ADD COLUMN retired_at TIMESTAMPTZ;
ALTER TABLE horses ADD CONSTRAINT horses_retired_at_requires_status
  CHECK (retired_at IS NULL OR status = 'retired');

-- Damızlık pazarı (GET /breeding/studs) emekli aygırları kaliteye göre tarar.
CREATE INDEX horses_retired_stallions_idx ON horses (quality DESC, id)
  WHERE status = 'retired' AND gender = 'stallion';
