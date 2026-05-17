import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // localhost-only tool; no remote image domains
  images: { unoptimized: true },
  // CSRF gate is in middleware.ts; no need for additional rewrites
}

export default nextConfig
