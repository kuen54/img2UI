'use client'

import { useState } from 'react'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { uploadStatesApi, triggerPass1Api } from '@/lib/api/projects-client'
import type { State } from '@/lib/types'

type Row = {
  file: File
  name: string
  is_canonical: boolean
}

export type UploadStatesDialogProps = {
  pageId: string
  /** 该 page 是否已有 canonical(影响默认 is_canonical 选择) */
  hasCanonical: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: (states: State[]) => void
}

const stripExt = (filename: string): string => filename.replace(/\.[^.]+$/, '')

export function UploadStatesDialog({
  pageId,
  hasCanonical,
  open,
  onOpenChange,
  onUploaded,
}: UploadStatesDialogProps) {
  const [rows, setRows] = useState<Row[]>([])
  const [uploading, setUploading] = useState(false)

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const newRows: Row[] = files.map((f, i) => ({
      file: f,
      name: stripExt(f.name) || `state_${rows.length + i + 1}`,
      // 第一个文件且 page 还没 canonical → 默认 canonical
      is_canonical: !hasCanonical && rows.length === 0 && i === 0,
    }))
    setRows([...rows, ...newRows])
    // 重置 input value 以便再次选同一文件能触发
    e.target.value = ''
  }

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((curr) =>
      curr.map((r, i) => {
        if (i !== idx) return r
        return { ...r, ...patch }
      }),
    )
  }

  const setCanonical = (idx: number) => {
    // 只能一个 canonical
    setRows((curr) => curr.map((r, i) => ({ ...r, is_canonical: i === idx })))
  }

  const removeRow = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx))
  }

  const reset = () => {
    setRows([])
  }

  const submit = async () => {
    if (rows.length === 0) return
    setUploading(true)
    try {
      const result = await uploadStatesApi(pageId, rows)
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          toast.error(`${err.filename}: ${err.error}`)
        }
      }
      if (result.created.length > 0) {
        toast.success(`已上传 ${result.created.length} 张,布局分析中…`)
        // fire-and-forget:不 await,让 dialog 立即关闭、详情页立即看到 pass1_running
        for (const s of result.created) {
          void triggerPass1Api(s.id).catch((e) => {
            toast.error(`Pass 1 触发失败 (${s.name}):` + (e as Error).message)
          })
        }
        onUploaded(result.created)
      }
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error('上传失败:' + (e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !uploading) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>上传设计稿</DialogTitle>
          <DialogDescription>
            选 N 张 PNG 设计稿。每张填一个交互状态名(canonical / hover / empty 等),指定其中一张为 canonical(主参考)。
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <label
            htmlFor="state-files"
            className="border-2 border-dashed rounded-lg py-12 px-6 text-center cursor-pointer hover:bg-muted/30 transition-colors block"
          >
            <Upload className="size-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">点击选择 PNG 文件</p>
            <p className="text-xs text-muted-foreground mt-1">支持多选;只接受 PNG 格式</p>
            <input
              id="state-files"
              type="file"
              accept="image/png"
              multiple
              className="hidden"
              onChange={onFilesPicked}
            />
          </label>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {rows.map((row, idx) => (
              <div key={idx} className="flex items-start gap-3 border rounded-md p-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-xs text-muted-foreground font-mono truncate">{row.file.name}</p>
                  <div className="space-y-1.5">
                    <Label htmlFor={`state-name-${idx}`} className="text-xs">状态名</Label>
                    <Input
                      id={`state-name-${idx}`}
                      value={row.name}
                      onChange={(e) => updateRow(idx, { name: e.target.value })}
                      placeholder="canonical / hover / empty"
                      className="h-8 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="canonical"
                      checked={row.is_canonical}
                      onChange={() => setCanonical(idx)}
                    />
                    设为 canonical(主参考)
                  </label>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeRow(idx)} disabled={uploading}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <label
              htmlFor="state-files-more"
              className="text-xs text-primary cursor-pointer hover:underline inline-block"
            >
              + 再加几张
              <input
                id="state-files-more"
                type="file"
                accept="image/png"
                multiple
                className="hidden"
                onChange={onFilesPicked}
              />
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={uploading || rows.length === 0}>
            {uploading ? '上传中…' : `上传 ${rows.length} 张`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
