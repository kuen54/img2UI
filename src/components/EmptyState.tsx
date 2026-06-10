'use client'

import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export interface EmptyStateProps {
  /** MUI icon 节点,例如 <ImageOutlinedIcon /> */
  icon: ReactNode
  title: string
  description?: string
  /** 引导动作,通常是一个 Button */
  action?: ReactNode
  /**
   * compact:卡片内 placeholder(小 icon、无圆底背景、单行);
   * full:整页空状态(56px 圆底 icon + 标题 + 描述 + action)
   */
  variant?: 'full' | 'compact'
}

/**
 * 统一空状态/占位符。替换散落各页的「(无设计稿)」灰字和极简 EmptyInline。
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'full',
}: EmptyStateProps): React.ReactElement {
  if (variant === 'compact') {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        spacing={0.75}
        sx={{ height: '100%', color: 'text.disabled' }}
      >
        <Box sx={{ '& svg': { fontSize: 28, width: 28, height: 28, display: 'block' } }}>{icon}</Box>
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {title}
        </Typography>
      </Stack>
    )
  }
  return (
    <Stack alignItems="center" spacing={2} sx={{ py: 8, textAlign: 'center' }}>
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // 单色系:空状态是装饰位,icon 圆底用中性灰而非品牌蓝
          bgcolor: 'surface.containerHigh',
          color: 'text.secondary',
          '& svg': { fontSize: 28, width: 28, height: 28 },
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="h5">{title}</Typography>
        {description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.75, maxWidth: 420 }}
          >
            {description}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Stack>
  )
}
