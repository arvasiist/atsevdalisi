-- 0048 geri alma: oyuncu başına sağlayıcı tekilliği kaldırılır.
ALTER TABLE player_auth_providers DROP CONSTRAINT IF EXISTS player_auth_providers_player_provider_uq;
