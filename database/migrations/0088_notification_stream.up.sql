-- 0088 — CANLI BİLDİRİM AKIŞI (16.10.2026, brief §13).
--
-- Bildirim satırları 12 ayrı yerde, işlerinin transaction'ı İÇİNDE yazılır
-- (para hareketiyle aynı commit). Canlı yayın ise yalnızca yarış davetinde
-- vardı. Postgres `NOTIFY` transaction'a bağlıdır: yalnızca COMMIT'te teslim
-- edilir, geri alınan işin bildirimi hiç yayınlanmaz. Bu yüzden tek bir
-- tetikleyici bütün üreticileri kapsar ve hiçbir üreticiye kod eklenmez.
-- Yük yalnızca kimliktir (8 kB sınırı + kişisel veri dinleyiciye taşınmaz);
-- dinleyici satırı kimlikle okur. Kanal adı `ops.config.json` →
-- `realtime.notificationStream.channel` ile AYNI olmalı
-- (`notification-stream.spec.ts` dosyayı okuyarak karşılaştırır).

CREATE OR REPLACE FUNCTION notify_notification_created() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('notification_created', json_build_object('id', NEW.id, 'playerId', NEW.player_id)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notifications_stream_after_insert
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_notification_created();
