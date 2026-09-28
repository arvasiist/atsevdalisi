-- Geri alma — migration 0041.
--
-- SIRA ANLAMLIDIR: önce bu migration'ın EKLEDİĞİ kolonlar düşürülür,
-- sonra denetim günlüğü. `player_reports.reviewed_by`, `players(id)`ye
-- FK taşır; `admin_audit_log` da öyle. `players.is_admin` düşürülmeden
-- önce bir sorun yoktur ama ters sırada düşürmek (önce tablo, sonra
-- kolon) hiçbir şeyi bozmaz — yine de okunabilirlik için EKLEME
-- sırasının TERSİ izlenir.
ALTER TABLE player_reports
  DROP COLUMN reviewed_at,
  DROP COLUMN reviewed_by;

DROP INDEX IF EXISTS idx_admin_audit_log_target;
DROP INDEX IF EXISTS idx_admin_audit_log_admin;
DROP TABLE IF EXISTS admin_audit_log;

ALTER TABLE players
  DROP COLUMN is_admin;
