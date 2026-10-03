#!/usr/bin/env bash
# GERİ YÜKLEME (02.10.2026, Faz 13-C).
# Kullanım: TARGET_DATABASE_URL=... tools/ops/db-restore.sh yedek.dump
# GÜVENLİK: hedefte tablo VARSA reddeder — çalışan bir veritabanının üstüne
# yanlışlıkla geri yükleme yapılmasın. Boş bir veritabanı oluştur, oraya yükle,
# doğrula (db-fingerprint.mjs), sonra trafiği çevir.
set -euo pipefail
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL tanımlı değil}"
dump="${1:?yedek dosyası verilmedi}"
existing=$(psql "$TARGET_DATABASE_URL" -Atc "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public'")
if [ "$existing" != "0" ]; then
  echo "HATA: hedef veritabanı boş değil ($existing tablo). Geri yükleme reddedildi." >&2
  exit 1
fi
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --dbname="$TARGET_DATABASE_URL" "$dump"
echo "geri yüklendi: $dump"
