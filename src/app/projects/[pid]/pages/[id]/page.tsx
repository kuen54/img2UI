'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ChevronRight, Plus, Image as ImageIcon, ListChecks, Layers } from 'lucide-react'
import { toast } from 'sonner'

import type { Page, State } from '@/lib/types'
import { getPageApi, listStatesApi } from '@/lib/api/projects-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StateCard } from '@/components/pages/state-card'
import { UploadStatesDialog } from '@/components/pages/upload-states-dialog'
import { PipelineStepper } from '@/components/pages/pipeline-stepper'

type PageProps = { params: Promise<{ pid: string; id: string }> }

export default function PageDetailPage({ params }: PageProps) {
  const { pid, id: pageId } = use(params)

  const [page, setPage] = useState<Page | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([getPageApi(pageId), listStatesApi(pageId)])
      setPage(p)
      setStates(s)
    } catch (e) {
      toast.error('加载失败:' + (e as Error).message)
    }
  }, [pageId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll()
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [loadAll])

  // 任何 state 处于 running 时自动 2s 轮询
  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    const hasRunning = states.some(
      (s) =>
        s.pipeline_status === 'pass1_running' ||
        s.pipeline_status === 'pass2_running' ||
        s.pipeline_status === 'validating',
    )
    if (hasRunning) {
      pollTimerRef.current = setTimeout(() => {
        void listStatesApi(pageId).then(setStates).catch(() => {})
      }, 2000)
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [states, pageId])

  if (!page) {
    return <p className="p-6 text-sm text-muted-foreground">加载中…</p>
  }

  const canonicalId = page.canonical_state_id

  return (
    <div className="p-6 space-y-6">
      {/* 二级面包屑(项目级面包屑在 [pid]/layout.tsx 已有) */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground -mt-2">
        <Link href={`/projects/${pid}`} className="hover:text-foreground transition-colors">
          页面
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{page.name}</span>
      </nav>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{page.name}</h1>
        {page.route_hint && (
          <p className="text-sm text-muted-foreground font-mono">{page.route_hint}</p>
        )}
      </div>

      {/* Pipeline 进度 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Pipeline 进度</h2>
          {states.some((s) => ['pass1_done', 'pass2_running', 'pass2_done', 'validating', 'validated'].includes(s.pipeline_status)) && (
            <div className="flex items-center gap-2">
              <Link href={`/projects/${pid}/pages/${pageId}/elements`}>
                <Button size="sm" variant="outline">
                  <ListChecks className="size-3.5 mr-1" />
                  Element Review
                </Button>
              </Link>
              <Link href={`/projects/${pid}/pages/${pageId}/assets`}>
                <Button size="sm" variant="outline">
                  <Layers className="size-3.5 mr-1" />
                  Asset Review
                </Button>
              </Link>
            </div>
          )}
        </div>
        <PipelineStepper states={states} />
      </section>

      {/* States 区 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">状态图({states.length})</h2>
          {states.length > 0 && (
            <Button onClick={() => setUploadOpen(true)} size="sm">
              <Plus className="size-3.5 mr-1" />
              上传状态图
            </Button>
          )}
        </div>

        {states.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="暂无状态图"
            description="上传 1-N 张同页面不同状态的设计稿(canonical / hover / empty 等),系统会自动跑 Pass 1 布局分析"
            action={
              <Button onClick={() => setUploadOpen(true)}>
                <Plus className="size-4 mr-1" />
                上传状态图
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {states.map((s) => (
              <StateCard
                key={s.id}
                state={s}
                isCanonical={s.id === canonicalId}
                onDeleted={(id) => {
                  setStates((curr) => curr.filter((x) => x.id !== id))
                  // 同时刷新 page(canonical 可能被清)
                  void getPageApi(pageId).then(setPage).catch(() => {})
                }}
              />
            ))}
          </div>
        )}
      </section>

      <UploadStatesDialog
        pageId={pageId}
        hasCanonical={!!canonicalId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          // 上传 + 触发 Pass 1 后,reload pages + states
          void loadAll()
        }}
      />
    </div>
  )
}
