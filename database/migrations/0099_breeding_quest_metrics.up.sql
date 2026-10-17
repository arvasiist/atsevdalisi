-- 16.10.2026 (brief §18) — çiftleştirme ve tay yetiştirme görevleri.
-- Yeni görev/etkinlik ölçütleri `breedings` (başarılı döllenme, pregnancies.
-- conceived_at) ve `foals_born` (doğum, pregnancies.born_at); sayaç YOK, gebelik
-- satırlarından türetilir. live_events ölçüt kısıtı ADIYLA yeniden yazılır.
ALTER TABLE live_events DROP CONSTRAINT live_events_metric_valid;
ALTER TABLE live_events ADD CONSTRAINT live_events_metric_valid CHECK (metric IN (
  'races_entered', 'race_wins', 'top3_finishes',
  'trainings', 'care_actions', 'horse_purchases', 'friend_gifts_sent',
  'breedings', 'foals_born'));
