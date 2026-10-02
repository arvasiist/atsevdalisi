/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo paket paylaşımı için (packages/shared-types, packages/game-config
  // — Faz 6 "Config ayrımı" bu turda EKLENDİ, apps/web'in İLK KEZ tükettiği
  // config paketi, bkz. camera-director.ts'in doc yorumu).
  transpilePackages: ['@at-sevdalisi/shared-types', '@at-sevdalisi/game-config'],
  // 02.10.2026 (Faz 13-A) — uygulama `next/image` KULLANMAZ. Görüntü
  // optimizasyon ucu (`/_next/image`) Next 14'te kritik açıklar taşır
  // (GHSA-2xp9-vwfh-vxw4 uzaktan kod çalıştırma, GHSA-h64f-5h5j-jqjh DoS);
  // düzeltme yalnızca Next 16'da. Ucu kapatmak yükseltmeye kadar saldırı
  // yüzeyini kaldırır. `next/image` eklenirse bu satırı yeniden düşün.
  images: { unoptimized: true },
};

export default nextConfig;
