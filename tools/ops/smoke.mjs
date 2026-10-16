#!/usr/bin/env node
/**
 * DUMAN TESTİ (02.10.2026, Faz 13-C) — çalışan bir yığına (staging ya da
 * üretim sonrası) karşı uçtan uca temel akışı dener. YAN ETKİSİ: bir misafir
 * oyuncu açar (kalıcıdır; staging için uygun, üretimde bilerek koş).
 *
 * Kullanım: node tools/ops/smoke.mjs <API_BASE> <WEB_BASE>
 *   örn. node tools/ops/smoke.mjs http://localhost:4000/api/v1 http://localhost:3000
 */
const [apiBase, webBase] = process.argv.slice(2);
if (!apiBase || !webBase) {
  console.error('Kullanım: smoke.mjs <API_BASE> <WEB_BASE>');
  process.exit(2);
}

const failures = [];
async function step(name, run) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}
async function json(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return { response, body: await response.json().catch(() => null) };
}

let session = null;

await step('hazırlık: veritabanı + redis', async () => {
  const { response, body } = await json('/health/ready');
  expect(response.status === 200, `durum ${response.status}`);
  expect(body?.checks?.database === 'ok' && body?.checks?.redis === 'ok', JSON.stringify(body?.checks));
});

await step('hata zarfı istek kimliği taşır', async () => {
  const { response, body } = await json('/bu-uc-yok');
  expect(response.status === 404, `durum ${response.status}`);
  const header = response.headers.get('x-request-id');
  expect(header && body?.error?.requestId === header, 'requestId başlıkla eşleşmiyor');
});

await step('misafir kaydı → oturum (erişim + yenileme token)', async () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const { response, body } = await json('/players', {
    method: 'POST',
    body: JSON.stringify({ username: `smoke_${suffix}`, displayName: 'Duman Testi' }),
  });
  expect(response.status === 201, `durum ${response.status}`);
  session = body.data;
  expect(typeof session.token === 'string' && typeof session.refreshToken === 'string', 'token eksik');
});

await step('korumalı uç + cüzdan (üretimde sahte yatırma KAPALI)', async () => {
  expect(session, 'oturum yok');
  const { response, body } = await json(`/players/${session.player.id}/wallet`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(response.status === 200, `durum ${response.status}`);
  expect(body.data.depositAvailable === false, `depositAvailable=${body.data.depositAvailable}`);
});

await step('oturum yenileme', async () => {
  expect(session, 'oturum yok');
  const { response, body } = await json('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  expect(response.status === 200 && body.data.refreshToken !== session.refreshToken, `durum ${response.status}`);
});

await step('web ana sayfa', async () => {
  const response = await fetch(webBase);
  const html = await response.text();
  expect(response.status === 200, `durum ${response.status}`);
  expect(/AT SEVDALISI/i.test(html), 'başlık bulunamadı');
});

if (failures.length > 0) {
  console.log(`DUMAN TESTİ KALDI (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('DUMAN TESTİ GEÇTİ');
