'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import { RotateCw as RefreshIcon, Home as HomeIcon, CircleAlert as ErrorOutlineIcon } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): React.ReactElement {
  useEffect(() => {
    // 给开发者用 — 生产时移到日志服务
    console.error('App error boundary:', error)
  }, [error])

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4,
      }}
    >
      <Card sx={{ maxWidth: 520, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Box sx={{ color: 'error.main', display: 'flex' }}>
              <ErrorOutlineIcon size={32} strokeWidth={1.75} />
            </Box>
            <Typography variant="h2" sx={{ m: 0 }}>
              出了点错
            </Typography>
          </Box>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
            页面渲染失败。一般是后台代码刚改完 / dev server HMR 中间态,刷新一下试试。
          </Typography>
          <Box
            sx={{
              p: 1.5,
              my: 2,
              bgcolor: 'surface.container',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'error.main',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.message}
            {error.digest ? `\ndigest: ${error.digest}` : ''}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button variant="contained" startIcon={<RefreshIcon />} onClick={reset}>
              重试
            </Button>
            <Button variant="outlined" component={Link} href="/" startIcon={<HomeIcon />}>
              回首页
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
