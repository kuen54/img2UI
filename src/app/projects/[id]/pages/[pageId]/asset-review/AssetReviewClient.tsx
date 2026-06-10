'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { errText } from '@/lib/error-text'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Tooltip from '@mui/material/Tooltip'
import {
  ChevronDown as ExpandMoreIcon,
  ChevronUp as ExpandLessIcon,
  RotateCw as RefreshIcon,
  Scissors as ContentCutIcon,
  WandSparkles as HealingIcon,
  Trash2 as DeleteIcon,
  GripVertical as DragIndicatorIcon,
  Plus as AddIcon,
  Images as PhotoLibraryOutlinedIcon,
  Puzzle as ExtensionOutlinedIcon,
} from 'lucide-react'
import { alpha } from '@mui/material/styles'
import { PRIMARY, riseInSx } from '@/theme'
import { AppShell } from '@/components/AppShell'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { KbdHintRow } from '@/components/KbdHint'
import { successFlash, MD3_STANDARD_EASING } from '@/components/flash'
import { ALL_VISUAL_CATEGORIES, VISUAL_CATEGORY_CN, VISUAL_CATEGORY_COLOR } from '@/lib/visual-category'
import type {
  Asset,
  LayoutElement,
  Page,
  Project,
  StateRecord,
  VisualCategory,
  SliceInfo,
} from '@/lib/types'

type SliceWithAssign = SliceInfo & { assigned_to: string[] }

interface PageWithStates extends Page {
  states: StateRecord[]
}

const CATEGORY_COLOR = VISUAL_CATEGORY_COLOR

const DRAG_MIME = 'application/x-img2ui-slice'

interface DragPayload {
  state_id: string
  category: VisualCategory
  idx: number
}

