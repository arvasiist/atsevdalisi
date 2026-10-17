-- Yeni ölçütle açılmış etkinlik varsa geri alma REDDEDİLİR (veri silinmez).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM live_events WHERE metric IN ('breedings', 'foals_born')) THEN
    RAISE EXCEPTION '0099 geri alınamaz: breedings/foals_born ölçütlü etkinlik var';
  END IF;
END $$;
ALTER TABLE live_events DROP CONSTRAINT live_events_metric_valid;
ALTER TABLE live_events ADD CONSTRAINT live_events_metric_valid CHECK (metric IN (
  'races_entered', 'race_wins', 'top3_finishes',
  'trainings', 'care_actions', 'horse_purchases', 'friend_gifts_sent'));
