'use client'

import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Toaster } from 'sonner'
import { theme } from '@/theme'

export function ClientProviders({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  )
}
