'use client'

import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'

/**
 * dirty 页面拦截导航后的三选确认:保存并离开 / 不保存离开 / 取消。
 * 替代原生 window.confirm(风格统一 + 提供「保存并离开」捷径)。
 * 三个动作统一放 DialogActions:「不保存离开」(error text)推到最左,
 * 「取消」+「保存并离开」(主按钮)在右。
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

  const handleSaveAndLeave = async (): Promise<void> => {
    setSaving(true)
    try {
      const ok = await onSave()
      if (ok && href) onNavigate(href)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={!!href}
      onClose={saving ? undefined : onClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>有未保存的修改</DialogTitle>
      <DialogContent>
        <DialogContentText>
          离开前要保存这些修改吗?不保存会丢失本次所有调整。
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          color="error"
          disabled={saving}
          onClick={() => {
            const target = href
            onClose()
            if (target) onNavigate(target)
          }}
          sx={{ mr: 'auto' }}
        >
          不保存离开
        </Button>
        <Button onClick={onClose} disabled={saving}>
          取消
        </Button>
        <Button
          variant="contained"
          disabled={saving}
          onClick={() => void handleSaveAndLeave()}
          startIcon={
            saving ? <CircularProgress size={14} color="inherit" /> : undefined
          }
        >
          {saving ? '保存中…' : '保存并离开'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
