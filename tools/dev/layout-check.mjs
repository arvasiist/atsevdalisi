// 16.10.2026 — Brief §3.2 / regresyon #10: ahır + ana ekranların GERÇEK
// tarayıcıda düzen ölçümü (yatay taşma, üst menü/alt sekmeler, ahır işlemleri,
// sayfa hataları) — masaüstü 1440×900, tablet 820×1180, telefon yatay 844×390,
// telefon dikey 390×844. Ekran görüntüleri SHOTS_DIR'e.
//
// Kullanım (API + web ayakta, ayrı bir veritabanıyla):
//   npm i --prefix <geçici-dizin> playwright-core
//   API_URL=http://localhost:4100/api/v1 WEB_URL=http://localhost:3100 \
//   CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//   NODE_PATH=<geçici-dizin>/node_modules node tools/dev/layout-check.mjs
// Çıktı JSON: her (ekran, sayfa) için overflowX (0 olmalı), nav, tabs, dock.
// Bağımlılık depoya EKLENMEDİ (CI'da tarayıcı yok); elle koşulan bir araçtır.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const API = process.env.API_URL ?? 'http://localhost:4100/api/v1';
const WEB = process.env.WEB_URL ?? 'http://localhost:3100';
const SHOTS = process.env.SHOTS_DIR ?? '.';
const reg = await fetch(`${API}/players`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: `duzen_${Date.now().toString(36)}`, displayName: 'Düzen Testi' }),
}).then((r) => r.json());
const s = reg.data;
const viewports = [
  { name: 'masaustu', width: 1440, height: 900, touch: false },
  { name: 'tablet', width: 820, height: 1180, touch: true },
  { name: 'telefon-yatay', width: 844, height: 390, touch: true },
  { name: 'telefon-dikey', width: 390, height: 844, touch: true },
];
const pages = process.env.PAGES ? process.env.PAGES.split(',') : ['/stable', '/races', '/friends', '/training', '/account', '/wallet'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
  await context.addInitScript((sess) => {
    localStorage.setItem('atSevdalisi.authToken', sess.token);
    localStorage.setItem('atSevdalisi.refreshToken', sess.refreshToken);
    localStorage.setItem('atSevdalisi.accessExpiresAt', sess.accessTokenExpiresAt);
    localStorage.setItem('atSevdalisi.playerId', sess.player.id);
  }, s);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  for (const path of pages) {
    await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const nav = [...document.querySelectorAll('.nav-desktop a')].map((a) => a.textContent?.trim()).filter(Boolean);
      const tabs = [...document.querySelectorAll('.bottom-nav a')].map((a) => a.textContent?.trim()).filter(Boolean);
      const wide = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
      return {
        overflowX: doc.scrollWidth - window.innerWidth,
        nav,
        tabs,
        dock: !!document.querySelector('[data-testid="stable-action-care"]'),
        rotate: !!document.querySelector('.rotate-device-prompt, [data-testid="rotate-device-prompt"]'),
        wide,
      };
    });
    if (path === '/stable' || path === '/races') await page.screenshot({ path: `${SHOTS}/${vp.name}${path.replace('/', '-')}.png` });
    results.push({ vp: vp.name, path, ...m });
  }
  results.push({ vp: vp.name, path: 'errors', errors });
  await context.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
