'use client'

import { ThemeProvider, useColorScheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Toaster } from 'sonner'
import { theme } from '@/theme'

/** sonner 不在 MUI 体系里,toast 配色要手动跟随当前 scheme */
function ThemedToaster(): React.ReactElement {
  const { mode, systemMode } = useColorScheme()
  const resolved = mode === 'system' ? systemMode : mode
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      theme={resolved === 'dark' ? 'dark' : 'light'}
    />
  )
}

export function ClientProviders({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      {children}
      <ThemedToaster />
    </ThemeProvider>
  )
}
