// 16.10.2026 — ARKADAŞLIK + ÇİP HEDİYESİ, gerçek arayüzde (Chromium, iki oyuncu):
// arama → "Arkadaş Ekle" → karşı taraf "Kabul Et" → "Çip Hediye Et" → hazır
// tutar → onay ekranı → gönder; ardından bakiye, iki taraf geçmişi, defter,
// bildirimler API'den doğrulanır; engel konunca aynı ekrandan transfer reddedilir.
// Arkadaşlık kapısı (birlikte yarış VEYA davet çifti) davet koduyla açılır —
// SQL fikstürü yok, üretimdeki yolun aynısı.
// Kullanım ve bağımlılık `tools/dev/layout-check.mjs` ile aynı (API_URL, WEB_URL,
// CHROMIUM, NODE_PATH). Ayrı bir veritabanıyla koş.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const API = process.env.API_URL ?? 'http://localhost:4100/api/v1';
const WEB = process.env.WEB_URL ?? 'http://localhost:3100';
const AMOUNT = 50;

const json = (r) => r.json();
const register = (name) =>
  fetch(`${API}/players`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: `${name.toLowerCase()}_${Date.now().toString(36)}`, displayName: name }),
  })
    .then(json)
    .then((j) => j.data);
const call = (s, path, init = {}) =>
  fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } }).then(json);
const money = async (s) => (await call(s, `/players/${s.player.id}`)).data.money;

const a = await register('Ayse');
const b = await register('Burak');
const code = (await call(a, '/referrals')).data.code;
await call(b, '/referrals/attach', { method: 'POST', body: JSON.stringify({ code }) });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
async function open(s) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((sess) => {
    localStorage.setItem('atSevdalisi.authToken', sess.token);
    localStorage.setItem('atSevdalisi.refreshToken', sess.refreshToken);
    localStorage.setItem('atSevdalisi.accessExpiresAt', sess.accessTokenExpiresAt);
    localStorage.setItem('atSevdalisi.playerId', sess.player.id);
  }, s);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  return page;
}
const log = [];
const step = (name, ok, detail = '') => log.push(`${ok ? 'OK ' : 'XX '} ${name}${detail ? ' — ' + detail : ''}`);

// 1. A, B'yi arar ve "Arkadaş Ekle"ye basar.
const pageA = await open(a);
await pageA.goto(`${WEB}/friends`, { waitUntil: 'networkidle', timeout: 180000 });
await pageA.fill('#player-search-input', b.player.username);
const addBtn = await pageA.waitForSelector(`[data-relation] >> text=Arkadaş Ekle`, { timeout: 30000 }).catch(() => null);
if (addBtn) await addBtn.click();
const sent = await pageA.waitForSelector('[data-relation="outgoing"]', { timeout: 15000 }).catch(() => null);
const sentText = sent ? ((await sent.textContent()) ?? '') : '';
step('Arama + "Arkadaş Ekle" (A)', addBtn !== null && sentText.includes('İstek gönderildi'), sentText.replace(/\s+/g, ' ').slice(0, 80));

// 2. B, gelen isteği "Kabul Et" ile kabul eder.
const pageB = await open(b);
await pageB.goto(`${WEB}/friends`, { waitUntil: 'networkidle', timeout: 180000 });
const accept = await pageB.waitForSelector('button:has-text("Kabul Et")', { timeout: 30000 }).catch(() => null);
if (accept) await accept.click();
await pageB.waitForTimeout(2000);
const friendsB = (await call(b, `/players/${b.player.id}/social`)).data?.friends ?? [];
step('Gelen istek "Kabul Et" (B)', accept !== null && friendsB.some((f) => f.playerId === a.player.id), `arkadaş sayısı ${friendsB.length}`);

// 3. A, "Çip Hediye Et" → hazır tutar → Devam → onay ekranı → gönder.
const moneyA0 = await money(a);
const moneyB0 = await money(b);
await pageA.reload({ waitUntil: 'networkidle' });
const giftBtn = await pageA.waitForSelector('button:has-text("Çip Hediye Et")', { timeout: 30000 }).catch(() => null);
if (giftBtn) await giftBtn.click();
const panel = await pageA.waitForSelector('[data-testid="chip-transfer-quota"]', { timeout: 30000 }).catch(() => null);
if (panel) {
  await pageA.click(`.chip-transfer-presets >> text="${AMOUNT}"`);
  await pageA.click('[data-testid="chip-transfer"] button:has-text("Devam")');
}
const confirmBox = await pageA.waitForSelector('[data-testid="chip-transfer-confirm"]', { timeout: 15000 }).catch(() => null);
const confirmText = confirmBox ? (await confirmBox.textContent()) ?? '' : '';
step('Onay ekranı: alıcı + tutar + işlem sonrası bakiye', confirmText.includes(b.player.displayName) && confirmText.includes('İşlem sonrası bakiyen'), confirmText.replace(/\s+/g, ' ').slice(0, 160));
if (confirmBox) await pageA.click('button:has-text("Onayla ve Gönder")');
const done = await pageA.waitForSelector('[data-testid="chip-transfer-done"]', { timeout: 30000 }).catch(() => null);
step('Gönderim sonucu ekranda', done !== null, done ? ((await done.textContent()) ?? '').slice(0, 120) : '');

