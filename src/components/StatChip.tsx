'use client'

import type { ReactNode } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export interface StatChipProps {
  /** MUI icon 节点(16/14px 由 size 控制) */
  icon?: ReactNode
  /** 数字/主值,加重显示 */
  value: string | number
  /** 轻量 label,跟在数字后 */
  label?: string
  /** 数字颜色语义(如完成态 success.main),默认 text.primary */
  valueColor?: string
  size?: 'medium' | 'small'
}

/**
 * 内联统计项:`icon + 600 weight 数字 + secondary label`。
 * 替换各页 body2 secondary 用「·」串起来的 meta 行,拉开信息层级。
 */
export function StatChip({
  icon,
  value,
  label,
  valueColor = 'text.primary',
  size = 'medium',
}: StatChipProps): React.ReactElement {
  const small = size === 'small'
  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems="center"
      sx={{ minWidth: 0, flexShrink: 0 }}
    >
      {icon && (
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{
            color: 'text.disabled',
            '& svg': { fontSize: small ? 14 : 16, display: 'block' },
          }}
        >
          {icon}
        </Stack>
      )}
      <Typography
        component="span"
        sx={{
          fontSize: small ? '0.75rem' : '0.875rem',
          fontWeight: 600,
          lineHeight: 1.4,
          color: valueColor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      {label && (
        <Typography
          component="span"
          sx={{
            fontSize: small ? '0.75rem' : '0.8125rem',
            color: 'text.secondary',
            lineHeight: 1.4,
          }}
          noWrap
        >
          {label}
        </Typography>
      )}
    </Stack>
  )
}