export function AssetReviewClient({
  projectId,
  pageId,
}: {
  projectId: string
  pageId: string
}): React.ReactElement {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [page, setPage] = useState<PageWithStates | null>(null)
  const [elements, setElements] = useState<LayoutElement[]>([])
  const [assets, setAssets] = useState<Map<string, Asset>>(new Map())
  const [slices, setSlices] = useState<SliceWithAssign[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  // 「点选指派」交互:点 slice → pickedSlice 进入选中态;再点 element row 触发指派
  // 跟拖拽并行(两套都能用)。Esc 取消。
  const [pickedSlice, setPickedSlice] = useState<DragPayload | null>(null)
  const [subCropDialog, setSubCropDialog] = useState<{
    state_id: string
    category: VisualCategory
    idx: number
  } | null>(null)
  const [matting, setMatting] = useState(false)
  // 指派成功的绿闪微反馈(支持批量:顺序自动指派后整批闪)
  const [flash, setFlash] = useState<{ ids: string[]; key: number }>({ ids: [], key: 0 })
  const flashRows = useCallback((ids: string[]): void => {
    setFlash((f) => ({ ids, key: f.key + 1 }))
  }, [])

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [proj, pg, els] = await Promise.all([
        fetch(`/api/projects/${projectId}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/pages/${pageId}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/pages/${pageId}/elements`).then(
          (r): Promise<{ elements: LayoutElement[] }> => r.json(),
        ),
      ])
      setProject(proj as Project | null)
      setPage(pg as PageWithStates | null)
      const elArr = els.elements ?? []
      setElements(elArr.filter((e) => e.type === 'static'))

      const state = (pg as PageWithStates | null)?.states[0]
      if (state) {
        // slices + 整页 assets 一次拉(此前每个 element 单独 fetch asset,N+1)
        const [slicesRes, assetsRes] = await Promise.all([
          fetch(`/api/states/${state.id}/slices?page_id=${pageId}`).then(
            (r): Promise<{ slices: SliceWithAssign[] }> => r.json(),
          ),
          fetch(`/api/pages/${pageId}/assets`).then(
            (r): Promise<{ assets: Asset[] }> => r.json(),
          ),
        ])
        setSlices(slicesRes.slices ?? [])
        const map = new Map<string, Asset>()
        for (const a of assetsRes.assets ?? []) {
          map.set(a.element_id, a)
        }
        setAssets(map)
      }
      setLoading(false)
    } catch (err) {
      toast.error(`加载失败:${errText(err)}`)
      setLoading(false)
    }
  }, [projectId, pageId])

  useEffect(() => {
    void reload()
  }, [reload])

  const state = page?.states[0]
  const failedCats = state?.pass2_failed_categories ?? []

  const scrollElementRowIntoView = useCallback((id: string): void => {
    setTimeout(() => {
      const row = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement | null
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 0)
  }, [])

  const handleAssign = useCallback(
    async (elementId: string, payload: DragPayload): Promise<void> => {
      try {
        const res = await fetch(`/api/elements/${elementId}/assign-slice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, page_id: pageId }),
        })
        if (!res.ok) throw new Error(await res.text())
        const { asset } = (await res.json()) as { asset: Asset }
        toast.success('已指派')
        flashRows([elementId])
        // 指派完成后清掉「已选切片」状态(无论指派来源是 drag 还是 click)
        setPickedSlice(null)
        // 局部更新代替全量 reload(此前每次指派要重拉整页 + N 个 asset 请求)
        setAssets((prev) => {
          const next = new Map(prev)
          next.set(elementId, asset)
          return next
        })
        setSlices((prev) =>
          prev.map((s) => {
            const isTarget =
              s.state_id === payload.state_id &&
              s.category === payload.category &&
              s.idx === payload.idx
            const had = s.assigned_to.includes(elementId)
            if (isTarget && !had) return { ...s, assigned_to: [...s.assigned_to, elementId] }
            // 该 element 之前指派的旧切片释放标记
            if (!isTarget && had)
              return { ...s, assigned_to: s.assigned_to.filter((id) => id !== elementId) }
            return s
          }),
        )
        // 自动推进:选中下一个未指派元素并滚过去(批量指派时省一次次找)
        const assignedIds = new Set(assets.keys())
        assignedIds.add(elementId)
        const start = elements.findIndex((e) => e.id === elementId)
        const ordered = [
          ...elements.slice(start + 1),
          ...elements.slice(0, Math.max(start, 0)),
        ]
        const nextEl = ordered.find((e) => !assignedIds.has(e.id))
        if (nextEl) {
          setSelectedElementId(nextEl.id)
          scrollElementRowIntoView(nextEl.id)
        }
      } catch (err) {
        toast.error(`指派失败:${errText(err)}`)
      }
    },
    [pageId, elements, assets, scrollElementRowIntoView, flashRows],
  )

  // togglePick:再次点同一个 slice 取消选中,点不同的就替换
  const togglePick = useCallback((payload: DragPayload): void => {
    setPickedSlice((prev) =>
      prev &&
      prev.state_id === payload.state_id &&
      prev.category === payload.category &&
      prev.idx === payload.idx
        ? null
        : payload,
    )
  }, [])

  // 键盘:Esc 取消已选切片;↑/↓ 在元素行间移动;pickedSlice 态下 Enter 指派给选中元素
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setPickedSlice(null)
        return
      }
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (elements.length === 0) return
        e.preventDefault()
        const idx = elements.findIndex((el) => el.id === selectedElementId)
        const next =
          e.key === 'ArrowDown'
            ? elements[Math.min(idx + 1, elements.length - 1)]!
            : elements[Math.max(idx - 1, 0)]!
        setSelectedElementId(next.id)
        scrollElementRowIntoView(next.id)
        return
      }
      if (e.key === 'Enter' && pickedSlice && selectedElementId) {
        // 普通按钮 / chip(重抠等)让它自然响应 Enter,不抢
        if (
          t &&
          (t.tagName === 'BUTTON' || t.getAttribute('role') === 'button') &&
          !t.closest('[data-element-id]')
        )
          return
        e.preventDefault()
        void handleAssign(selectedElementId, pickedSlice)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [elements, selectedElementId, pickedSlice, handleAssign, scrollElementRowIntoView])

  const handleUnassign = useCallback(
    async (elementId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/elements/${elementId}/asset`, { method: 'DELETE' })
        if (!res.ok && res.status !== 204) throw new Error(await res.text())
        toast.success('已撤销')
        // 局部更新:删 asset + 释放切片标记
        setAssets((prev) => {
          const next = new Map(prev)
          next.delete(elementId)
          return next
        })
        setSlices((prev) =>
          prev.map((s) =>
            s.assigned_to.includes(elementId)
              ? { ...s, assigned_to: s.assigned_to.filter((id) => id !== elementId) }
              : s,
          ),
        )
      } catch (err) {
        toast.error(`撤销失败:${errText(err)}`)
      }
    },
    [],
  )

  // 「顺序自动指派」:某 category 未指派元素数 == 该 category 空闲切片数时,
  // 两边都按视觉顺序排,大概率一一对应 → 给一键按位指派;指派完仍可逐个调整
  const autoAssignPairs = useMemo(() => {
    const pairs: Array<{ elementId: string; payload: DragPayload }> = []
    for (const cat of ALL_VISUAL_CATEGORIES) {
      const els = elements
        .filter((e) => e.visual_category === cat && !assets.has(e.id))
        .sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0])
      if (els.length === 0) continue
      const free = slices
        .filter((s) => s.category === cat && s.assigned_to.length === 0)
        .sort((a, b) => a.idx - b.idx)
      if (free.length !== els.length) continue
      for (let i = 0; i < els.length; i++) {
        pairs.push({
          elementId: els[i]!.id,
          payload: { state_id: free[i]!.state_id, category: cat, idx: free[i]!.idx },
        })
      }
    }
    return pairs
  }, [elements, assets, slices])

  // 自动指派的配对预览(按钮 tooltip 用,执行前就能看到谁配谁)
  const autoAssignPreview = useMemo(
    () =>
      autoAssignPairs.map((p) => {
        const el = elements.find((e) => e.id === p.elementId)
        return `${el?.name ?? p.elementId} ← ${VISUAL_CATEGORY_CN[p.payload.category]} #${p.payload.idx}`
      }),
    [autoAssignPairs, elements],
  )

  const [autoAssigning, setAutoAssigning] = useState(false)
  const autoAssignAll = useCallback(async (): Promise<void> => {
    setAutoAssigning(true)
    try {
      const okIds: string[] = []
      const failed: string[] = []
      for (const p of autoAssignPairs) {
        const res = await fetch(`/api/elements/${p.elementId}/assign-slice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...p.payload, page_id: pageId }),
        })
        if (res.ok) okIds.push(p.elementId)
        else failed.push(p.elementId)
      }
      if (failed.length > 0) {
        toast.error(`顺序指派:${failed.length} 个失败`)
      }
      if (okIds.length > 0) {
        toast.success(`顺序指派完成 ${okIds.length} 个,请逐个检查`)
        flashRows(okIds)
      }
      void reload()
    } finally {
      setAutoAssigning(false)
    }
  }, [autoAssignPairs, pageId, reload, flashRows])

  const handleReExtract = useCallback(
    async (elementId: string): Promise<void> => {
      try {
        const res = await fetch(
          `/api/elements/${elementId}/re-extract?page_id=${pageId}`,
          { method: 'POST' },
        )
        if (!res.ok) throw new Error(await res.text())
        const { run_id } = (await res.json()) as { run_id: string }
        toast.info('单元素重抠中…')
        const interval = setInterval(() => {
          void fetch(`/api/pipeline-runs/${run_id}`)
            .then((r) => r.json())
            .then((run: { status: string; error?: { message: string } }) => {
              if (run.status === 'completed') {
                clearInterval(interval)
                toast.success('重抠完成')
                void reload()
              } else if (run.status === 'failed') {
                clearInterval(interval)
                toast.error(`重抠失败:${errText(run.error?.message ?? '未知错误')}`)
              }
            })
        }, 2000)
      } catch (err) {
        toast.error(`重抠失败:${errText(err)}`)
      }
    },
    [pageId, reload],
  )

  // Pass 2 部分失败:state.pass2_failed_categories 里的路没有切片产物,
  // 给出明确提示 + 只重跑失败路的入口(不用回 page detail 页)
  const [rerunningFailed, setRerunningFailed] = useState(false)
  const rerunFailedRoutes = useCallback(async (): Promise<void> => {
    const st = page?.states[0]
    const cats = st?.pass2_failed_categories ?? []
    if (!st || cats.length === 0) return
    setRerunningFailed(true)
    try {
      const res = await fetch(`/api/states/${st.id}/pass2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: cats }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { run_id } = (await res.json()) as { run_id: string }
      toast.info(`重跑失败 ${cats.length} 路中…(可能要 1-3 分钟)`)
      const interval = setInterval(() => {
        void fetch(`/api/pipeline-runs/${run_id}`)
          .then((r) => r.json())
          .then((run: { status: string; error?: { message: string } }) => {
            if (run.status === 'completed') {
              clearInterval(interval)
              setRerunningFailed(false)
              toast.success('重跑完成')
              void reload()
            } else if (run.status === 'failed') {
              clearInterval(interval)
              setRerunningFailed(false)
              toast.error(`重跑失败:${errText(run.error?.message ?? '未知错误')}`)
              void reload()
            }
          })
          .catch(() => {
            clearInterval(interval)
            setRerunningFailed(false)
          })
      }, 2000)
    } catch (err) {
      setRerunningFailed(false)
      toast.error(`重跑失败:${errText(err)}`)
    }
  }, [page, reload])

  const [confirmMattingOpen, setConfirmMattingOpen] = useState(false)
  const handleMattingFallback = useCallback(async (): Promise<void> => {
    if (!state) return
    setMatting(true)
    try {
      const res = await fetch(`/api/states/${state.id}/re-key-via-api`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as {
        refreshed: VisualCategory[]
        failed: Array<{ category: VisualCategory; error: string }>
      }
      if (data.refreshed.length > 0) {
        toast.success(`已重抠 ${data.refreshed.map((c) => VISUAL_CATEGORY_CN[c]).join(', ')}`)
      }
      if (data.failed.length > 0) {
        // 带 batch 级错误明细,不只报 category 名
        toast.warning(
          `部分失败:${data.failed
            .map((f) => `${VISUAL_CATEGORY_CN[f.category]}(${f.error})`)
            .join('; ')}`,
          { duration: 10000 },
        )
      }
      void reload()
    } catch (err) {
      toast.error(`抠图失败:${errText(err)}`)
    } finally {
      setMatting(false)
    }
  }, [state, reload])

  const breadcrumbs = useMemo(
    () =>
      project && page
        ? [
            { label: '项目', href: '/' },
            { label: project.name, href: `/projects/${projectId}` },
            { label: page.name, href: `/projects/${projectId}/pages/${pageId}` },
            { label: 'Asset Review' },
          ]
        : [{ label: '加载中…' }],
    [project, page, projectId, pageId],
  )

  const allAssigned = elements.length > 0 && elements.every((e) => assets.has(e.id))

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      rightAction={
        <Stack direction="row" spacing={1} sx={{ mr: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={matting ? <CircularProgress size={14} /> : <HealingIcon />}
            disabled={matting || !state}
            onClick={() => setConfirmMattingOpen(true)}
          >
            用 API 抠图
          </Button>
        </Stack>
      }
    >
      <Container maxWidth={false} sx={{ py: 3 }}>
        {loading || !state ? (
          // 跟真实两栏布局同构的 Skeleton
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ height: 'calc(100vh - 120px)' }}
          >
            <Skeleton variant="rounded" sx={{ width: { md: '50%' }, height: '100%' }} />
            <Skeleton variant="rounded" sx={{ flexGrow: 1, height: '100%' }} />
          </Stack>
        ) : (
          <Box sx={riseInSx}>
          {failedCats.length > 0 && (
            <Alert
              severity="warning"
              sx={{ mb: 2 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  disabled={rerunningFailed}
                  onClick={() => void rerunFailedRoutes()}
                >
                  {rerunningFailed ? '重跑中…' : `重跑失败 ${failedCats.length} 路`}
                </Button>
              }
            >
              Pass 2 有 {failedCats.length} 路生成失败:
              {failedCats.map((c) => VISUAL_CATEGORY_CN[c]).join(' / ')}
              —— 这些类别没有切片产物,对应元素暂时无法指派。
            </Alert>
          )}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ height: 'calc(100vh - 120px)' }}
          >
            <SliceGrid
              stateId={state.id}
              elements={elements}
              slices={slices}
              selectedElementId={selectedElementId}
              currentAssignment={
                selectedElementId
                  ? assets.get(selectedElementId)?.slice_source ?? null
                  : null
              }
              pickedSlice={pickedSlice}
              onTogglePick={togglePick}
              onSubCrop={(state_id, category, idx) =>
                setSubCropDialog({ state_id, category, idx })
              }
            />
            <ElementList
              state={state}
              elements={elements}
              assets={assets}
              selectedElementId={selectedElementId}
              pickedSlice={pickedSlice}
              flash={flash}
              onSelect={setSelectedElementId}
              onAssign={handleAssign}
              onUnassign={handleUnassign}
              onReExtract={handleReExtract}
              allAssigned={allAssigned}
              autoAssignCount={autoAssignPairs.length}
              autoAssignPreview={autoAssignPreview}
              autoAssigning={autoAssigning}
              onAutoAssign={() => void autoAssignAll()}
              onGoBack={() => router.push(`/projects/${projectId}/pages/${pageId}`)}
            />
          </Stack>
          </Box>
        )}
      </Container>

      {subCropDialog && (
        <SubCropDialog
          stateId={subCropDialog.state_id}
          category={subCropDialog.category}
          idx={subCropDialog.idx}
          onClose={() => setSubCropDialog(null)}
          onCreated={() => {
            setSubCropDialog(null)
            void reload()
          }}
        />
      )}
      <ConfirmDialog
        open={confirmMattingOpen}
        onClose={() => setConfirmMattingOpen(false)}
        title="用 API 抠图"
        body={
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              用 koukoutu API 重新抠所有 category 的绿幕底片。**消耗 koukoutu 积分**(每 category 1 次调用)。
            </Typography>
            <Typography variant="body2" color="text.secondary">
              旧切片保留,新切片以 nextSliceIdx 追加 — 你可以在切片库里对比新旧。
            </Typography>
          </Box>
        }
        confirmLabel="开始抠图"
        confirmColor="primary"
        onConfirm={handleMattingFallback}
      />
    </AppShell>
  )
}

