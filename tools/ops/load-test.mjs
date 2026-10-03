#!/usr/bin/env node
/**
 * YÜK TESTİ (02.10.2026, Faz 7) — bağımlılıksız. Her sanal oyuncu bir misafir
 * hesap açar, sonra döngüde gerçek oyuncunun yaptığı okumaları ve en ağır
 * yazmayı (pratik yarış = motor koşusu + para yolu) yapar.
 *
 * ÖLÇÜLEN: uç başına istek sayısı, p50/p95/p99 gecikme, sunucu hatası (5xx +
 * ağ/zaman aşımı) oranı. 4xx İŞ KURALI reddi (ör. enerjisi biten at 409)
 * hata SAYILMAZ, ayrıca raporlanır. Bütçe `config/ops.config.json` →
 * `loadTest` (p95 + hata oranı); aşılırsa çıkış kodu 1.
 *
 * Hız sınırı açık bir sunucuda kayıt 429'a düşer — ölçülen şey sınırlayıcı
 * olurdu. Bu yüzden hedef `DISABLE_RATE_LIMIT=true` ile açılmış bir test
 * sunucusu olmalıdır.
 *
 * ⚠️ YAN ETKİ: sanal oyuncular kalıcı misafir hesaplardır. Yerel olmayan bir
 * adrese yalnızca `--allow-remote` ile gider (üretimi yanlışlıkla yüklemesin).
 *
 * Kullanım: node tools/ops/load-test.mjs <API_BASE> [--users N] [--iterations N]
 *           [--report dosya.json] [--allow-remote]
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const defaults = JSON.parse(readFileSync(new URL('../../config/ops.config.json', import.meta.url), 'utf8')).loadTest;
const args = process.argv.slice(2);
const apiBase = args.find((arg) => !arg.startsWith('--') && !/^\d+$/.test(arg));
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
if (!apiBase) {
  console.error('Kullanım: load-test.mjs <API_BASE> [--users N] [--iterations N] [--report dosya] [--allow-remote]');
  process.exit(2);
}
const host = new URL(apiBase).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host) && !args.includes('--allow-remote')) {
  console.error(`Yerel olmayan hedef (${host}): kalıcı hesap açar. Bilerek koşmak için --allow-remote.`);
  process.exit(2);
}
const users = Number(option('users') ?? defaults.virtualUsers);
const iterations = Number(option('iterations') ?? defaults.iterationsPerUser);
const reportPath = option('report');

/** uç → { ms: number[], ok, rejected, errors, statuses } */
const stats = new Map();
function record(name, ms, outcome, status) {
  const entry = stats.get(name) ?? { ms: [], ok: 0, rejected: 0, errors: 0, statuses: {} };
  entry.ms.push(ms);
  entry[outcome] += 1;
  entry.statuses[status] = (entry.statuses[status] ?? 0) + 1;
  stats.set(name, entry);
}

async function call(name, path, init = {}) {
  const started = performance.now();
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      signal: AbortSignal.timeout(defaults.requestTimeoutMs),
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => null);
    const ms = performance.now() - started;
    const outcome = response.status >= 500 ? 'errors' : response.status >= 400 ? 'rejected' : 'ok';
    record(name, ms, outcome, String(response.status));
    return { status: response.status, body };
  } catch (error) {
    record(name, performance.now() - started, 'errors', error instanceof Error ? error.name : 'ağ');
    return { status: 0, body: null };
  }
}

async function virtualUser(index) {
  // Kullanıcı adı en fazla 20 karakter (sunucu kuralı): `yk` + 12 rastgele onaltılık.
  const username = `yk${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const registered = await call('POST /players', '/players', {
    method: 'POST',
    body: JSON.stringify({ username, displayName: `Yük ${index}` }),
  });
  const token = registered.body?.data?.token;
  const playerId = registered.body?.data?.player?.id;
  if (!token || !playerId) return;
  const auth = { Authorization: `Bearer ${token}` };
  const horses = await call('GET /horses', `/horses?ownerId=${playerId}`, { headers: auth });
  const horseId = horses.body?.data?.[0]?.id;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await Promise.all([
      call('GET /players/:id', `/players/${playerId}`, { headers: auth }),
      call('GET /races', '/races', { headers: auth }),
      call('GET /quests', '/quests', { headers: auth }),
      call('GET /leaderboard', '/leaderboard', { headers: auth }),
      call('GET /players/:id/wallet', `/players/${playerId}/wallet`, { headers: auth }),
    ]);
    if (horseId) {
      await call('POST /horses/:id/practice-race', `/horses/${horseId}/practice-race`, {
        method: 'POST',
        headers: { ...auth, 'Idempotency-Key': randomUUID() },
        body: '{}',
      });
    }
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const started = performance.now();
await Promise.all(Array.from({ length: users }, (_, index) => virtualUser(index)));
const seconds = (performance.now() - started) / 1000;

const rows = [...stats.entries()].map(([name, entry]) => {
  const sorted = [...entry.ms].sort((a, b) => a - b);
  return {
    endpoint: name,
    requests: sorted.length,
    ok: entry.ok,
    rejected: entry.rejected,
    errors: entry.errors,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    statuses: entry.statuses,
  };
});
const all = [...stats.values()].flatMap((entry) => entry.ms).sort((a, b) => a - b);
const total = all.length;
const errors = rows.reduce((sum, row) => sum + row.errors, 0);
const summary = {
  users,
  iterations,
  seconds: Number(seconds.toFixed(1)),
  requests: total,
  requestsPerSecond: Number((total / seconds).toFixed(1)),
  p95: Math.round(percentile(all, 95)),
  errorRate: total === 0 ? 1 : Number((errors / total).toFixed(4)),
  budget: { p95BudgetMs: defaults.p95BudgetMs, maxErrorRate: defaults.maxErrorRate },
};

console.log(`${users} sanal oyuncu × ${iterations} tur · ${total} istek · ${summary.seconds} sn · ${summary.requestsPerSecond} istek/sn`);
console.log('uç'.padEnd(34), 'istek', '  ok', 'red', 'hata', '  p50', '  p95', '  p99');
for (const row of rows) {
  console.log(
    row.endpoint.padEnd(34),
    String(row.requests).padStart(5),
    String(row.ok).padStart(4),
    String(row.rejected).padStart(3),
    String(row.errors).padStart(4),
    String(row.p50).padStart(5),
    String(row.p95).padStart(5),
    String(row.p99).padStart(5),
  );
}
console.log(`toplam p95 ${summary.p95} ms (bütçe ${defaults.p95BudgetMs}) · hata oranı ${summary.errorRate} (bütçe ${defaults.maxErrorRate})`);
if (reportPath) writeFileSync(reportPath, JSON.stringify({ summary, endpoints: rows }, null, 2));

const failed = [];
if (total === 0 || !stats.get('POST /players')?.ok) failed.push('hiçbir sanal oyuncu kaydolamadı');
if (summary.errorRate > defaults.maxErrorRate) failed.push(`hata oranı ${summary.errorRate} > ${defaults.maxErrorRate}`);
if (summary.p95 > defaults.p95BudgetMs) failed.push(`p95 ${summary.p95} ms > ${defaults.p95BudgetMs} ms`);
if (failed.length > 0) {
  console.error(`BÜTÇE AŞILDI: ${failed.join('; ')}`);
  process.exit(1);
}
console.log('bütçe içinde');
