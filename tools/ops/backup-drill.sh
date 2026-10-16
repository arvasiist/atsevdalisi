#!/usr/bin/env bash
# YEDEK / GERİ YÜKLEME PROVASI (02.10.2026, Faz 13-C).
# Kaynak veritabanının yedeğini alır, GEÇİCİ boş bir veritabanına geri yükler
# ve iki parmak izini karşılaştırır (satır sayıları, migration listesi,
# defter özeti, bakiye toplamları). Farklıysa çıkış 1. Sonunda geçici
# veritabanı silinir. Kaynağa YAZMAZ.
# Kullanım: DATABASE_URL=... tools/ops/backup-drill.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL tanımlı değil}"
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
drill_db="drill_$(date -u +%s)_$$"
base="${DATABASE_URL%/*}"
target="$base/$drill_db"
cleanup() {
  psql "$DATABASE_URL" -qc "DROP DATABASE IF EXISTS $drill_db" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

node "$here/db-fingerprint.mjs" "$DATABASE_URL" > "$work/source.json"
"$here/db-backup.sh" "$work/backup.dump"
psql "$DATABASE_URL" -qc "CREATE DATABASE $drill_db"
TARGET_DATABASE_URL="$target" "$here/db-restore.sh" "$work/backup.dump"
node "$here/db-fingerprint.mjs" "$target" > "$work/restored.json"

if diff -u "$work/source.json" "$work/restored.json"; then
  tables=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$work/source.json','utf8')).tables)")
  ledger=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$work/source.json','utf8')).ledger.rows)")
  echo "PROVA GEÇTİ: $tables tablo, $ledger defter satırı birebir geri yüklendi."
else
  echo "PROVA KALDI: geri yüklenen veritabanı kaynaktan farklı." >&2
  exit 1
fi
