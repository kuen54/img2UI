'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import RefreshIcon from '@mui/icons-material/Refresh'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import HealingIcon from '@mui/icons-material/Healing'
import DeleteIcon from '@mui/icons-material/Delete'
import { AppShell } from '@/components/AppShell'
import { ConfirmDialog } from '@/components/ConfirmDialog'
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
  const [project, setProject] = useState<Project | null>(null)
  const [page, setPage] = useState<PageWithStates | null>(null)
  const [elements, setElements] = useState<LayoutElement[]>([])
  const [assets, setAssets] = useState<Map<string, Asset>>(new Map())
  const [slices, setSlices] = useState<SliceWithAssign[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [subCropDialog, setSubCropDialog] = useState<{
    state_id: string
    category: VisualCategory
    idx: number
  } | null>(null)
  const [matting, setMatting] = useState(false)

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
        const [slicesRes] = await Promise.all([
          fetch(`/api/states/${state.id}/slices?page_id=${pageId}`).then(
            (r): Promise<{ slices: SliceWithAssign[] }> => r.json(),
          ),
        ])
        setSlices(slicesRes.slices ?? [])
        // Load assets for each static element
        const assetEntries = await Promise.all(
          elArr
            .filter((e) => e.type === 'static')
            .map(async (e) => {
              const r = await fetch(`/api/elements/${e.id}/asset`)
              const data = (await r.json()) as { asset: Asset | null }
              return [e.id, data.asset] as const
            }),
        )
        const map = new Map<string, Asset>()
        for (const [id, a] of assetEntries) {
          if (a) map.set(id, a)
        }
        setAssets(map)
      }
      setLoading(false)
    } catch (err) {
      toast.error(`加载失败:${err instanceof Error ? err.message : String(err)}`)
      setLoading(false)
    }
  }, [projectId, pageId])

  useEffect(() => {
    void reload()
  }, [reload])

  const state = page?.states[0]

  const handleAssign = useCallback(
    async (elementId: string, payload: DragPayload): Promise<void> => {
      try {
        const res = await fetch(`/api/elements/${elementId}/assign-slice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, page_id: pageId }),
        })
        if (!res.ok) throw new Error(await res.text())
        toast.success('已指派')
        void reload()
      } catch (err) {
        toast.error(`指派失败:${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [pageId, reload],
  )

  const handleUnassign = useCallback(
    async (elementId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/elements/${elementId}/asset`, { method: 'DELETE' })
        if (!res.ok && res.status !== 204) throw new Error(await res.text())
        toast.success('已撤销')
        void reload()
      } catch (err) {
        toast.error(`撤销失败:${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [reload],
  )

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
                toast.error(`重抠失败:${run.error?.message ?? ''}`)
              }
            })
        }, 2000)
      } catch (err) {
        toast.error(`重抠失败:${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [pageId, reload],
  )

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
        failed: VisualCategory[]
      }
      if (data.refreshed.length > 0) {
        toast.success(`已重抠 ${data.refreshed.join(', ')}`)
      }
      if (data.failed.length > 0) {
        toast.warning(`部分失败:${data.failed.join(', ')}`)
      }
      void reload()
    } catch (err) {
      toast.error(`抠图失败:${err instanceof Error ? err.message : String(err)}`)
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
          <Skeleton variant="rounded" height={600} />
        ) : (
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
              onSubCrop={(state_id, category, idx) =>
                setSubCropDialog({ state_id, category, idx })
              }
            />
            <ElementList
              elements={elements}
              assets={assets}
              selectedElementId={selectedElementId}
              onSelect={setSelectedElementId}
              onAssign={handleAssign}
              onUnassign={handleUnassign}
              onReExtract={handleReExtract}
              allAssigned={allAssigned}
              projectId={projectId}
              pageId={pageId}
            />
          </Stack>
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
  onSubCrop,
}: {
  stateId: string
  elements: LayoutElement[]
  slices: SliceWithAssign[]
  selectedElementId: string | null
  currentAssignment: { state_id: string; category: VisualCategory; idx: number } | null
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
        borderRadius: 2,
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
            onSubCrop={onSubCrop}
          />
        )
      })}
      {slices.length === 0 && (
        <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
          还没有切片。运行 Pass 2 后会出现。
        </Typography>
      )}
      <Box sx={{ mt: 2, fontSize: 12, color: 'text.secondary', lineHeight: 1.6 }}>
        <Box>边框颜色:</Box>
        <Box>· 灰 = 未指派</Box>
        <Box>· 蓝 = 当前选中 element 已用</Box>
        <Box>· 橙 = 别的 element 已用(允许重复)</Box>
      </Box>
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
  const [imgError, setImgError] = useState(false)

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
        <Box
          sx={{
            mt: 0.5,
            mb: 0.5,
            p: 1,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1.5,
            bgcolor: 'background.default',
            // 棋盘格背景表示透明区域
            backgroundImage:
              'linear-gradient(45deg, rgba(0,0,0,0.04) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.04) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.04) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.04) 75%)',
            backgroundSize: '12px 12px',
            backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 80,
          }}
        >
          {imgError ? (
            <Typography variant="caption" color="text.disabled">
              该 category 暂无 Pass 2 输出
            </Typography>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/states/${stateId}/keyed/${category}`}
              alt={`Pass 2 输出 - ${category}`}
              style={{
                maxWidth: '100%',
                maxHeight: 360,
                objectFit: 'contain',
                display: 'block',
              }}
              onError={() => setImgError(true)}
            />
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

function CategorySection({
  category,
  slices,
  selectedElementId,
  currentAssignment,
  onSubCrop,
}: {
  category: VisualCategory
  slices: SliceWithAssign[]
  selectedElementId: string | null
  currentAssignment: { state_id: string; category: VisualCategory; idx: number } | null
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
            const borderColor = usedByCurrent
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
                sx={{
                  position: 'relative',
                  width: 96,
                  height: 96,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  cursor: 'grab',
                  bgcolor: 'background.default',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  '&:hover .crop-btn': { opacity: 1 },
                }}
              >
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
                  <ContentCutIcon sx={{ fontSize: 14 }} />
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
  elements,
  assets,
  selectedElementId,
  onSelect,
  onAssign,
  onUnassign,
  onReExtract,
  allAssigned,
  projectId,
  pageId,
}: {
  elements: LayoutElement[]
  assets: Map<string, Asset>
  selectedElementId: string | null
  onSelect: (id: string) => void
  onAssign: (elementId: string, payload: DragPayload) => Promise<void>
  onUnassign: (elementId: string) => Promise<void>
  onReExtract: (elementId: string) => Promise<void>
  allAssigned: boolean
  projectId: string
  pageId: string
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
        borderRadius: 2,
        p: 1.5,
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="h5">
          元素列表 ({elements.length} 静态)
        </Typography>
        <Stack direction="row" spacing={1}>
          <Typography variant="caption" color="text.secondary">
            {Array.from(assets.values()).length} / {elements.length} 已指派
          </Typography>
        </Stack>
      </Stack>

      {elements.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
          没有 type=static 的元素
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {elements.map((el) => (
            <ElementRow
              key={el.id}
              element={el}
              asset={assets.get(el.id) ?? null}
              isSelected={selectedElementId === el.id}
              onSelect={() => onSelect(el.id)}
              onAssign={onAssign}
              onUnassign={onUnassign}
              onReExtract={onReExtract}
            />
          ))}
        </Stack>
      )}

      {allAssigned && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'success.light', color: 'success.contrastText', borderRadius: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            全部已指派,可以进入下一步
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => {
              window.location.href = `/projects/${projectId}/pages/${pageId}`
            }}
          >
            返回页面 · 上传 CDN / 导出
          </Button>
        </Box>
      )}
    </Box>
  )
}

