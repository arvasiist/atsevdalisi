import { defineConfig } from 'vitest/config';

/**
 * Kök seviye Vitest konfigürasyonu. Her workspace paketi kendi test
 * script'ini (`npm run test --workspace=<paket>`) çalıştırabilir; bu dosya
 * `npm run test` kök script'i için ortak varsayılanları sağlar.
 *
 * DÜZELTME (FAZ 1 wiring, bu oturum): `include` deseni sadece `*.spec.ts`
 * ile eşleşiyordu — `apps/api/test/api/health.e2e-spec.ts` (dosya adı
 * ".e2e-spec.ts" ile biter, ".spec.ts" ile DEĞİL) bu yüzden hiçbir zaman
 * `npm run test` tarafından ÇALIŞTIRILMAMIŞTI (FAZ 0'dan beri var olan,
 * fark edilmemiş bir kapsam boşluğu — `*.spec.ts` ile `*.e2e-spec.ts`
 * farklı glob eşleşmeleridir). `**\/*.e2e-spec.ts` eklenerek düzeltildi;
 * yeni `apps/api/test/api/player.e2e-spec.ts` (FAZ 1 wiring) bu düzeltme
 * SAYESİNDE gerçekten koşacaktır.
 *
 * DÜZELTME (AUDIT_REPORT.md T2, bu oturum): `include` deseni `.spec.tsx`
 * dosyalarını KAPSAMIYORDU — `apps/web`'in İLK gerçek component testleri
 * (`RaceHud.spec.tsx`, `player-context.spec.tsx`, `@testing-library/react`
 * + jsdom kullanır) bu yüzden eklendi. `esbuild.jsx: 'automatic'` de
 * ZORUNLU: `apps/web/tsconfig.json`'daki `"jsx": "preserve"` (Next.js/SWC
 * için gerekli) esbuild tarafından desteklenmez ("preserve" modunu esbuild
 * anlamaz, hata fırlatır) — bu yüzden Vite/Vitest'in esbuild dönüşümü için
 * burada AÇIKÇA `'automatic'` (React 17+ otomatik JSX runtime) zorunlu
 * kılınıyor; bu, tsconfig'in kendi "preserve" ayarını (Next.js build'i
 * için hâlâ doğru olan ayar) DEĞİŞTİRMEZ, yalnızca Vitest'in kendi
 * dönüşüm adımını etkiler.
 */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: [
      'packages/*/test/**/*.spec.ts',
      'apps/*/test/**/*.spec.ts',
      'apps/*/test/**/*.spec.tsx',
      'apps/*/test/**/*.e2e-spec.ts',
    ],
    environment: 'node',
    globals: false,
  },
});
