'use client'

import { useState, type ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'

export interface FormDialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** 标题下一行的说明文字(body2 / text.secondary) */
  description?: ReactNode
  /**
   * 表单字段,调用方自己放 TextField(字段间距由调用方 children 内 Stack 管)。
   * submitting 期间整体包在 <fieldset disabled> 里,原生 input/button 自动禁用;
   * 非原生控件(如 UploadDropzone 的 drop 区)用 render-prop 形式拿 submitting 自己处理。
   */
  children: ReactNode | ((submitting: boolean) => ReactNode)
  submitLabel: string
  /** 提交进行中的按钮文案,默认 `${submitLabel}中…` */
  submittingLabel?: string
  /**
   * 异步提交:resolve 后自动关闭 Dialog;reject 时保持打开
   * (错误 toast 由调用方在 onSubmit 内做,reject 只用来阻止关闭)
   */
  onSubmit: () => Promise<void>
  submitDisabled?: boolean
  maxWidth?: 'xs' | 'sm' | 'md'
  cancelLabel?: string
}

/**
 * 表单对话框基件:统一新建/编辑类表单的视觉与行为。
 * - content + actions 包在 <form> 里,主按钮 type="submit" → 单行 TextField 上按 Enter 即提交
 * - IME 组词时按 Enter 是确认候选词,不触发提交(isComposing / keyCode 229)
 * - submitting 内部管理:spinner + submittingLabel + 双按钮禁用 + 防重复提交 + 禁止关闭
 */
export function FormDialog({
  open,
  onClose,
  title,
  description,
  children,
  submitLabel,
  submittingLabel,
  onSubmit,
  submitDisabled = false,
  maxWidth = 'xs',
  cancelLabel = '取消',
}: FormDialogProps): React.ReactElement {
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (submitting || submitDisabled) return
    setSubmitting(true)
    void (async () => {
      try {
        await onSubmit()
        onClose()
      } catch {
        // reject = 提交失败:保持 Dialog 打开,错误提示由调用方负责
      } finally {
        setSubmitting(false)
      }
    })()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>): void => {
    // 中文输入法组词中按 Enter 是确认候选词,不是提交。
    // Safari 在 compositionend 后的那次 keydown isComposing 已是 false
    // 但 keyCode 仍为 229,两个条件都要拦。
    if (
      e.key === 'Enter' &&
      (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)
    ) {
      e.preventDefault()
    }
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth={maxWidth}
      fullWidth
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
          {/* mt 给 TextField 浮动 label 留空间(DialogTitle 会吃掉 content 的 paddingTop) */}
          {/* fieldset:submitting 期间原生禁用 children 里所有 input/button,
              防两阶段提交(创建→上传)在途时改字段产生 UI 与结果背离 */}
          <Box
            component="fieldset"
            disabled={submitting}
            sx={{ border: 0, p: 0, m: 0, minWidth: 0, mt: description ? 2 : 1 }}
          >
            {typeof children === 'function' ? children(submitting) : children}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || submitDisabled}
            startIcon={
              submitting ? <CircularProgress size={14} color="inherit" /> : undefined
            }
          >
            {submitting ? (submittingLabel ?? `${submitLabel}中…`) : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
