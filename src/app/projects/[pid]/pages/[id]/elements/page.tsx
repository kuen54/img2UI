'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

import type { Element, Page, PipelineRun, State } from '@/lib/types'
import { newElementId } from '@/lib/id'
import { getPageApi, listStatesApi } from '@/lib/api/projects-client'
import { listElementsApi, saveElementsApi } from '@/lib/api/elements-client'
import { getRunWithSubApi } from '@/lib/api/pipelines-client'
import { ElementCanvas, type CanvasViewOptions } from '@/components/element-review/canvas'
import { CanvasToolbar } from '@/components/element-review/canvas-toolbar'
import { ElementList } from '@/components/element-review/element-list'
import { ElementDetailPanel } from '@/components/element-review/element-detail-panel'
import { PipelineProgress } from '@/components/pipeline-progress'
import { StickySaveBar } from '@/components/ui/sticky-save-bar'
import { Button } from '@/components/ui/button'

type PageProps = { params: Promise<{ pid: string; id: string }> }

const DEFAULT_VIEW: CanvasViewOptions = {
  showOutlines: true,
  showLabels: false, // 默认不展示全部标签,避免密集元素场景互相遮挡;选中/hover 仍显示该元素标签
  imageOpacity: 1,
  filter: 'all',
}

export default function ElementReviewPage({ params }: PageProps) {
  const { pid, id: pageId } = use(params)

  const [page, setPage] = useState<Page | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [savedElements, setSavedElements] = useState<Element[]>([])
  const [draftElements, setDraftElements] = useState<Element[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentStateId, setCurrentStateId] = useState<string>('')
  const [view, setView] = useState<CanvasViewOptions>(DEFAULT_VIEW)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // 多路 sub-runs 实时进度(8d.6)
  const [subRuns, setSubRuns] = useState<PipelineRun[]>([])
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      const [p, s, e] = await Promise.all([
        getPageApi(pageId),
        listStatesApi(pageId),
        listElementsApi(pageId),
      ])
      setPage(p)
      setStates(s)
      setSavedElements(e)
      setDraftElements(e)
      // 默认选 canonical
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

  // 当前 state 的 active pass(同步派生,避免 effect 内 setState)
  const { activePass, parentRunId } = useMemo(() => {
    const cur = states.find((s) => s.id === currentStateId)
    if (!cur) return { activePass: null as 'pass1' | 'pass2' | null, parentRunId: undefined as string | undefined }
    if (cur.pipeline_status === 'pass1_running') {
      return { activePass: 'pass1' as const, parentRunId: cur.pass1_run_id }
    }
    if (cur.pipeline_status === 'pass2_running') {
      return { activePass: 'pass2' as const, parentRunId: cur.pass2_run_id }
    }
    return { activePass: null, parentRunId: undefined }
  }, [states, currentStateId])

  // 多路 sub-runs 轮询:active pass 时拉 sub_runs
  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (!activePass || !parentRunId) {
      return
    }

    let cancelled = false
    const poll = async () => {
      try {
        const { sub_runs } = await getRunWithSubApi(parentRunId)
        if (cancelled) return
        setSubRuns(sub_runs)
      } catch {
        // 静默失败:轮询继续
      }
      if (cancelled) return
      // 父 state 仍 running 才继续轮询;否则等 states 刷新触发本 effect 重算
      pollTimerRef.current = setTimeout(() => {
        void listStatesApi(pageId).then(setStates).catch(() => {})
      }, 2000)
    }
    void poll()

    return () => {
      cancelled = true
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [activePass, parentRunId, pageId])

  const dirty = useMemo(
    () => JSON.stringify(savedElements) !== JSON.stringify(draftElements),
    [savedElements, draftElements],
  )

  const updateElement = (next: Element) => {
    setDraftElements((curr) => curr.map((el) => (el.id === next.id ? next : el)))
  }

  const deleteElement = (id: string) => {
    setDraftElements((curr) => curr.filter((el) => el.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleCreateRequest = ({ bbox }: { bbox: [number, number, number, number] }) => {
    if (!currentStateId) return
    const now = new Date().toISOString()
    const newEl: Element = {
      id: newElementId(),
      page_id: pageId,
      state_ids: [currentStateId],
      name: `新元素 ${draftElements.length + 1}`,
      type: 'static',
      visual_category: 'other',
      bbox,
      z_index: 0,
      description: '',
      reviewed: false,
      created_at: now,
      updated_at: now,
    }
    setDraftElements([...draftElements, newEl])
    setSelectedId(newEl.id)
    toast.info('在右侧详情区填写名字 / 描述,完成后点底部保存')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await saveElementsApi(pageId, draftElements)
      setSavedElements(updated)
      setDraftElements(updated)
      toast.success(`已保存 ${updated.length} 个元素`)
    } catch (err) {
      toast.error('保存失败:' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const reviewedCount = useMemo(
    () => draftElements.filter((el) => el.reviewed).length,
    [draftElements],
  )
  const allReviewed = draftElements.length > 0 && reviewedCount === draftElements.length

  const markAllReviewed = () => {
    if (draftElements.length === 0) return
    setDraftElements((curr) => curr.map((el) => (el.reviewed ? el : { ...el, reviewed: true })))
    toast.info('已标记全部 reviewed,记得点底部「保存」落库')
  }

  if (loading || !page) {
    return <p className="p-6 text-sm text-muted-foreground">加载中…</p>
  }

  if (!currentStateId || states.length === 0) {
    return (
      <div className="p-6 pb-24 space-y-4">
        <p className="text-sm text-muted-foreground">该页面尚未上传设计稿,无法 Element Review。</p>
        <Link
          href={`/projects/${pid}/pages/${pageId}`}
          className="text-sm text-primary hover:underline"
        >
          ← 回到页面详情上传
        </Link>
      </div>
    )
  }

  const currentState = states.find((s) => s.id === currentStateId)
  const selected = draftElements.find((el) => el.id === selectedId) ?? null

  return (
    <div className="flex flex-col h-full">
      {/* 二级面包屑 */}
      <nav className="px-6 py-3 border-b flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <Link href={`/projects/${pid}/pages/${pageId}`} className="hover:text-foreground transition-colors">
            {page.name}
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground font-medium">Element Review</span>
        </div>

        {/* Review 进度 + 批量确认 + 完成后引导(Pass 1 跑完后才有 elements) */}
        {draftElements.length > 0 && (
          <div className="flex items-center gap-3 ml-4">
            <span className="text-xs flex items-center gap-1.5">
              <CheckCircle2
                className={
                  allReviewed ? 'size-4 text-emerald-600' : 'size-4 text-muted-foreground/40'
                }
              />
              已 review <span className="font-medium text-foreground">{reviewedCount}</span> / {draftElements.length}
            </span>
            {!allReviewed && (
              <Button size="sm" variant="outline" onClick={markAllReviewed}>
                全部标记 reviewed
              </Button>
            )}
            {allReviewed && !dirty && (
              <Link
                href={`/projects/${pid}/pages/${pageId}/assets`}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                去「资产 Review」触发 Pass 2
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        )}

        {activePass && subRuns.length > 0 && (
          <div className="ml-auto flex items-center gap-2 min-w-[280px]">
            <PipelineProgress
              total={activePass === 'pass1' ? 5 : subRuns.length}
              succeeded={subRuns.filter((r) => r.status === 'completed').length}
              failed={subRuns.filter((r) => r.status === 'failed').length}
              pass={activePass}
            />
          </div>
        )}
      </nav>

      {/* 主区:Canvas + 列表 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-0">
        <div className="flex flex-col min-h-0 border-r">
          <CanvasToolbar
            view={view}
            onViewChange={setView}
            states={states}
            currentStateId={currentStateId}
            onStateChange={setCurrentStateId}
            canonicalStateId={page.canonical_state_id}
          />
          <div className="flex-1 min-h-0">
            {currentState && (
              <ElementCanvas
                imageSrc={`/api/states/${currentState.id}/raw`}
                imageDims={{ width: currentState.width, height: currentState.height }}
                currentStateId={currentStateId}
                elements={draftElements}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChange={updateElement}
                onCreateRequest={handleCreateRequest}
                view={view}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col min-h-0">
          <ElementList
            elements={draftElements}
            states={states}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAddManual={() =>
              toast.info('在左侧 Canvas 空白区按住鼠标拖出 bbox 即可创建')
            }
          />
        </div>
      </div>

      {/* 详情面板 */}
      {selected && (
        <ElementDetailPanel
          element={selected}
          states={states}
          onChange={updateElement}
          onDelete={() => deleteElement(selected.id)}
        />
      )}

      {/* 整批保存条 */}
      <StickySaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onCancel={() => setDraftElements(savedElements)}
        dirtyText={`${draftElements.length} 个元素(其中 ${draftElements.length - savedElements.length >= 0 ? draftElements.length - savedElements.length : 0} 个新增 / 修改)`}
      />
    </div>
  )
}
