#!/usr/bin/env bash
# VERİTABANI YEDEĞİ (02.10.2026, Faz 13-C).
# Kullanım: DATABASE_URL=... tools/ops/db-backup.sh [çıktı.dump]
# pg_dump "custom" biçimi (sıkıştırılmış, seçici geri yüklenebilir). Sahiplik
# ve yetkiler YEDEĞE GİRMEZ: hedef ortamın kullanıcısı farklı olabilir.
# Yedek dosyası KİŞİSEL VERİ içerir — şifreli depoya koy, depoya COMMIT ETME.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL tanımlı değil}"
out="${1:-at-sevdalisi-$(date -u +%Y%m%dT%H%M%SZ).dump}"
pg_dump --format=custom --no-owner --no-privileges --file="$out" "$DATABASE_URL"
size=$(wc -c < "$out")
sum=$(sha256sum "$out" | cut -d' ' -f1)
echo "yedek: $out ($size bayt, sha256 $sum)"
