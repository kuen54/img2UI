'use client'

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// =============================================================================
// StickySaveBar:固定在底部的保存条,有改动时显示
//
// 用法:
//   <StickySaveBar
//     dirty={JSON.stringify(draft) !== JSON.stringify(saved)}
//     saving={saving}
//     onSave={async () => { ... }}
//     onCancel={() => setDraft(saved)}
//   />
// =============================================================================

export type StickySaveBarProps = {
  dirty: boolean
  saving: boolean
  onSave: () => void | Promise<void>
  onCancel: () => void
  /** 默认「保存」 */
  saveText?: string
  /** 默认「撤销改动」 */
  cancelText?: string
  /** 自定义 dirty 提示文案 */
  dirtyText?: string
}

export function StickySaveBar({
  dirty,
  saving,
  onSave,
  onCancel,
  saveText = '保存',
  cancelText = '撤销改动',
  dirtyText = '有未保存的改动',
}: StickySaveBarProps) {
  if (!dirty && !saving) return null

  return (
    <div
      className={cn(
        'sticky bottom-0 left-0 right-0 z-30',
        'border-t bg-background/95 backdrop-blur',
        'px-6 py-3 flex items-center justify-between gap-4',
        'shadow-[0_-2px_8px_rgba(0,0,0,0.04)]',
      )}
    >
      <span className="text-sm text-muted-foreground flex items-center gap-2">
        {saving && <Loader2 className="size-4 animate-spin" />}
        {saving ? '保存中…' : dirtyText}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          {cancelText}
        </Button>
        <Button size="sm" onClick={() => void onSave()} disabled={saving}>
          {saveText}
        </Button>
      </div>
    </div>
  )
}
