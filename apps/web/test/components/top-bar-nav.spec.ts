import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_LINKS } from '../../src/components/layout/nav-links';

/**
 * `TopBar`'ın gezinti şeridi (28.09.2026) — KIRIK BAĞLANTI KİLİDİ.
 *
 * **NEDEN GEREKLİ:** Next.js'te var olmayan bir yola `<Link href="/yok">`
 * yazmak DERLEME HATASI DEĞİLDİR. Ne `tsc` ne `next build` ne başka bir
 * test bunu yakalar; sayfa yalnızca kullanıcı tıkladığında 404 olur. Bu
 * projede gezinti şeridi ELLE yazılmış bir listedir, yani liste ile
 * `src/app` arasındaki tutarsızlık sessizce birikebilecek bir şeydir.
 *
 * **TEST GERÇEK DOSYA SİSTEMİNİ OKUR**, listeyi kopyalamaz: `NAV_LINKS`
 * KAYNAKTAN import edilir (bkz. `api-client.spec.ts` dosya başındaki
 * "kopya tutma" dersi), sayfa yolları ise `src/app` altından TARANIR.
 * Yani şeride yeni bir bağlantı eklenip sayfası yazılmazsa bu test kırılır.
 *
 * **NEDEN `process.cwd()` GÜVENİLİR DEĞİL:** aynı test iki dizinden koşar
 * (CI: `apps/web`; yerel harness: depo kökü) — ayrıntı ve AYNI çözümün
 * `apps/api` tarafındaki kopyası için bkz. `apps/api/test/support/repo-root.ts`.
 * Burada kök, `apps/web/src/app` klasörü ARANARAK bulunur.
 */

const MAX_PARENT_WALK_DEPTH = 10;

function findWebAppDir(startDir: string): string {
  let dir = resolve(startDir);
  for (let depth = 0; depth < MAX_PARENT_WALK_DEPTH; depth += 1) {
    // Ölçüt DEPO KÖKÜDÜR (`apps/` klasörü), `src/app` DEĞİL: `cwd` depo
    // kökü olduğunda `src/app` kökte YOKTUR ve yukarı yürümek onu hiç
    // bulamazdı. Kök bulunup `apps/web/src/app` AŞAĞI doğru kurulur —
    // böylece hem `apps/web` hem depo kökü `cwd`siyle çalışır.
    const candidate = join(dir, 'apps', 'web', 'src', 'app');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`apps/web/src/app bulunamadı: ${startDir}`);
}

const APP_DIR = findWebAppDir(process.cwd());

/** `src/app` altındaki tüm `page.tsx` dosyalarını (göreli yol olarak) toplar. */
function collectPageFiles(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...collectPageFiles(join(dir, entry.name), relative));
    } else if (entry.name === 'page.tsx') {
      found.push(relative);
    }
  }
  return found;
}

/**
 * Bir `page.tsx` yolundan Next.js ROTASINI türetir.
 *
 * İki kural uygulanır:
 *  - **Rota grupları** (`(dashboard)`) URL'ye GİRMEZ — parantezli segment
 *    atlanır. Bu yüzden `(dashboard)/page.tsx` rotası `/`'dir.
 *  - **Dinamik segmentler** (`[raceId]`) bu kümeye STATİK bağlantı olarak
 *    giremez; `null` döner ve karşılaştırmaya katılmaz (şeride
 *    `/replays/[raceId]` yazmak zaten anlamsız olurdu).
 */
function routeOf(pageFile: string): string | null {
  // `src/app/page.tsx` (kök sayfa) özel durumdur: `replace` deseni baştaki
  // `/`i arar ve bu yolda hiç eşleşmez — olduğu gibi bırakılsaydı rota
  // `/page.tsx` olurdu.
  const withoutFile = pageFile === 'page.tsx' ? '' : pageFile.replace(/\/page\.tsx$/, '');
  const segments = withoutFile
    .split('/')
    .filter((segment) => segment.length > 0 && !(segment.startsWith('(') && segment.endsWith(')')));
  if (segments.some((segment) => segment.startsWith('['))) {
    return null;
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

const STATIC_ROUTES = new Set(
  collectPageFiles(APP_DIR)
    .map(routeOf)
    .filter((route): route is string => route !== null),
);

describe('TopBar gezinti şeridi', () => {
  it('şeritteki HER bağlantı için gerçekten bir sayfa vardır', () => {
    // Bu, testin asıl iddiasıdır: 404'e götüren bir bağlantı, hiç
    // olmayan bir bağlantıdan DAHA KÖTÜDÜR — kullanıcıya çalıştığı
    // izlenimini verir.
    for (const [href] of NAV_LINKS) {
      expect(STATIC_ROUTES.has(href), `Sayfası olmayan gezinti bağlantısı: ${href}`).toBe(true);
    }
  });

  it('şeritte aynı yol İKİ KEZ yoktur (React `key` çakışması ve yanlış "aktif" işaretlemesi)', () => {
    const hrefs = NAV_LINKS.map(([href]) => href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('brief §35\'in yazılan sayfaları şerittedir (yazılan sayfa ULAŞILABİLİR olmalı)', () => {
    // Bir sayfa yazıp şeride eklememek, ekranı ÖLÜ KOD yapar — bu
    // dilimlerin varlık sebebi tam olarak buydu (bkz. `TopBar` doc
    // yorumu). Liste BÜYÜR: her yeni ekran buraya bir satır ekler, yoksa
    // sayfa derlenir, testler geçer ve kullanıcı ona HİÇ ULAŞAMAZ.
    for (const href of ['/notifications', '/wallet']) {
      expect(NAV_LINKS.map(([linkHref]) => linkHref)).toContain(href);
      expect(STATIC_ROUTES.has(href), `Şeritte olmayan sayfa: ${href}`).toBe(true);
    }
  });

  it('şeritte HİÇBİR bağlantı boş etiket taşımaz', () => {
    for (const [href, label] of NAV_LINKS) {
      expect(label.trim().length, `Boş etiket: ${href}`).toBeGreaterThan(0);
    }
  });
});
