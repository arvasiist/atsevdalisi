/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo paket paylaşımı için (packages/shared-types, packages/game-config
  // — Faz 6 "Config ayrımı" bu turda EKLENDİ, apps/web'in İLK KEZ tükettiği
  // config paketi, bkz. camera-director.ts'in doc yorumu).
  transpilePackages: ['@at-sevdalisi/shared-types', '@at-sevdalisi/game-config'],
};

export default nextConfig;
