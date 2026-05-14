'use client'

import * as React from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// =============================================================================
// useConfirm:Promise-based 确认对话框
//
// 用法:
//   const confirm = useConfirm()
//   const ok = await confirm({
//     title: '删除 provider「OpenAI mllm」?',
//     description: '此操作不可撤销。',
//     confirmText: '删除',
//     destructive: true,
//   })
//   if (!ok) return
//
// 必须在 <ConfirmProvider> 内才能用(默认在 RootLayout 已挂)
// =============================================================================

export type ConfirmOptions = {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}

type ConfirmState = ConfirmOptions & {
  open: boolean
  resolve: (ok: boolean) => void
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState | null>(null)

  const confirm = React.useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, open: true, resolve })
    })
  }, [])

  const close = (result: boolean) => {
    setState((prev) => {
      if (!prev) return null
      prev.resolve(result)
      return { ...prev, open: false }
    })
    // 让动画跑完再清理 state
    setTimeout(() => setState(null), 200)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={state?.open ?? false} onOpenChange={(open) => !open && close(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state?.title ?? ''}</DialogTitle>
            {state?.description && (
              <DialogDescription>{state.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {state?.cancelText ?? '取消'}
            </Button>
            <Button
              variant={state?.destructive ? 'destructive' : 'default'}
              onClick={() => close(true)}
            >
              {state?.confirmText ?? '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm 必须在 <ConfirmProvider> 内使用(检查 layout.tsx)')
  }
  return ctx
}
