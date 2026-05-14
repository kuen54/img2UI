'use client'

import * as React from 'react'
import Link from 'next/link'
import { Trash2, FileText } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { deletePageApi } from '@/lib/api/projects-client'
import type { Page } from '@/lib/types'

export type PageCardProps = {
  page: Page
  projectId: string
  onDeleted: (id: string) => void
}

export function PageCard({ page, projectId, onDeleted }: PageCardProps) {
  const confirm = useConfirm()
  const [imgFailed, setImgFailed] = React.useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirm({
      title: `删除页面「${page.name}」?`,
      description: '会级联删除该页面下所有设计稿。不可撤销。',
      confirmText: '删除',
      destructive: true,
    })
    if (!ok) return
    try {
      await deletePageApi(page.id)
      toast.success('已删除')
      onDeleted(page.id)
    } catch (err) {
      toast.error('删除失败:' + (err as Error).message)
    }
  }

  const showImg = page.thumbnail_url && !imgFailed

  return (
    <Link href={`/projects/${projectId}/pages/${page.id}`} className="block">
      <Card className="hover:bg-muted/30 transition-colors cursor-pointer h-full overflow-hidden">
        <div className="aspect-[4/3] bg-muted/40 flex items-center justify-center">
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element -- 服务于 /api/thumbs 的小尺寸缩略图,不走 next/image 优化
            <img
              src={page.thumbnail_url}
              alt={page.name}
              className="w-full h-full object-contain"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div data-testid="page-thumbnail-fallback" className="text-muted-foreground">
              <FileText className="size-12" />
            </div>
          )}
        </div>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex-1 min-w-0 space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{page.name}</span>
            </CardTitle>
            {page.route_hint && (
              <p className="text-xs text-muted-foreground font-mono truncate">{page.route_hint}</p>
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
          <p className="text-xs text-muted-foreground">
            创建:{new Date(page.created_at).toLocaleDateString('zh-CN')}
          </p>
          {!page.canonical_state_id && (
            <p className="text-xs text-amber-600 mt-1">尚未上传设计稿</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
