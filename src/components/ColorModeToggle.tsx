'use client'

import { useEffect, useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useColorScheme } from '@mui/material/styles'
import { Sun, Moon } from 'lucide-react'

/**
 * 浅色/深色切换。初始跟随系统(defaultMode="system"),点一下即固定为
 * 显式 light/dark(MUI 持久化到 localStorage 的 mui-mode)。
 * mounted 之前渲染占位:mode 来自 localStorage,SSR 拿不到,直接渲染图标
 * 会 hydration mismatch。
 */
export function ColorModeToggle(): React.ReactElement {
  const { mode, systemMode, setMode } = useColorScheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const resolved = mode === 'system' ? systemMode : mode
  const dark = resolved === 'dark'
  return (
    <Tooltip title={mounted ? (dark ? '切到浅色' : '切到深色') : ''}>
      <IconButton
        aria-label="切换配色"
        onClick={() => setMode(dark ? 'light' : 'dark')}
      >
        {!mounted ? (
          // 占位:不画具体图标,避免与客户端解析出的 mode 不一致
          <span style={{ width: 18, height: 18 }} />
        ) : dark ? (
          <Sun size={18} />
        ) : (
          <Moon size={18} />
        )}
      </IconButton>
    </Tooltip>
  )
}
