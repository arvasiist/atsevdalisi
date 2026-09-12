import { defineConfig } from 'vitest/config';

/**
 * `apps/api`'ye özel Vitest konfigürasyonu.
 *
 * NEDEN GEREKLİ (FAZ 1 wiring, bu oturum — düzeltme): kök `npm run test`
 * script'i her workspace'te KENDİ dizininde (`cwd = apps/api`) `vitest run`
 * çalıştırır (`npm run test --workspaces --if-present`). Vite/Vitest'in
 * config dosyası arama davranışı üst dizinlere ÇIKMAZ — yani kökteki
 * `../../vitest.config.ts` bu şekilde çalıştırıldığında OTOMATİK olarak
 * bulunmaz/kullanılmaz. Bu, kökteki config'in `include` deseni ne olursa
 * olsun `apps/api` altında SESSİZCE hiç etkisi olmadığı, gerçekte
 * Vitest'in kendi VARSAYILAN deseninin (`**\/*.{test,spec}.ts`) geçerli
 * olduğu anlamına geliyordu — ki bu da `*.e2e-spec.ts` dosyalarıyla
 * eşleşmiyor (bkz. kök `vitest.config.ts`'teki aynı not). Bu dosya, o
 * belirsizliği ORTADAN KALDIRMAK için `apps/api`'ye özel, cwd-yerel bir
 * config sağlar — `test/**\/*.e2e-spec.ts` artık garanti şekilde bulunur.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    environment: 'node',
    globals: false,
  },
});
