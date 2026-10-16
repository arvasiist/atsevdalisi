-- 16.10.2026 — sosyal brief §3: çevrimiçi / son görülme + gizlilik.
-- `last_seen_at` istemcinin görünürken yolladığı nabızla (`POST
-- /presence/heartbeat`, aralığı config'te) güncellenir; durum ondan TÜRETİLİR
-- (sayaç/oturum tablosu yok — çok örnekli kurulumda da tutarlı). Yalnızca
-- arkadaşlara gösterilir; `show_online_status = false` → "gizli".
-- Yalnızca ekleme: mevcut satırlar NULL (hiç görülmedi) + görünür kalır.
ALTER TABLE players ADD COLUMN last_seen_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN show_online_status BOOLEAN NOT NULL DEFAULT true;