// ─── SliceGrid (left) ──────────────────────────────────────────────────────

function SliceGrid({
  stateId,
  elements,
  slices,
  selectedElementId,
  currentAssignment,
  pickedSlice,
  onTogglePick,
  onSubCrop,
}: {
  stateId: string
  elements: LayoutElement[]
  slices: SliceWithAssign[]
  selectedElementId: string | null
  currentAssignment: { state_id: string; category: VisualCategory; idx: number } | null
  pickedSlice: DragPayload | null
  onTogglePick: (payload: DragPayload) => void
  onSubCrop: (stateId: string, category: VisualCategory, idx: number) => void
}): React.ReactElement {
  const grouped = useMemo(() => {
    const m = new Map<VisualCategory, SliceWithAssign[]>()
    for (const cat of ALL_VISUAL_CATEGORIES) m.set(cat, [])
    for (const s of slices) m.get(s.category)!.push(s)
    return m
  }, [slices])

  // 哪些 category 有元素 → Pass 2 跑过 → keyed PNG 存在
  const categoriesWithElements = useMemo(() => {
    const counts = new Map<VisualCategory, number>()
    for (const cat of ALL_VISUAL_CATEGORIES) counts.set(cat, 0)
    for (const e of elements) counts.set(e.visual_category, counts.get(e.visual_category)! + 1)
    return ALL_VISUAL_CATEGORIES.filter((c) => counts.get(c)! > 0).map((c) => ({
      category: c,
      count: counts.get(c)!,
    }))
  }, [elements])

  return (
    <Box
      sx={{
        width: { md: '50%' },
        flexShrink: 0,
        overflowY: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        bgcolor: 'background.paper',
      }}
    >
      {categoriesWithElements.length > 0 && (
        <>
          <KeyedImagesPanel
            stateId={stateId}
            categoriesWithElements={categoriesWithElements}
          />
          <Divider sx={{ my: 1.5 }} />
        </>
      )}
      <Typography variant="h5" sx={{ mb: 1.5 }}>
        切片库 ({slices.length})
      </Typography>
      {ALL_VISUAL_CATEGORIES.map((cat) => {
        const arr = grouped.get(cat)!
        if (arr.length === 0) return null
        return (
          <CategorySection
            key={cat}
            category={cat}
            slices={arr}
            selectedElementId={selectedElementId}
            currentAssignment={currentAssignment}
            pickedSlice={pickedSlice}
            onTogglePick={onTogglePick}
            onSubCrop={onSubCrop}
          />
        )
      })}
      {slices.length === 0 && (
        <Box sx={{ py: 6 }}>
          <EmptyState
            variant="compact"
            icon={<PhotoLibraryOutlinedIcon />}
            title="还没有切片,运行 Pass 2 后会出现"
          />
        </Box>
      )}
      <Stack spacing={0.5} sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          边框颜色
        </Typography>
        {(
          [
            ['rgba(0,0,0,0.25)', '未指派'],
            [CATEGORY_COLOR.subject, '当前选中 element 已用'],
            ['#f59e0b', '别的 element 已用(允许重复)'],
          ] as const
        ).map(([c, label]) => (
          <Stack key={label} direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: 0.5,
                border: `2px solid ${c}`,
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}

// ─── KeyedImagesPanel ─────────────────────────────────────────────────────
// Pass 2 输出的 per-category 透明 PNG(`data/keyed/{state}-{cat}.png`)。
// 顶层 toggle 默认闭合,展开后 N 个 category 子 toggle,每个独立懒加载。

function KeyedImagesPanel({
  stateId,
  categoriesWithElements,
}: {
  stateId: string
  categoriesWithElements: Array<{ category: VisualCategory; count: number }>
}): React.ReactElement {
  const [topOpen, setTopOpen] = useState(false)

  return (
    <Box>
      <Button
        size="small"
        fullWidth
        startIcon={topOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        onClick={() => setTopOpen((v) => !v)}
        sx={{
          justifyContent: 'flex-start',
          color: 'text.primary',
          fontWeight: 600,
        }}
      >
        Pass 2 完整拆分图 ({categoriesWithElements.length})
      </Button>
      <Collapse in={topOpen}>
        <Stack spacing={0.5} sx={{ pl: 1, mt: 0.5 }}>
          {categoriesWithElements.map(({ category, count }) => (
            <KeyedCategoryRow
              key={category}
              stateId={stateId}
              category={category}
              count={count}
            />
          ))}
        </Stack>
      </Collapse>
    </Box>
  )
}

function KeyedCategoryRow({
  stateId,
  category,
  count,
}: {
  stateId: string
  category: VisualCategory
  count: number
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [batches, setBatches] = useState<number[]>([])
  const [loaded, setLoaded] = useState(false)

  // 展开时拉 batch 列表(支持多 batch 渲染:每 batch 一张 keyed PNG)
  useEffect(() => {
    if (!open || loaded) return
    void fetch(`/api/states/${stateId}/keyed/${category}/batches`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { batches?: number[] } | null) => {
        setBatches(data?.batches ?? [])
        setLoaded(true)
      })
      .catch(() => {
        setBatches([])
        setLoaded(true)
      })
  }, [open, loaded, stateId, category])

  return (
    <Box>
      <Button
        size="small"
        fullWidth
        startIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        onClick={() => setOpen((v) => !v)}
        sx={{ justifyContent: 'flex-start', color: 'text.primary' }}
      >
        {VISUAL_CATEGORY_CN[category]} ({count} 元素)
      </Button>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={0.5} sx={{ mt: 0.5, mb: 0.5 }}>
          {loaded && batches.length === 0 && (
            <Typography variant="caption" color="text.disabled" sx={{ px: 1 }}>
              该 category 暂无 Pass 2 输出
            </Typography>
          )}
          {batches.map((batchIdx) => (
            <Box
              key={batchIdx}
              sx={{
                p: 1,
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.default',
                // 棋盘格背景表示透明区域
                backgroundImage:
                  'linear-gradient(45deg, rgba(0,0,0,0.04) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.04) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.04) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.04) 75%)',
                backgroundSize: '12px 12px',
                backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
                position: 'relative',
                minHeight: 80,
              }}
            >
              {batches.length > 1 && (
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    top: 4,
                    left: 6,
                    px: 0.75,
                    py: 0.25,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 0.5,
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: 'text.secondary',
                    zIndex: 1,
                  }}
                >
                  batch {batchIdx + 1}/{batches.length}
                </Typography>
              )}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 80,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/states/${stateId}/keyed/${category}${batchIdx > 0 ? `?batch=${batchIdx}` : ''}`}
                  alt={`Pass 2 输出 - ${category} batch ${batchIdx}`}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 360,
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </Box>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  )
}

function CategorySection({
  category,
  slices,
  selectedElementId,
  currentAssignment,
  pickedSlice,
  onTogglePick,
  onSubCrop,
}: {
  category: VisualCategory
  slices: SliceWithAssign[]
  selectedElementId: string | null
  currentAssignment: { state_id: string; category: VisualCategory; idx: number } | null
  pickedSlice: DragPayload | null
  onTogglePick: (payload: DragPayload) => void
  onSubCrop: (stateId: string, category: VisualCategory, idx: number) => void
}): React.ReactElement {
  const [open, setOpen] = useState(true)
  return (
    <Box sx={{ mb: 1.5 }}>
      <Button
        size="small"
        fullWidth
        startIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        onClick={() => setOpen((v) => !v)}
        sx={{ justifyContent: 'flex-start', color: 'text.primary', mb: 0.5 }}
      >
        {VISUAL_CATEGORY_CN[category]} ({slices.length})
      </Button>
      <Collapse in={open}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {slices.map((s) => {
            const usedByCurrent =
              currentAssignment &&
              currentAssignment.state_id === s.state_id &&
              currentAssignment.category === s.category &&
              currentAssignment.idx === s.idx
            const usedByOthers = s.assigned_to.length > 0 && !usedByCurrent
            const isPicked =
              pickedSlice &&
              pickedSlice.state_id === s.state_id &&
              pickedSlice.category === s.category &&
              pickedSlice.idx === s.idx
            const borderColor = isPicked
              ? PRIMARY
              : usedByCurrent
                ? CATEGORY_COLOR.subject
                : usedByOthers
                  ? '#f59e0b'
                  : 'rgba(0,0,0,0.15)'
            return (
              <Box
                key={`${s.category}-${s.idx}`}
                draggable
                onDragStart={(e) => {
                  const payload: DragPayload = {
                    state_id: s.state_id,
                    category: s.category,
                    idx: s.idx,
                  }
                  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() =>
                  onTogglePick({
                    state_id: s.state_id,
                    category: s.category,
                    idx: s.idx,
                  })
                }
                sx={{
                  position: 'relative',
                  width: 96,
                  height: 96,
                  border: `${isPicked ? 3 : 2}px solid ${borderColor}`,
                  borderRadius: 1,
                  overflow: 'hidden',
                  cursor: 'grab',
                  bgcolor: 'background.default',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  // 选中态:浅蓝色光晕 + 微 scale(跟 picked 边框呼应)
                  boxShadow: isPicked
                    ? `0 0 0 3px ${alpha(PRIMARY, 0.25)}`
                    : 'none',
                  transform: isPicked ? 'scale(1.04)' : 'scale(1)',
                  zIndex: isPicked ? 1 : 0,
                  transition:
                    'box-shadow 150ms cubic-bezier(0.2, 0, 0, 1), border-color 150ms cubic-bezier(0.2, 0, 0, 1), transform 150ms cubic-bezier(0.2, 0, 0, 1)',
                  // hover:抬一档 + 显出 drag handle / crop btn
                  '&:hover': {
                    borderColor: isPicked ? PRIMARY : alpha(PRIMARY, 0.5),
                  },
                  '&:hover .crop-btn, &:hover .drag-handle': { opacity: 1 },
                  '&:active': { cursor: 'grabbing' },
                }}
              >
                {/* drag handle 角标:静态半透明,hover 时变实 — 强 affordance */}
                <Box
                  className="drag-handle"
                  sx={{
                    position: 'absolute',
                    top: 2,
                    left: 2,
                    width: 18,
                    height: 18,
                    borderRadius: '4px',
                    bgcolor: 'rgba(255,255,255,0.85)',
                    color: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.55,
                    transition: 'opacity 150ms',
                    pointerEvents: 'none',
                  }}
                >
                  <DragIndicatorIcon size={14} />
                </Box>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/states/${s.state_id}/slices/${s.category}/${s.idx}`}
                  alt={`#${s.idx}`}
                  draggable={false}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    background:
                      'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50%/12px 12px',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 2,
                    left: 2,
                    fontSize: 10,
                    bgcolor: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    px: 0.5,
                    borderRadius: 0.5,
                  }}
                >
                  #{s.idx} · {s.opaque_pct.toFixed(0)}%
                </Box>
                <IconButton
                  size="small"
                  className="crop-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSubCrop(s.state_id, s.category, s.idx)
                  }}
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 22,
                    height: 22,
                    bgcolor: 'rgba(255,255,255,0.9)',
                    opacity: 0,
                    transition: 'opacity 0.15s',
                    '&:hover': { bgcolor: 'white' },
                  }}
                >
                  <ContentCutIcon size={14} />
                </IconButton>
              </Box>
            )
          })}
        </Box>
      </Collapse>
    </Box>
  )
}

