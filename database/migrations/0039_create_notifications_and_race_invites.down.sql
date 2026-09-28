-- `race_invites` ÖNCE düşürülür: `notifications`a FK'si yoktur ama davet
-- satırları `races`/`players`a bağlıdır — sıra, ileride eklenecek bir FK
-- için de doğru olan sıradır (bağımlı olan önce gider).
DROP TABLE IF EXISTS race_invites;
DROP TABLE IF EXISTS notifications;
