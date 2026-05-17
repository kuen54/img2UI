'use client'

import { useState, type ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** body 可以是字符串或 React 节点 */
  body: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: 'primary' | 'error' | 'warning' | 'success' | 'info' | 'inherit'
  /** 异步 onConfirm:执行期间禁用按钮 + 显示 spinner */
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmColor = 'primary',
  onConfirm,
}: ConfirmDialogProps): React.ReactElement {
  const [pending, setPending] = useState(false)

  const handle = async (): Promise<void> => {
    setPending(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {typeof body === 'string' ? (
          <DialogContentText>{body}</DialogContentText>
        ) : (
          body
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          onClick={() => void handle()}
          color={confirmColor}
          variant="contained"
          disabled={pending}
          startIcon={pending ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
