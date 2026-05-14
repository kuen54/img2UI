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
import { createPageApi, uploadStatesApi, triggerPass1Api } from '@/lib/api/projects-client'
import type { Page } from '@/lib/types'

export type NewPageDialogProps = {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (page: Page) => void
}

type UploadRow = {
  file: File
  name: string
  is_canonical: boolean
}

const stripExt = (filename: string): string => filename.replace(/\.[^.]+$/, '')

export function NewPageDialog({ projectId, open, onOpenChange, onCreated }: NewPageDialogProps) {
  const [name, setName] = useState('')
  const [routeHint, setRouteHint] = useState('')
  const [rows, setRows] = useState<UploadRow[]>([])
  const [creating, setCreating] = useState(false)

  const reset = () => {
    setName('')
    setRouteHint('')
    setRows([])
  }

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const newRows: UploadRow[] = files.map((f, i) => ({
      file: f,
      name: stripExt(f.name) || `state_${rows.length + i + 1}`,
      // 第一张默认 canonical(若当前一张都没有)
      is_canonical: rows.length === 0 && i === 0,
    }))
    setRows([...rows, ...newRows])
    e.target.value = ''
  }

  const updateRow = (idx: number, patch: Partial<UploadRow>) => {
    setRows((curr) => curr.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const setCanonical = (idx: number) => {
    setRows((curr) => curr.map((r, i) => ({ ...r, is_canonical: i === idx })))
  }

  const removeRow = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx))
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('页面名必填')
      return
    }
    setCreating(true)
    try {
      // 1. 创建 page
      const page = await createPageApi(projectId, {
        name: name.trim(),
        ...(routeHint.trim() && { route_hint: routeHint.trim() }),
      })

      // 2. 如果选了文件,立即上传 + 触发 Pass 1
      if (rows.length > 0) {
        const result = await uploadStatesApi(page.id, rows)
        if (result.errors.length > 0) {
          for (const err of result.errors) {
            toast.error(`${err.filename}: ${err.error}`)
          }
        }
        if (result.created.length > 0) {
          // fire-and-forget:不 await,让 dialog 立即关闭、详情页立即看到 pass1_running
          for (const s of result.created) {
            void triggerPass1Api(s.id).catch((e) => {
              toast.error(`Pass 1 触发失败 (${s.name}):` + (e as Error).message)
            })
          }
          toast.success(`已创建「${page.name}」+ 上传 ${result.created.length} 张,布局分析中…`)
        } else {
          toast.success(`已创建「${page.name}」(没有有效文件,可在详情页继续上传)`)
        }
      } else {
        toast.success(`已创建「${page.name}」`)
      }

      reset()
      onOpenChange(false)
      onCreated(page)
    } catch (e) {
      toast.error('创建失败:' + (e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !creating) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建页面</DialogTitle>
          <DialogDescription>页面对应一个独立的 UI 单元(路由)。同时可上传 N 张设计稿(canonical / hover / empty 等不同交互状态),创建完成后自动跑 Pass 1 布局分析。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="page-name">页面名 *</Label>
            <Input
              id="page-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例:抽中页"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-route">路由 hint(可选)</Label>
            <Input
              id="page-route"
              value={routeHint}
              onChange={(e) => setRouteHint(e.target.value)}
              placeholder="/lottery/result"
              className="font-mono text-sm"
            />
          </div>

          {/* 设计稿上传区(可选) */}
          <div className="space-y-2">
            <Label>设计稿(可选,后续也能在详情页继续上传)</Label>
            {rows.length === 0 ? (
              <label
                htmlFor="new-page-files"
                className="border-2 border-dashed rounded-lg py-8 px-6 text-center cursor-pointer hover:bg-muted/30 transition-colors block"
              >
                <Upload className="size-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">点击选择 PNG 文件</p>
                <p className="text-xs text-muted-foreground mt-1">支持多选;只接受 PNG 格式</p>
                <input
                  id="new-page-files"
                  type="file"
                  accept="image/png"
                  multiple
                  className="hidden"
                  onChange={onFilesPicked}
                />
              </label>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {rows.map((row, idx) => (
                  <div key={idx} className="flex items-start gap-3 border rounded-md p-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-xs text-muted-foreground font-mono truncate">{row.file.name}</p>
                      <div className="space-y-1">
                        <Label htmlFor={`new-page-state-name-${idx}`} className="text-xs">状态名</Label>
                        <Input
                          id={`new-page-state-name-${idx}`}
                          value={row.name}
                          onChange={(e) => updateRow(idx, { name: e.target.value })}
                          placeholder="canonical / hover / empty"
                          className="h-8 text-sm"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="new-page-canonical"
                          checked={row.is_canonical}
                          onChange={() => setCanonical(idx)}
                        />
                        设为 canonical(主参考)
                      </label>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeRow(idx)} disabled={creating}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <label
                  htmlFor="new-page-files-more"
                  className="text-xs text-primary cursor-pointer hover:underline inline-block"
                >
                  + 再加几张
                  <input
                    id="new-page-files-more"
                    type="file"
                    accept="image/png"
                    multiple
                    className="hidden"
                    onChange={onFilesPicked}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={creating || !name.trim()}>
            {creating
              ? '创建中…'
              : rows.length > 0
                ? `创建并上传 ${rows.length} 张`
                : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
