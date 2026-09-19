import { defineConfig } from 'vitest/config';

/**
 * AUDIT_REPORT.md T2 (Medium) hardening (bu oturum) — `apps/web`'in daha
 * önce KENDİ vitest config'i yoktu (kök `vitest.config.ts`'e güveniliyordu,
 * ki `npm run test --workspaces` her paketi KENDİ dizininde çalıştırdığından
 * bu güvenin gerçekte geçerli olup olmadığı belirsizdi — Vite/Vitest'in
 * config arama davranışı `cwd`'yi kök dizine kadar YUKARI aramaz). Bu dosya
 * o belirsizliği ortadan kaldırır: `apps/web` artık HER ZAMAN kendi
 * config'ini kullanır, kökten bağımsız.
 *
 * `esbuild.jsx: 'automatic'` ZORUNLU: `tsconfig.json`'daki `"jsx":
 * "preserve"` (Next.js/SWC'nin gerçek build'i için doğru ayar) esbuild
 * tarafından DESTEKLENMEZ — Vite'ın esbuild tabanlı dönüşümü "preserve"
 * görürse hata fırlatır. Bu satır SADECE Vitest'in kendi test dönüşümünü
 * etkiler, `tsconfig.json`/Next.js build'ini DEĞİŞTİRMEZ.
 *
 * `environment: 'node'` — kök config'le AYNI varsayılan (mevcut saf-mantık
 * testleri, ör. `timeline-playback.spec.ts`, DOM'a ihtiyaç duymaz). Yeni
 * `.tsx` component testleri (`RaceHud.spec.tsx`, `player-context.spec.tsx`)
 * kendi `// @vitest-environment jsdom` pragma'larıyla SADECE kendileri için
 * jsdom'a geçer — bu yüzden burada global `environment`'ı `jsdom` yapmaya
 * GEREK YOK (ve yapılmamalı — gereksiz yere tüm test dosyalarını etkiler).
 */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    globals: false,
  },
});
