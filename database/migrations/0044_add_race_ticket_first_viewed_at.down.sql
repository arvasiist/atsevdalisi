-- 0044 geri alma. ⚠️ "İzlendi" bilgisi kaybolur; kod geri alınmadıkça iade
-- ucu sütunu arar ve düşer — yalnızca kodla birlikte geri alın.
ALTER TABLE race_tickets DROP COLUMN IF EXISTS first_viewed_at;
