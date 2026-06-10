'use client'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

/** 单个 <kbd> 胶囊:浅灰底 + hairline 边 + monospace */
export function Kbd({ children }: { children: string }): React.ReactElement {
  return (
    <Box
      component="kbd"
      sx={{
        display: 'inline-block',
        px: 0.75,
        py: 0,
        minWidth: 20,
        textAlign: 'center',
        fontSize: '0.6875rem',
        lineHeight: '18px',
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
        color: 'text.secondary',
        bgcolor: 'surface.container',
        border: '1px solid',
        borderColor: 'surface.outlineVariant',
        borderBottomWidth: 2,
        borderRadius: '4px',
      }}
    >
      {children}
    </Box>
  )
}

export interface KbdHintItem {
  /** 快捷键序列,如 ['⌘', 'S'] 或 ['Enter'] */
  keys: string[]
  label: string
}

/**
 * 一行快捷键提示:`[↑][↓] 切换 · [⏎] 确认 · …`。
 * 替换纯文本提示行,在侧栏底部 / Popover 里复用。
 */
export function KbdHintRow({
  items,
  wrap = false,
}: {
  items: KbdHintItem[]
  wrap?: boolean
}): React.ReactElement {
  return (
    <Stack
      direction="row"
      useFlexGap
      columnGap={1.5}
      rowGap={0.75}
      alignItems="center"
      sx={{ flexWrap: wrap ? 'wrap' : 'nowrap', minWidth: 0 }}
    >
      {items.map((item, i) => (
        <Stack key={i} direction="row" spacing={0.5} alignItems="center">
          <Stack direction="row" spacing={0.25}>
            {item.keys.map((k, j) => (
              <Kbd key={j}>{k}</Kbd>
            ))}
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
            {item.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  )
}
