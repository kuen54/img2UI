import { Suspense } from 'react'
import Box from '@mui/material/Box'
import { ProvidersClient } from './ProvidersClient'

export const dynamic = 'force-dynamic'

export default function ProvidersPage(): React.ReactElement {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Suspense fallback={null}>
        <ProvidersClient />
      </Suspense>
    </Box>
  )
}
