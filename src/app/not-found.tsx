import Link from 'next/link'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { Home as HomeIcon } from 'lucide-react'

export default function NotFound(): React.ReactElement {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        p: 4,
        textAlign: 'center',
      }}
    >
      <Typography variant="h1" sx={{ fontSize: 64, color: 'text.disabled' }}>
        404
      </Typography>
      <Typography variant="h3" sx={{ mb: 1 }}>
        页面找不到
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
        URL 不存在,或者你访问的项目 / 页面已经被删了。
      </Typography>
      <Button variant="contained" component={Link} href="/" startIcon={<HomeIcon />}>
        回首页
      </Button>
    </Box>
  )
}
