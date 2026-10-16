#!/usr/bin/env node
/**
 * BAĞIMLILIK GÜVENLİK KAPISI (02.10.2026, Faz 13-A).
 *
 * `npm audit --omit=dev` çıktısındaki YÜKSEK/KRİTİK her danışmanın
 * (GHSA) `security/audit-allowlist.json`da GEREKÇELİ ve SÜRESİ DOLMAMIŞ
 * bir kaydı olmalıdır; yoksa çıkış kodu 1. Böylece:
 *  - YENİ bir yüksek/kritik açık CI'ı hemen kırar,
 *  - bilinen ve bilinçli ertelenen açık belgelenir, sessizce unutulamaz
 *    (son tarih geçince CI kırılır).
 * Artık bulunmayan kayıtlar yalnızca uyarıdır (listeyi temizle).
 *
 * Kullanım: `node tools/security/audit-gate.mjs [audit.json]` — dosya
 * verilmezse `npm audit` çalıştırılır.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);
const today = new Date().toISOString().slice(0, 10);

function readAudit() {
  const file = process.argv[2];
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  try {
    return JSON.parse(execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    // `npm audit` açık bulunca 1 ile çıkar ama JSON'u yine stdout'a yazar.
    if (error && typeof error.stdout === 'string' && error.stdout.trim().startsWith('{')) {
      return JSON.parse(error.stdout);
    }
    throw error;
  }
}

const audit = readAudit();
const allowlist = JSON.parse(readFileSync(new URL('../../security/audit-allowlist.json', import.meta.url), 'utf8')).allow;
const allowById = new Map(allowlist.map((entry) => [entry.id, entry]));

const found = new Map();
for (const vulnerability of Object.values(audit.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via === 'object' && BLOCKING.has(via.severity)) {
      const id = via.url.split('/').pop();
      found.set(id, { id, package: via.name, severity: via.severity, title: via.title });
    }
  }
}

const failures = [];
for (const advisory of found.values()) {
  const entry = allowById.get(advisory.id);
  if (!entry) {
    failures.push(`YENİ ${advisory.severity.toUpperCase()} açık: ${advisory.package} ${advisory.id} — ${advisory.title}`);
  } else if (!entry.reason || !entry.expires) {
    failures.push(`${advisory.id}: izin kaydında gerekçe/son tarih eksik`);
  } else if (entry.expires < today) {
    failures.push(`${advisory.id} (${advisory.package}) izninin süresi doldu (${entry.expires}) — yükselt ya da kararı yenile`);
  }
}
for (const entry of allowlist) {
  if (!found.has(entry.id)) {
    console.warn(`uyarı: ${entry.id} (${entry.package}) artık bulunmuyor — izin listesinden çıkar`);
  }
}

console.log(`Yüksek/kritik danışman: ${found.size}, izinli: ${found.size - failures.length}, kapı: ${failures.length === 0 ? 'GEÇTİ' : 'KALDI'}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
