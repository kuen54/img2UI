import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'e2e/**'],
    // 默认 node 环境(lib 测试),tsx 组件测试通过文件内 `@vitest-environment jsdom` docblock 切换
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // 多个测试文件共享 data/ 目录,afterEach 清理会互相干扰 → 串行跑
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
