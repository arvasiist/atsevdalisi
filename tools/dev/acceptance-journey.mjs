// 16.10.2026 — Brief §19 SON KABUL YOLCULUĞU, gerçek arayüzde (Chromium):
// giriş → ahır → üst menü Bakım → bakım işlemi → antrenman (kondisyon/enerji)
// → Yarışlar (Hemen Katıl) → pratik yarış (ücret/ödül) → XP. Kullanım ve
// bağımlılık `tools/dev/layout-check.mjs` ile aynı (API_URL, WEB_URL, CHROMIUM).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const API = process.env.API_URL ?? 'http://localhost:4100/api/v1';
const WEB = process.env.WEB_URL ?? 'http://localhost:3100';
const reg = await fetch(`${API}/players`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `yol_${Date.now().toString(36)}`, displayName: 'Yolculuk' }) }).then((r) => r.json());
const s = reg.data;
const H = { authorization: `Bearer ${s.token}` };
const api = (p) => fetch(`${API}${p}`, { headers: H }).then((r) => r.json()).then((j) => j.data);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((sess) => { localStorage.setItem('atSevdalisi.authToken', sess.token); localStorage.setItem('atSevdalisi.refreshToken', sess.refreshToken); localStorage.setItem('atSevdalisi.accessExpiresAt', sess.accessTokenExpiresAt); localStorage.setItem('atSevdalisi.playerId', sess.player.id); }, s);
const page = await ctx.newPage();
const log = [];
const step = (name, ok, detail = '') => log.push(`${ok ? 'OK ' : 'XX '} ${name}${detail ? ' — ' + detail : ''}`);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
// 1. Giriş → ana sayfa = ahır
await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForURL(/\/stable/, { timeout: 30000 }).catch(() => undefined);
step('Giriş → ahır', page.url().includes('/stable'), page.url());
const horses0 = await api('/horses');
const horse0 = Array.isArray(horses0) ? horses0[0] : horses0?.horses?.[0];
// 2. Bakım: üst menü "Bakım" → panel → Tımar
await page.click('.nav-desktop >> text=Bakım');
const panel = await page.waitForSelector('[data-testid="stable-care-panel"]', { timeout: 30000 }).catch(() => null);
step('Üst menü Bakım → bakım paneli açılır', panel !== null);
const before = await api('/players/me').catch(() => null);
const careBtn = await page.$('[data-testid="stable-care-panel"] .stable-chip');
if (careBtn) { await careBtn.click(); await page.waitForTimeout(2500); }
const horses1 = await api('/horses');
const h1 = Array.isArray(horses1) ? horses1[0] : horses1?.horses?.[0];
step('Bakım işlemi uygulandı', !!careBtn, `moral ${horse0?.morale}→${h1?.morale}, sağlık ${horse0?.health}→${h1?.health}`);
// 3. Antrenman
await page.click('.nav-desktop >> text=Antrenman');
await page.waitForURL(/\/training/);
await page.waitForSelector('text=Antrenmana Başla', { timeout: 60000 });
await page.click('text=Antrenmana Başla');
const fit = await page.waitForSelector('[data-testid="training-fitness-gain"]', { timeout: 30000 }).catch(() => null);
step('Antrenman → kondisyon + enerji etkisi ekranda', fit !== null, fit ? await fit.textContent() : '');
// 4. Yarışlar: lobi + Hemen Katıl bölümü
await page.goto(`${WEB}/races`, { waitUntil: 'networkidle' });
const qj = await page.waitForSelector('[data-testid="quick-join"]', { timeout: 60000 }).catch(() => null);
step('Yarışlar → Hemen Katıl bölümü', qj !== null, qj ? (await qj.textContent()).slice(0, 120) : '');
// 5. Pratik yarış (otomatik koşu) → sonuç
await page.click('[role="tab"]:has-text("Pratik Yarış")');
const moneyBefore = (await api(`/players/${s.player.id}`)).money;
const btn = await page.waitForSelector('button:has-text("Otomatik Koşsun")', { timeout: 30000 }).catch(() => null);
if (btn) await btn.click();
await page.waitForTimeout(8000);
const moneyAfter = (await api(`/players/${s.player.id}`)).money;
const hist = await api(`/players/${s.player.id}/wallet/transactions?limit=5`).catch(() => null);
const types = (hist?.transactions ?? hist ?? []).map?.((t) => `${t.type}:${t.amount}`) ?? [];
step('Pratik yarış koşuldu (ücret/ödül deftere düştü)', btn !== null && moneyAfter !== moneyBefore, `bakiye ${moneyBefore}→${moneyAfter}; defter ${types.join(', ')}`);
const p2 = await api(`/players/${s.player.id}`);
step('Oyuncu ilerlemesi (XP)', (p2.xp ?? 0) > 0, `seviye ${p2.level}, xp ${p2.xp}`);
step('Sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(log.join('\n'));
