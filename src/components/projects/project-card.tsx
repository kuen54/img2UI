'use client'

import * as React from 'react'
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
  const [imgFailed, setImgFailed] = React.useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirm({
      title: `删除项目「${project.name}」?`,
      description: '会级联删除该项目下所有页面、设计稿、元素和资产数据。不可撤销。',
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

  const showImg = project.sample_thumbnail_url && !imgFailed

  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card className="hover:bg-muted/30 transition-colors cursor-pointer relative h-full overflow-hidden">
        <div className="aspect-[4/3] bg-muted/40 flex items-center justify-center">
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element -- 服务于 /api/thumbs 的小尺寸缩略图,不走 next/image 优化
            <img
              src={project.sample_thumbnail_url}
              alt={project.name}
              className="w-full h-full object-contain"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div data-testid="project-thumbnail-fallback" className="text-muted-foreground">
              <Folder className="size-12" />
            </div>
          )}
        </div>
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