function alphaQualityColor(quality: number): string {
  if (quality >= 0.7) return '#16a34a' // success
  if (quality >= 0.3) return '#d97706' // warning
  return '#b91c1c' // error
}

function ElementRow({
  element,
  asset,
  isSelected,
  onSelect,
  onAssign,
  onUnassign,
  onReExtract,
}: {
  element: LayoutElement
  asset: Asset | null
  isSelected: boolean
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
      onClick={onSelect}
      onDragOver={(e) => {
        e.preventDefault()
        setHover(true)
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      sx={{
        p: 1.25,
        cursor: 'pointer',
        borderLeft: 3,
        borderLeftColor: color,
        borderColor: isSelected ? 'primary.main' : 'divider',
        borderWidth: isSelected ? 2 : 1,
        bgcolor: hover ? 'action.hover' : undefined,
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center">
        {/* asset preview / placeholder */}
        <Box
          sx={{
            width: 56,
            height: 56,
            flexShrink: 0,
            border: '1px dashed',
            borderColor: asset ? 'transparent' : 'divider',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default',
            backgroundImage: asset
              ? undefined
              : 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50%/10px 10px',
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
            <Typography variant="body2" color="text.secondary">
              ?
            </Typography>
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
              <DeleteIcon fontSize="small" />
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
      toast.error(`切片失败:${err instanceof Error ? err.message : String(err)}`)
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
                    border: '2px solid #0d99ff',
                    bgcolor: 'rgba(13, 153, 255, 0.15)',
                    pointerEvents: 'none',
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -20,
                      left: 0,
                      bgcolor: '#0d99ff',
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
