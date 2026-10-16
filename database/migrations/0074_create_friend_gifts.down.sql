ALTER TABLE live_events DROP CONSTRAINT live_events_metric_valid;
ALTER TABLE live_events ADD CONSTRAINT live_events_metric_check CHECK (metric IN (
  'races_entered', 'race_wins', 'top3_finishes',
  'trainings', 'care_actions', 'horse_purchases'));
DROP TABLE IF EXISTS friend_gifts;
