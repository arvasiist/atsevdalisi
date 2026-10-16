DROP TABLE IF EXISTS email_verification_tokens;
ALTER TABLE player_credentials DROP COLUMN IF EXISTS email_verified_at;
