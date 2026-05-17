import { FlatCompat } from '@eslint/eslintrc'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({ baseDirectory: __dirname })

export default [
  ...compat.config({ extends: ['next/core-web-vitals', 'next/typescript'] }),
  {
    rules: {
      // Allow fetch-on-mount pattern in client components
      'react-hooks/set-state-in-effect': 'off',
      // Common during multi-phase build; tighten later
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  { ignores: ['poc/**', 'ref/**', 'data/**', '.next/**', 'node_modules/**'] },
]
