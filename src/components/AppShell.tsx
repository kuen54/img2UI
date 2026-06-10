'use client'

import Link from 'next/link'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import HomeIcon from '@mui/icons-material/Home'
import SettingsIcon from '@mui/icons-material/Settings'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export function AppShell({
  breadcrumbs,
  children,
  rightAction,
  onNavigate,
}: {
  breadcrumbs?: BreadcrumbItem[]
  children: React.ReactNode
  rightAction?: React.ReactNode
  /**
   * 导航守卫:返回 false 阻止本次面包屑 / 首页 / 设置链接跳转。
   * 用于 dirty 页面(Element Review 等)弹「未保存」确认。
   * 注:Link 是客户端导航,beforeunload 拦不住,必须在 click 层拦。
   */
  onNavigate?: () => boolean
}): React.ReactElement {
  const guardClick = (e: React.MouseEvent): void => {
    if (onNavigate && !onNavigate()) e.preventDefault()
  }
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky">
        <Toolbar>
          <IconButton
            component={Link}
            href="/"
            edge="start"
            sx={{ mr: 2 }}
            aria-label="回首页"
            onClick={guardClick}
          >
            <HomeIcon />
          </IconButton>
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <Breadcrumbs sx={{ flexGrow: 1 }} separator="›">
              {breadcrumbs.map((b, i) => {
                const isLast = i === breadcrumbs.length - 1
                if (isLast || !b.href) {
                  return (
                    <Typography
                      key={i}
                      color={isLast ? 'text.primary' : 'text.secondary'}
                      sx={{ fontWeight: isLast ? 600 : 400 }}
                    >
                      {b.label}
                    </Typography>
                  )
                }
                return (
                  <Typography
                    key={i}
                    component={Link}
                    href={b.href}
                    onClick={guardClick}
                    sx={{
                      color: 'text.secondary',
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    {b.label}
                  </Typography>
                )
              })}
            </Breadcrumbs>
          ) : (
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
              img2UI
            </Typography>
          )}
          {rightAction}
          <IconButton
            component={Link}
            href="/settings/providers"
            edge="end"
            aria-label="设置"
            onClick={guardClick}
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      {children}
    </Box>
  )
}
