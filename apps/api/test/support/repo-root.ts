import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * `apps/api/test/support/repo-root.ts` — kaynak dosyası OKUYAN testler için
 * depo kökünü bulur (28.09.2026).
 *
 * **NEDEN GEREKLİ — `process.cwd()` BU PROJEDE GÜVENİLİR DEĞİLDİR.**
 * Aynı test iki farklı çalışma dizininde koşar:
 *
 *  - **CI:** kök `npm run test` → `npm run test --workspaces` → her
 *    workspace KENDİ dizininde koşar, yani `process.cwd()` =
 *    `<depo>/apps/api`.
 *  - **Yerel doğrulama harness'i:** vitest kökten çağrılır, yani
 *    `process.cwd()` = `<depo>`.
 *
 * `join(process.cwd(), 'database', 'migrations', ...)` yazmak bu yüzden
 * YERELDE yeşil, CI'da `ENOENT` verir — ve bu, en kötü hata türüdür:
 * doğrulama "geçti" der, gerçek boru hattı kırmızı olur. (Yaşandı:
 * `race-cancel.spec.ts`, 28.09.2026 — dosya yerelde 17/17 geçti, CI'da
 * `apps/api/database/...` arandı.) Kökü YUKARI YÜRÜYEREK bulmak her iki
 * durumda da doğru sonucu verir.
 *
 * **NEDEN `database/` KLASÖRÜ ÖLÇÜT:** depo kökünü tanımlayan, hem
 * `apps/api` hem de kökten görülebilen tek işarettir (`package.json`
 * yalnızca kökte olsaydı da olurdu ama workspace'lerin de kendi
 * `package.json`u var — o ölçüt YANLIŞ kökü bulurdu).
 *
 * ⚠️ `test/domain/admin/moderation-queue.spec.ts` bu yardımcının DAHA
 * ESKİ, özel bir kopyasını taşır (aynı algoritma). Birleştirmek o dosyaya
 * dokunmayı gerektirirdi; bilinçli olarak bu dilimin dışında bırakıldı.
 */

const MAX_PARENT_WALK_DEPTH = 10;

export function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (let depth = 0; depth < MAX_PARENT_WALK_DEPTH; depth += 1) {
    try {
      readdirSync(join(dir, 'database'));
      return dir;
    } catch {
      const parent = resolve(dir, '..');
      // Kök dizine ulaşıldı (`C:\` ya da `/`) — daha yukarısı yok.
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  throw new Error(`Depo kökü bulunamadı (database/ klasörü yok): ${startDir}`);
}

/** Test modülü yüklenirken BİR KEZ çözülür. */
export const REPO_ROOT = findRepoRoot(process.cwd());
