'use client'

import Box from '@mui/material/Box'
import { keyframes } from '@emotion/react'

const pulse = keyframes`
  from { opacity: 0.45 }
  to { opacity: 1 }
`

export type StatusDotKind = 'idle' | 'running' | 'completed' | 'failed'

interface StatusDotProps {
  status: StatusDotKind
  size?: number
}

const COLOR_MAP: Record<StatusDotKind, string> = {
  idle: 'text.disabled',
  running: 'info.main',
  completed: 'success.main',
  failed: 'error.main',
}

export function StatusDot({ status, size = 8 }: StatusDotProps): React.ReactElement {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: COLOR_MAP[status],
        flexShrink: 0,
        ...(status === 'running'
          ? { animation: `${pulse} 1.1s ease-in-out infinite alternate` }
          : {}),
      }}
    />
  )
}
