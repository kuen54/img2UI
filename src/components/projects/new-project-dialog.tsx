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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { createProjectApi } from '@/lib/api/projects-client'
import type { Project } from '@/lib/types'

export type NewProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (project: Project) => void
}

export function NewProjectDialog({ open, onOpenChange, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [techStackHint, setTechStackHint] = useState('')
  const [creating, setCreating] = useState(false)

  const reset = () => {
    setName('')
    setDescription('')
    setTechStackHint('')
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('项目名必填')
      return
    }
    setCreating(true)
    try {
      const project = await createProjectApi({
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        ...(techStackHint.trim() && { tech_stack_hint: techStackHint.trim() }),
      })
      toast.success(`已创建「${project.name}」`)
      reset()
      onOpenChange(false)
      onCreated(project)
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
          <DialogTitle>新建项目</DialogTitle>
          <DialogDescription>项目是「业务交付」的容器,共享 CDN 配置和 coding agent 提示语。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">项目名 *</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例:奶茶盲盒抽奖活动"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-desc">描述(可选)</Label>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话描述业务场景"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-stack">技术栈 hint(可选)</Label>
            <Input
              id="project-stack"
              value={techStackHint}
              onChange={(e) => setTechStackHint(e.target.value)}
              placeholder="Next.js + Tailwind + shadcn"
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
