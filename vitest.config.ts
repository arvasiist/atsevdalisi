import { defineConfig } from 'vitest/config';

/**
 * Kök seviye Vitest konfigürasyonu. Her workspace paketi kendi test
 * script'ini (`npm run test --workspace=<paket>`) çalıştırabilir; bu dosya
 * `npm run test` kök script'i için ortak varsayılanları sağlar.
 */
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.spec.ts', 'apps/*/test/**/*.spec.ts'],
    environment: 'node',
    globals: false,
  },
});
