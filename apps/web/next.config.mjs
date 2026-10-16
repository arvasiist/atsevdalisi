/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo paket paylaşımı için (packages/shared-types, packages/game-config
  // — Faz 6 "Config ayrımı" bu turda EKLENDİ, apps/web'in İLK KEZ tükettiği
  // config paketi, bkz. camera-director.ts'in doc yorumu).
  transpilePackages: ['@at-sevdalisi/shared-types', '@at-sevdalisi/game-config'],
  // 02.10.2026 (Faz 13-A) — uygulama `next/image` KULLANMAZ; görüntü
  // optimizasyon ucu kapalı tutulur (gereksiz saldırı yüzeyi). Next 14'ün
  // bu uçtaki kritik açıkları Next 16 yükseltmesiyle (13-B.2) kapandı.
  // `next/image` eklenirse bu satırı yeniden düşün.
  images: { unoptimized: true },
};

export default nextConfig;
