'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { Plus, FileText } from 'lucide-react'
import { toast } from 'sonner'

import type { Page } from '@/lib/types'
import { listPagesApi } from '@/lib/api/projects-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageCard } from '@/components/projects/page-card'
import { NewPageDialog } from '@/components/projects/new-page-dialog'

type PageProps = { params: Promise<{ pid: string }> }

export default function ProjectDetailPage({ params }: PageProps) {
  const { pid } = use(params)
  const [pages, setPages] = useState<Page[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const list = await listPagesApi(pid)
      setPages(list)
    } catch (e) {
      toast.error('加载失败:' + (e as Error).message)
    }
  }, [pid])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  if (pages === null) {
    return <p className="p-6 text-sm text-muted-foreground">加载中…</p>
  }

  return (
    <div className="p-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">页面</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-1" />
          新建页面
        </Button>
      </div>
      {pages.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="暂无页面"
          description="新建一个页面来开始上传 AI 生图设计稿"
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4 mr-1" />
              新建页面
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pages.map((p) => (
            <PageCard
              key={p.id}
              page={p}
              projectId={pid}
              onDeleted={(id) => setPages(pages.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
      <NewPageDialog
        projectId={pid}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(page) => setPages([page, ...(pages ?? [])])}
      />
    </div>
  )
}
