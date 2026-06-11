import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 回归套件(:3999)与日常 dev(:3000)并跑时必须隔离编译缓存:
  // 两个 dev server 共享 .next 会互相腐蚀 manifest,甚至 serve 旧源码编译的 stale chunk
  ...(process.env['IMG2UI_DIST_DIR'] ? { distDir: process.env['IMG2UI_DIST_DIR'] } : {}),
  // localhost-only tool; no remote image domains
  images: { unoptimized: true },
  // CSRF gate is in middleware.ts; no need for additional rewrites
}

export default nextConfig
