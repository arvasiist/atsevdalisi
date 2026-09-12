-- FAZ 5 (Advanced Race Engine) — brief §21 geçiş/bloklanma ve §60 jokey AI
-- kararları artık segment telemetrisinin bir parçası (bkz.
-- `domain/race/overtaking.ts`, `domain/race/jockey-decisions.ts`,
-- `RaceSegmentSnapshot.blocked`/`decision`).
ALTER TABLE race_entry_segments
  ADD COLUMN blocked          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN jockey_decision  TEXT CHECK (
    jockey_decision IS NULL OR jockey_decision IN
    ('reduce_pace', 'push_for_finish', 'search_overtake_lane', 'defend_position', 'hold')
  );

COMMENT ON COLUMN race_entry_segments.blocked IS 'Bu segmentte bir geçiş denemesi başarısız oldu mu (brief §21)';
COMMENT ON COLUMN race_entry_segments.jockey_decision IS 'Bu segment için jokey AI kararı (brief §60)';
