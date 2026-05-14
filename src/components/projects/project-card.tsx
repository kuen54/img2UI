'use client'

import Link from 'next/link'
import { Trash2, Folder } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { deleteProjectApi } from '@/lib/api/projects-client'
import type { Project } from '@/lib/types'

export type ProjectCardProps = {
  project: Project
  onDeleted: (id: string) => void
}

export function ProjectCard({ project, onDeleted }: ProjectCardProps) {
  const confirm = useConfirm()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirm({
      title: `删除项目「${project.name}」?`,
      description: '会级联删除该项目下所有页面、状态图、元素和资产数据。不可撤销。',
      confirmText: '删除',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteProjectApi(project.id)
      toast.success('已删除')
      onDeleted(project.id)
    } catch (err) {
      toast.error('删除失败:' + (err as Error).message)
    }
  }

  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card className="hover:bg-muted/30 transition-colors cursor-pointer relative h-full">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex-1 min-w-0 space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{project.name}</span>
            </CardTitle>
            {project.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={(e) => void handleDelete(e)}
            title="删除"
          >
            <Trash2 className="size-4 text-red-500" />
          </Button>
        </CardHeader>
        <CardContent>
          {project.tech_stack_hint && (
            <p className="text-xs text-muted-foreground font-mono truncate">
              {project.tech_stack_hint}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            创建:{new Date(project.created_at).toLocaleDateString('zh-CN')}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
