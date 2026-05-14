'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Loader2, Play, UploadCloud, FolderOutput } from 'lucide-react'
import { toast } from 'sonner'

import type { Asset, Element, Page, State } from '@/lib/types'
import { getPageApi, listStatesApi } from '@/lib/api/projects-client'
import { listElementsApi } from '@/lib/api/elements-client'
import { listAssetsApi, triggerPass2Api, uploadAllAssetsApi } from '@/lib/api/assets-client'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { BatchPngViewer } from '@/components/asset-review/batch-png-viewer'
import { AssetGrid } from '@/components/asset-review/asset-grid'
import { AssetDetailPanel } from '@/components/asset-review/asset-detail-panel'

type PageProps = { params: Promise<{ pid: string; id: string }> }

export default function AssetReviewPage({ params }: PageProps) {
  const { pid, id: pageId } = use(params)
  const confirm = useConfirm()

  const [page, setPage] = useState<Page | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [elements, setElements] = useState<Element[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [currentStateId, setCurrentStateId] = useState<string>('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [uploadingAll, setUploadingAll] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      const [p, s, e, a] = await Promise.all([
        getPageApi(pageId),
        listStatesApi(pageId),
        listElementsApi(pageId),
        listAssetsApi(pageId),
      ])
      setPage(p)
      setStates(s)
      setElements(e)
      setAssets(a)
      if (p.canonical_state_id) setCurrentStateId(p.canonical_state_id)
      else if (s[0]) setCurrentStateId(s[0].id)
    } catch (err) {
      toast.error('加载失败:' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [pageId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll()
  }, [loadAll])

  if (loading || !page) {
    return <p className="p-6 text-sm text-muted-foreground">加载中…</p>
  }

  const currentState = states.find((s) => s.id === currentStateId)
  const staticElements = elements.filter((e) => e.type === 'static')
  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null
  const selectedElement = selectedAsset ? elements.find((e) => e.id === selectedAsset.element_id) ?? null : null

  const canRunPass2 =
    currentState !== undefined &&
    ['pass1_done', 'pass2_done', 'pass2_failed', 'validating', 'validated'].includes(currentState.pipeline_status) &&
    staticElements.length > 0

  const handleRunPass2 = async () => {
    if (!currentState) return
    const ok = await confirm({
      title: `Run Pass 2 — ${staticElements.length} 个 static 元素`,
      description: '会调用 image_gen provider(apimart gpt-image-2-official)。约 60-220s,单次成本 ~$0.17。',
      confirmText: 'Run',
    })
    if (!ok) return
    setRunning(true)
    try {
      const result = await triggerPass2Api(currentState.id)
      toast.success(`Pass 2 完成,产出 ${result.created_assets} 个 asset`)
      await loadAll()
    } catch (e) {
      toast.error('Pass 2 失败:' + (e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const handleUploadAll = async () => {
    const pending = assets.filter((a) => a.status !== 'uploaded')
    if (pending.length === 0) {
      toast.info('全部 asset 已上传')
      return
    }
    const ok = await confirm({
      title: `批量上传 ${pending.length} 个 asset 到 CDN`,
      description: '使用 active cdn provider 串行上传。失败的不阻断其他。',
      confirmText: '上传',
    })
    if (!ok) return
    setUploadingAll(true)
    try {
      const result = await uploadAllAssetsApi(pageId)
      if (result.failed.length === 0) {
        toast.success(`已上传 ${result.uploaded.length} 个 asset`)
      } else {
        toast.warning(
          `上传 ${result.uploaded.length} 个;失败 ${result.failed.length} 个:${result.failed.map((f) => f.error).slice(0, 2).join(' / ')}`,
        )
      }
      await loadAll()
    } catch (e) {
      toast.error('批量上传失败:' + (e as Error).message)
    } finally {
      setUploadingAll(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <nav className="px-6 py-3 border-b flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Link href={`/projects/${pid}/pages/${pageId}`} className="hover:text-foreground transition-colors">
            {page.name}
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground font-medium">Asset Review</span>
        </div>
        <div className="flex items-center gap-2">
          {states.length > 1 && currentStateId && (
            <Select value={currentStateId} onValueChange={(v) => v && setCurrentStateId(v)}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.id === page.canonical_state_id ? ' (canonical)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => void handleRunPass2()} disabled={!canRunPass2 || running} size="sm">
            {running ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Play className="size-3.5 mr-1" />}
            {running ? '提取中…(可能 60-220s)' : 'Run Pass 2'}
          </Button>
          {assets.length > 0 && (
            <Button
              onClick={() => void handleUploadAll()}
              disabled={uploadingAll || running}
              size="sm"
              variant="outline"
            >
              {uploadingAll ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <UploadCloud className="size-3.5 mr-1" />
              )}
              批量上传 CDN
            </Button>
          )}
          <Link href={`/projects/${pid}/pages/${pageId}/export`}>
            <Button size="sm" variant="outline">
              <FolderOutput className="size-3.5 mr-1" />
              Export
            </Button>
          </Link>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {currentState && currentState.pipeline_status !== 'idle' && (
          <BatchPngViewer stateId={currentState.id} />
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">资产({assets.length})</h3>
          <AssetGrid
            assets={assets}
            elements={elements}
            selectedId={selectedAssetId}
            onSelect={setSelectedAssetId}
          />
        </section>
      </div>

      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          element={selectedElement}
          onReExtracted={() => void loadAll()}
        />
      )}
    </div>
  )
}
