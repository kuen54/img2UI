'use client'

import { useState } from 'react'
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
import { createPageApi } from '@/lib/api/projects-client'
import type { Page } from '@/lib/types'

export type NewPageDialogProps = {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (page: Page) => void
}

export function NewPageDialog({ projectId, open, onOpenChange, onCreated }: NewPageDialogProps) {
  const [name, setName] = useState('')
  const [routeHint, setRouteHint] = useState('')
  const [creating, setCreating] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      toast.error('页面名必填')
      return
    }
    setCreating(true)
    try {
      const page = await createPageApi(projectId, {
        name: name.trim(),
        ...(routeHint.trim() && { route_hint: routeHint.trim() }),
      })
      toast.success(`已创建「${page.name}」`)
      setName('')
      setRouteHint('')
      onOpenChange(false)
      onCreated(page)
    } catch (e) {
      toast.error('创建失败:' + (e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建页面</DialogTitle>
          <DialogDescription>页面对应一个独立的 UI 单元(路由)。后续上传 N 张状态图(canonical / hover / empty 等)。</DialogDescription>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={creating || !name.trim()}>
            {creating ? '创建中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
