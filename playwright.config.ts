import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,  // 单进程串行,避免 data/ 目录竞争
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'next dev -p 3001',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
