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
 */
export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.spec.ts',
      'apps/*/test/**/*.spec.ts',
      'apps/*/test/**/*.e2e-spec.ts',
    ],
    environment: 'node',
    globals: false,
  },
});