// 4. Sunucu tarafı: bakiye, geçmiş, defter, bildirim.
const moneyA1 = await money(a);
const moneyB1 = await money(b);
step('Bakiye: gönderenden düştü, alıcıya eklendi', moneyA1 === moneyA0 - AMOUNT && moneyB1 === moneyB0 + AMOUNT, `A ${moneyA0}→${moneyA1}, B ${moneyB0}→${moneyB1}`);
const giftsA = (await call(a, `/players/${a.player.id}/gifts`)).data ?? [];
const giftsB = (await call(b, `/players/${b.player.id}/gifts`)).data ?? [];
step('Hediye geçmişi iki tarafta', giftsA[0]?.direction === 'outgoing' && giftsB[0]?.direction === 'incoming' && giftsA[0]?.giftId === giftsB[0]?.giftId, `A:${giftsA[0]?.direction}/${giftsA[0]?.amount} B:${giftsB[0]?.direction}/${giftsB[0]?.amount}`);
const ledgerA = (await call(a, `/players/${a.player.id}/wallet?limit=5`)).data;
const ledgerB = (await call(b, `/players/${b.player.id}/wallet?limit=5`)).data;
const rowsA = (ledgerA?.transactions ?? []).filter((t) => t.type === 'gift_send_debit');
const rowsB = (ledgerB?.transactions ?? []).filter((t) => t.type === 'gift_send_credit');
step('Defter: gönderene −, alıcıya + (aynı hediye)', rowsA[0]?.amount === -AMOUNT && rowsB[0]?.amount === AMOUNT, `A ${rowsA[0]?.amount}, B ${rowsB[0]?.amount}`);
const notesA = (await call(a, `/players/${a.player.id}/notifications`)).data;
const notesB = (await call(b, `/players/${b.player.id}/notifications`)).data;
const typesA = (notesA?.notifications ?? []).map((n) => n.type);
const typesB = (notesB?.notifications ?? []).map((n) => n.type);
step('Bildirim: gönderene gift_sent, alıcıya gift_received', typesA.includes('gift_sent') && typesB.includes('gift_received'), `A [${typesA.join(',')}] B [${typesB.join(',')}]`);

// 5. B, arkadaş satırındaki "Engelle" ile A'yı engeller (onay penceresi kabul edilir):
//    A, B'nin listesinden düşer ve "Engellenenler"e geçer; A aynı ekrandan gönderemez.
pageB.on('dialog', (dialog) => void dialog.accept());
await pageB.reload({ waitUntil: 'networkidle' });
const blockBtn = await pageB.waitForSelector('button:has-text("Engelle")', { timeout: 30000 }).catch(() => null);
if (blockBtn) await blockBtn.click();
const blockedSection = await pageB.waitForSelector('text=Engellenenler (1)', { timeout: 15000 }).catch(() => null);
const friendsB2 = (await call(b, `/players/${b.player.id}/social`)).data?.friends ?? [];
step('"Engelle" (B): A arkadaş listesinden düşer, Engellenenler\'de', blockBtn !== null && blockedSection !== null && friendsB2.length === 0);
await pageA.reload({ waitUntil: 'networkidle' });
const giftBtn2 = await pageA.waitForSelector('button:has-text("Çip Hediye Et")', { timeout: 30000 }).catch(() => null);
let blockedMsg = '';
if (giftBtn2) {
  await giftBtn2.click();
  await pageA.waitForSelector('[data-testid="chip-transfer-quota"]', { timeout: 30000 });
  await pageA.click('.chip-transfer-presets >> text="10"');
  await pageA.click('[data-testid="chip-transfer"] button:has-text("Devam")');
  await pageA.click('button:has-text("Onayla ve Gönder")');
  const alert = await pageA.waitForSelector('[data-testid="chip-transfer-confirm"] [role="alert"]', { timeout: 15000 }).catch(() => null);
  blockedMsg = alert ? ((await alert.textContent()) ?? '') : '';
}
step('Engelden sonra transfer reddedilir, bakiye değişmez', blockedMsg !== '' && (await money(a)) === moneyA1, blockedMsg.slice(0, 120));
step('Sayfa hatası yok', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(log.join('\n'));
process.exit(log.some((line) => line.startsWith('XX')) ? 1 : 0);
