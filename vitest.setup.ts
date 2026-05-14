import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// React Testing Library 不再自动 cleanup(vitest 不像 jest 全局 afterEach)
afterEach(() => {
  cleanup()
})