// ─── ElementList (right) ───────────────────────────────────────────────────

function ElementList({
  state,
  elements,
  assets,
  selectedElementId,
  pickedSlice,
  flash,
  onSelect,
  onAssign,
  onUnassign,
  onReExtract,
  allAssigned,
  autoAssignCount,
  autoAssignPreview,
  autoAssigning,
  onAutoAssign,
  onGoBack,
}: {
  state: StateRecord
  elements: LayoutElement[]
  assets: Map<string, Asset>
  selectedElementId: string | null
  pickedSlice: DragPayload | null
  flash: { ids: string[]; key: number }
  onSelect: (id: string) => void
  onAssign: (elementId: string, payload: DragPayload) => Promise<void>
  onUnassign: (elementId: string) => Promise<void>
  onReExtract: (elementId: string) => Promise<void>
  allAssigned: boolean
  autoAssignCount: number
  autoAssignPreview: string[]
  autoAssigning: boolean
  onAutoAssign: () => void
  onGoBack: () => void
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // P3-1 修复:拖拽接近边缘时 auto-scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const margin = 60
      const speed = 12
      if (e.clientY < rect.top + margin) el.scrollTop -= speed
      else if (e.clientY > rect.bottom - margin) el.scrollTop += speed
    }
    el.addEventListener('dragover', onDragOver)
    return () => el.removeEventListener('dragover', onDragOver)
  }, [])

  return (
    <Box
      ref={containerRef}
      sx={{
        flexGrow: 1,
        overflowY: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        useFlexGap
        columnGap={1}
        rowGap={0.75}
        sx={{ mb: 1.5, flexWrap: 'wrap' }}
      >
        <Typography variant="h5" sx={{ whiteSpace: 'nowrap' }}>
          元素列表 ({elements.length} 静态)
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
          {autoAssignCount > 0 && (
            <Tooltip
              placement="bottom-end"
              title={
                <Box sx={{ py: 0.5 }}>
                  <Box sx={{ fontWeight: 600, mb: 0.5 }}>将按视觉顺序配对:</Box>
                  {autoAssignPreview.slice(0, 8).map((line, i) => (
                    <Box key={i} sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {line}
                    </Box>
                  ))}
                  {autoAssignPreview.length > 8 && (
                    <Box sx={{ mt: 0.25 }}>… 共 {autoAssignPreview.length} 对</Box>
                  )}
                </Box>
              }
            >
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={autoAssigning}
                  onClick={onAutoAssign}
                >
                  {autoAssigning ? '指派中…' : `顺序自动指派 ${autoAssignCount}`}
                </Button>
              </span>
            </Tooltip>
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ whiteSpace: 'nowrap' }}
          >
            {Array.from(assets.values()).length} / {elements.length} 已指派
          </Typography>
        </Stack>
      </Stack>

      {!pickedSlice && (
        <Box sx={{ mb: 1.5 }}>
          <KbdHintRow
            wrap
            items={[
              { keys: ['↑', '↓'], label: '选元素' },
              { keys: ['⏎'], label: '指派已选切片' },
              { keys: ['Esc'], label: '取消选择' },
            ]}
          />
        </Box>
      )}

      {pickedSlice && (
        <Box
          sx={{
            mb: 1.5,
            px: 1.5,
            py: 1,
            borderRadius: 1,
            bgcolor: alpha(PRIMARY, 0.08),
            border: '1px solid',
            borderColor: alpha(PRIMARY, 0.4),
            fontSize: 13,
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <DragIndicatorIcon size={16} />
          <Box sx={{ flexGrow: 1 }}>
            已选切片 <code>#{pickedSlice.idx}</code>(
            {VISUAL_CATEGORY_CN[pickedSlice.category]}) · 点元素行或 ↑↓+Enter 指派
          </Box>
          <Typography variant="caption" color="text.secondary">
            Esc 取消
          </Typography>
        </Box>
      )}

      {elements.length === 0 ? (
        <Box sx={{ py: 6 }}>
          <EmptyState
            variant="compact"
            icon={<ExtensionOutlinedIcon />}
            title="没有 type=static 的元素"
          />
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {elements.map((el) => {
            const isFlash = flash.ids.includes(el.id)
            return (
              <ElementRow
                // flash 行换 key 重挂载 → 动画可重放
                key={isFlash ? `${el.id}-f${flash.key}` : el.id}
                state={state}
                element={el}
                asset={assets.get(el.id) ?? null}
                isSelected={selectedElementId === el.id}
                isFlash={isFlash}
                pickedSlice={pickedSlice}
                onSelect={() => onSelect(el.id)}
                onAssign={onAssign}
                onUnassign={onUnassign}
                onReExtract={onReExtract}
              />
            )
          })}
        </Stack>
      )}

      {allAssigned && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'success.light', color: 'success.contrastText', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            全部已指派,可以进入下一步
          </Typography>
          <Button variant="contained" color="primary" size="small" onClick={onGoBack}>
            返回页面 · 上传 CDN / 导出
          </Button>
        </Box>
      )}
    </Box>
  )
}

// ─── OriginRefThumb ────────────────────────────────────────────────────────
// 用 CSS background 把原图的 bbox 区域裁出来当 56px 缩略图(保持 bbox 纵横比,
// 不用后端裁切 API)。background-size 把 bbox 放大到容器 100%,position 对准区域。

function OriginRefThumb({
  stateId,
  bbox,
  stateW,
  stateH,
}: {
  stateId: string
  bbox: readonly [number, number, number, number] | number[]
  stateW: number
  stateH: number
}): React.ReactElement {
  const [x = 0, y = 0, w = 1, h = 1] = bbox
  const aspect = (w * stateW) / Math.max(1e-6, h * stateH)
  const bw = aspect >= 1 ? 52 : Math.max(8, Math.round(52 * aspect))
  const bh = aspect >= 1 ? Math.max(8, Math.round(52 / aspect)) : 52
  const posX = w >= 1 ? 0 : (x / (1 - w)) * 100
  const posY = h >= 1 ? 0 : (y / (1 - h)) * 100
  return (
    <Tooltip title="原图参考:该元素在设计稿里的样子" placement="top">
      <Box
        sx={{
          width: 56,
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'surface.container',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: bw,
            height: bh,
            backgroundImage: `url(/api/raw/${stateId})`,
            backgroundSize: `${100 / Math.max(w, 1e-6)}% ${100 / Math.max(h, 1e-6)}%`,
            backgroundPosition: `${posX}% ${posY}%`,
            borderRadius: 0.5,
          }}
        />
      </Box>
    </Tooltip>
  )
}

function alphaQualityColor(quality: number): string {
  if (quality >= 0.7) return '#16a34a' // success
  if (quality >= 0.3) return '#d97706' // warning
  return '#b91c1c' // error
}

function ElementRow({
  state,
  element,
  asset,
  isSelected,
  isFlash,
  pickedSlice,
  onSelect,
  onAssign,
  onUnassign,
  onReExtract,
}: {
  state: StateRecord
  element: LayoutElement
  asset: Asset | null
  isSelected: boolean
  isFlash: boolean
  pickedSlice: DragPayload | null
  onSelect: () => void
  onAssign: (elementId: string, payload: DragPayload) => Promise<void>
  onUnassign: (elementId: string) => Promise<void>
  onReExtract: (elementId: string) => Promise<void>
}): React.ReactElement {
  const [reExtracting, setReExtracting] = useState(false)
  const [hover, setHover] = useState(false)
  const color = CATEGORY_COLOR[element.visual_category]

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setHover(false)
    const data = e.dataTransfer.getData(DRAG_MIME)
    if (!data) return
    const payload = JSON.parse(data) as DragPayload
    void onAssign(element.id, payload)
  }

  // 「已选切片态」下整张 row 是 click-to-assign 目标;无 picked 时点击 = onSelect
  const handleRowClick = (): void => {
    if (pickedSlice) {
      void onAssign(element.id, pickedSlice)
    } else {
      onSelect()
    }
  }

  const reExtract = async (): Promise<void> => {
    setReExtracting(true)
    try {
      await onReExtract(element.id)
    } finally {
      setReExtracting(false)
    }
  }

  return (
    <Card
      variant="outlined"
      data-element-id={element.id}
      onClick={handleRowClick}
      onDragOver={(e) => {
        e.preventDefault()
        setHover(true)
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      sx={{
        p: 1.25,
        cursor: pickedSlice ? 'copy' : 'pointer',
        borderLeft: 3,
        borderLeftColor: color,
        borderColor: pickedSlice
          ? alpha(PRIMARY, 0.55)
          : isSelected
            ? 'primary.main'
            : 'divider',
        borderWidth: isSelected || pickedSlice ? 2 : 1,
        bgcolor: hover
          ? 'action.hover'
          : pickedSlice
            ? alpha(PRIMARY, 0.04)
            : undefined,
        transition:
          'border-color 150ms cubic-bezier(0.2, 0, 0, 1), background-color 150ms cubic-bezier(0.2, 0, 0, 1)',
        ...(isFlash
          ? { animation: `${successFlash} 700ms ${MD3_STANDARD_EASING}` }
          : {}),
        '&:hover': pickedSlice
          ? {
              bgcolor: alpha(PRIMARY, 0.12),
              borderColor: PRIMARY,
            }
          : {},
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center">
        {/* 原图参考:该元素在设计稿里的样子(切片↔元素关联可视化,
            指派时直接对照,不用回设计稿找) */}
        <OriginRefThumb
          stateId={state.id}
          bbox={element.bbox}
          stateW={state.width}
          stateH={state.height}
        />
        {/* asset preview / drop placeholder
            没 asset 时显示更明显的「拖放或点选切片到此」提示,带 + 图标和虚线主色框 */}
        <Box
          sx={{
            width: 56,
            height: 56,
            flexShrink: 0,
            border: asset ? '1px dashed transparent' : '1.5px dashed',
            borderColor: asset
              ? 'transparent'
              : pickedSlice || hover
                ? PRIMARY
                : alpha(PRIMARY, 0.4),
            borderRadius: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.25,
            bgcolor: asset
              ? 'background.default'
              : pickedSlice || hover
                ? alpha(PRIMARY, 0.08)
                : alpha(PRIMARY, 0.03),
            backgroundImage: asset
              ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50%/10px 10px'
              : undefined,
            transition: 'all 150ms cubic-bezier(0.2, 0, 0, 1)',
            color: pickedSlice || hover ? PRIMARY : alpha(PRIMARY, 0.55),
          }}
        >
          {asset ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/asset-bin/${element.id}?t=${asset.updated_at}`}
              alt="asset"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <>
              <AddIcon size={18} />
              <Typography
                sx={{
                  fontSize: 9,
                  lineHeight: 1,
                  color: 'inherit',
                  fontWeight: 500,
                }}
              >
                {pickedSlice ? '点击指派' : '拖放'}
              </Typography>
            </>
          )}
        </Box>

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="body1" fontWeight={500} noWrap>
              {element.name}
            </Typography>
            <Chip size="small" label={VISUAL_CATEGORY_CN[element.visual_category]} variant="outlined" />
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {element.description}
          </Typography>
          {asset && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
              {/* α 质量:小色点 + 数值,跟 home/project-detail StatusDot 风格一致但用 warning 色当中段 */}
              <Stack direction="row" alignItems="center" gap={0.5}>
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor: alphaQualityColor(asset.alpha_quality),
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  α {asset.alpha_quality.toFixed(2)}
                </Typography>
              </Stack>
              {asset.validation_notes?.includes('contamination=true') && (
                <Chip size="small" label="⚠ 污染" color="warning" />
              )}
              {asset.validation_notes?.includes('complete=false') && (
                <Chip size="small" label="⚠ 不完整" color="error" />
              )}
              {asset.status === 'validated' &&
                !asset.validation_notes?.includes('contamination=true') &&
                !asset.validation_notes?.includes('complete=false') && (
                  <Chip size="small" label="✓ 已校验" color="success" variant="outlined" />
                )}
              {asset.cdn_url && <Chip size="small" label="已 CDN" color="primary" variant="outlined" />}
            </Stack>
          )}
        </Box>

        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            variant="outlined"
            startIcon={reExtracting ? <CircularProgress size={14} /> : <RefreshIcon />}
            disabled={reExtracting}
            onClick={(e) => {
              e.stopPropagation()
              void reExtract()
            }}
          >
            重抠
          </Button>
          {asset && (
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation()
                void onUnassign(element.id)
              }}
            >
              <DeleteIcon size={16} />
            </IconButton>
          )}
        </Stack>
      </Stack>
    </Card>
  )
}

// ─── SubCropDialog ─────────────────────────────────────────────────────────

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

function SubCropDialog({
  stateId,
  category,
  idx,
  onClose,
  onCreated,
}: {
  stateId: string
  category: VisualCategory
  idx: number
  onClose: () => void
  onCreated: () => void
}): React.ReactElement {
  const [rects, setRects] = useState<CropRect[]>([])
  const [imgRect, setImgRect] = useState<{ width: number; height: number; offsetX: number; offsetY: number; natW: number; natH: number } | null>(null)
  const [drawing, setDrawing] = useState<{ startX: number; startY: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = e.currentTarget
    const rect = img.getBoundingClientRect()
    const parent = img.parentElement?.getBoundingClientRect()
    if (!parent) return
    setImgRect({
      width: rect.width,
      height: rect.height,
      offsetX: rect.left - parent.left,
      offsetY: rect.top - parent.top,
      natW: img.naturalWidth,
      natH: img.naturalHeight,
    })
  }

  const onMouseDown = (e: React.MouseEvent): void => {
    if (!imgRect) return
    const target = e.currentTarget as HTMLDivElement
    const rect = target.getBoundingClientRect()
    setDrawing({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
    })
  }

  const onMouseMove = (_e: React.MouseEvent): void => {
    /* live preview omitted for simplicity */
  }

  const onMouseUp = (e: React.MouseEvent): void => {
    if (!drawing || !imgRect) return
    const target = e.currentTarget as HTMLDivElement
    const rect = target.getBoundingClientRect()
    const endX = e.clientX - rect.left
    const endY = e.clientY - rect.top
    const x1 = Math.min(drawing.startX, endX) - imgRect.offsetX
    const y1 = Math.min(drawing.startY, endY) - imgRect.offsetY
    const x2 = Math.max(drawing.startX, endX) - imgRect.offsetX
    const y2 = Math.max(drawing.startY, endY) - imgRect.offsetY
    if (x2 - x1 > 6 && y2 - y1 > 6) {
      // 转换到 natural pixel coords
      const sx = imgRect.natW / imgRect.width
      const sy = imgRect.natH / imgRect.height
      setRects((prev) => [
        ...prev,
        {
          x: Math.max(0, x1 * sx),
          y: Math.max(0, y1 * sy),
          w: (x2 - x1) * sx,
          h: (y2 - y1) * sy,
        },
      ])
    }
    setDrawing(null)
  }

  const submit = async (): Promise<void> => {
    if (rects.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/states/${stateId}/slices/${category}/${idx}/sub-crop`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rects }),
        },
      )
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { created: SliceInfo[] }
      toast.success(`切出 ${data.created.length} 个新切片`)
      onCreated()
    } catch (err) {
      toast.error(`切片失败:${errText(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        切片 sub-crop · {VISUAL_CATEGORY_CN[category]} #{idx} ({rects.length} 个框)
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          按住鼠标拖出框,可画多个。提交后按框各生成一张新切片(原切片保留)。
        </Typography>
        <Box
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          sx={{
            position: 'relative',
            display: 'inline-block',
            border: '1px solid',
            borderColor: 'divider',
            backgroundImage:
              'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50%/16px 16px',
            cursor: 'crosshair',
            userSelect: 'none',
            width: '100%',
            minHeight: 400,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/states/${stateId}/slices/${category}/${idx}`}
            alt="slice"
            onLoad={onImgLoad}
            draggable={false}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '60vh',
              margin: '0 auto',
              pointerEvents: 'none',
            }}
          />
          {imgRect &&
            rects.map((r, i) => {
              const sx = imgRect.width / imgRect.natW
              const sy = imgRect.height / imgRect.natH
              return (
                <Box
                  key={i}
                  sx={{
                    position: 'absolute',
                    left: imgRect.offsetX + r.x * sx,
                    top: imgRect.offsetY + r.y * sy,
                    width: r.w * sx,
                    height: r.h * sy,
                    border: `2px solid ${PRIMARY}`,
                    bgcolor: alpha(PRIMARY, 0.15),
                    pointerEvents: 'none',
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -20,
                      left: 0,
                      bgcolor: PRIMARY,
                      color: 'white',
                      px: 0.75,
                      py: 0.25,
                      fontSize: 11,
                      borderRadius: '4px 4px 4px 0',
                    }}
                  >
                    框 #{i + 1}
                  </Box>
                </Box>
              )
            })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setRects([])} disabled={rects.length === 0}>
          清空
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={rects.length === 0 || submitting}
        >
          切出 {rects.length} 个新切片
        </Button>
      </DialogActions>
    </Dialog>
  )
}

void LinearProgress
