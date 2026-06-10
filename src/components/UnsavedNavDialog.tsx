'use client'

import { useState } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * dirty 页面拦截导航后的三选确认:保存并离开 / 不保存离开 / 取消。
 * 替代原生 window.confirm(风格统一 + 提供「保存并离开」捷径)。
 */
export function UnsavedNavDialog({
  href,
  onClose,
  onSave,
  onNavigate,
}: {
  /** 被拦下的导航目标;null = 关闭 */
  href: string | null
  onClose: () => void
  /** 返回是否保存成功 */
  onSave: () => Promise<boolean>
  onNavigate: (href: string) => void
}): React.ReactElement {
  const [saving, setSaving] = useState(false)
  return (
    <ConfirmDialog
      open={!!href}
      onClose={onClose}
      title="有未保存的修改"
      body={
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            离开前要保存这些修改吗?不保存会丢失本次所有调整。
          </Typography>
          <Button
            size="small"
            color="error"
            disabled={saving}
            onClick={() => {
              const target = href
              onClose()
              if (target) onNavigate(target)
            }}
            sx={{ alignSelf: 'flex-start' }}
          >
            不保存,直接离开
          </Button>
        </Stack>
      }
      confirmLabel="保存并离开"
      onConfirm={async () => {
        setSaving(true)
        try {
          const ok = await onSave()
          if (ok && href) onNavigate(href)
        } finally {
          setSaving(false)
        }
      }}
    />
  )
}
