/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo paket paylaşımı için (packages/shared-types).
  transpilePackages: ['@at-sevdalisi/shared-types'],
};

export default nextConfig;
