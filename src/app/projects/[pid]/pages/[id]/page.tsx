'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Image as ImageIcon, Package } from 'lucide-react'
import { toast } from 'sonner'

import type { Asset, Element, Page, State } from '@/lib/types'
import { getPageApi, listStatesApi } from '@/lib/api/projects-client'
import { listElementsApi } from '@/lib/api/elements-client'
import { listAssetsApi } from '@/lib/api/assets-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StateCard } from '@/components/pages/state-card'
import { UploadStatesDialog } from '@/components/pages/upload-states-dialog'
import { PipelineStepper } from '@/components/pages/pipeline-stepper'
import { AssetGrid } from '@/components/asset-review/asset-grid'

type PageProps = { params: Promise<{ pid: string; id: string }> }

export default function PageDetailPage({ params }: PageProps) {
  const { pid, id: pageId } = use(params)

  const [page, setPage] = useState<Page | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [elements, setElements] = useState<Element[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [p, s, e, a] = await Promise.all([
        getPageApi(pageId),
        listStatesApi(pageId),
        listElementsApi(pageId).catch(() => [] as Element[]),
        listAssetsApi(pageId).catch(() => [] as Asset[]),
      ])
      setPage(p)
      setStates(s)
      setElements(e)
      setAssets(a)
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
    <div className="p-6 pb-24 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{page.name}</h1>
        {page.route_hint && (
          <p className="text-sm text-muted-foreground font-mono">{page.route_hint}</p>
        )}
      </div>

      {/* Pipeline 进度(stepper 步骤可点击) */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Pipeline 进度</h2>
        <PipelineStepper
          states={states}
          elements={elements}
          assets={assets}
          projectId={pid}
          pageId={pageId}
        />
        <p className="text-xs text-muted-foreground">提示:点击已点亮的步骤可直接跳转。</p>
      </section>

      {/* 设计稿区(只标题 + grid,不再有显眼的「上传设计稿」按钮 — 新建页面已合并上传;补传走 EmptyState 兜底) */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">设计稿({states.length})</h2>

        {states.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="暂无设计稿"
            description="新建页面时未上传图片。点下方按钮补传 1-N 张同页面不同交互状态的设计稿(canonical / hover / empty 等),系统会自动跑 Pass 1 布局分析"
            action={
              <Button onClick={() => setUploadOpen(true)}>
                <Plus className="size-4 mr-1" />
                上传设计稿
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
                  void getPageApi(pageId).then(setPage).catch(() => {})
                }}
                onRetried={() => void loadAll()}
              />
            ))}
          </div>
        )}
      </section>

      {/* 资产平铺(Pass 2 产出,跨 state 跨 element 全部展示) */}
      {states.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Package className="size-4" />
            资产({assets.length})
          </h2>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-md">
              资产将在 Pass 2 完成后展示。先去 Element Review 确认框选 → 触发 Pass 2 提取资产。
            </p>
          ) : (
            <AssetGrid assets={assets} elements={elements} selectedId={null} onSelect={() => {}} />
          )}
        </section>
      )}

      <UploadStatesDialog
        pageId={pageId}
        hasCanonical={!!canonicalId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          void loadAll()
        }}
      />
    </div>
  )
}
