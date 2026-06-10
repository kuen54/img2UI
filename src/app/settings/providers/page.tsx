import { Suspense } from 'react'
import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import { ProvidersClient } from './ProvidersClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Providers' }

export default function ProvidersPage(): React.ReactElement {
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Suspense fallback={null}>
        <ProvidersClient />
      </Suspense>
    </Box>
  )
}
