'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import FormLabel from '@mui/material/FormLabel'
import RadioGroup from '@mui/material/RadioGroup'
import Radio from '@mui/material/Radio'
import FormControlLabel from '@mui/material/FormControlLabel'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import Collapse from '@mui/material/Collapse'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckIcon from '@mui/icons-material/Check'
import RestoreIcon from '@mui/icons-material/Restore'
import SaveIcon from '@mui/icons-material/Save'
import { AppShell } from '@/components/AppShell'
import { ALL_VISUAL_CATEGORIES, VISUAL_CATEGORY_CN, VISUAL_CATEGORY_COLOR } from '@/lib/visual-category'
import type {
  LayoutElement,
  Page,
  Project,
  StateRecord,
  VisualCategory,
  BBox,
} from '@/lib/types'

// ─── color per category ───────────────────────────────────────────────────
const CATEGORY_COLOR = VISUAL_CATEGORY_COLOR

interface PageWithStates extends Page {
  states: StateRecord[]
}

interface ElementsApiResponse {
  elements: LayoutElement[]
}

interface PipelineRunMin {
  id: string
  parsed_result?: { filtered_tiny?: LayoutElement[] }
}

// ─── main ─────────────────────────────────────────────────────────────────

export function ElementReviewClient({
  projectId,
  pageId,
}: {
  projectId: string
  pageId: string
}): React.ReactElement {
  const [project, setProject] = useState<Project | null>(null)
  const [page, setPage] = useState<PageWithStates | null>(null)
  const [elements, setElements] = useState<LayoutElement[]>([])
  const [filteredTiny, setFilteredTiny] = useState<LayoutElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  // 默认隐藏 code 类型(只画 static 的 bbox + 列表)
  const [visibleTypes, setVisibleTypes] = useState<Set<'static' | 'code'>>(
    () => new Set(['static']),
  )
  // 视觉类别:默认全选
  const [visibleCategories, setVisibleCategories] = useState<Set<VisualCategory>>(
    () => new Set(ALL_VISUAL_CATEGORIES),
  )

  // 深链:?selected=<element_id> → 加载完元素后自动选中
  const searchParams = useSearchParams()
  const initialSelectedId = searchParams?.get('selected') ?? null

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [proj, pg, els] = await Promise.all([
        fetch(`/api/projects/${projectId}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/pages/${pageId}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/pages/${pageId}/elements`).then((r): Promise<ElementsApiResponse> => r.json()),
      ])
      setProject(proj as Project | null)
      setPage(pg as PageWithStates | null)
      setElements(els.elements ?? [])

      // 拉 PipelineRun audit 看 filtered_tiny
      const state = (pg as PageWithStates | null)?.states[0]
      if (state?.pass1_run_id) {
        const run = (await fetch(`/api/pipeline-runs/${state.pass1_run_id}`).then((r) =>
          r.ok ? r.json() : null,
        )) as PipelineRunMin | null
        // pipeline_run audit 没有 filtered_tiny(只有 sub-runs 有)。这里 V1 简化:扫所有 sub-runs 不现实
        // 改为直接读 sub-runs(需要新 endpoint)。MVP:先空着,Phase 6+ 加 list-runs by state endpoint
        void run // placeholder
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

  // 深链:首次加载完元素后,如 ?selected=<id> 命中已存在元素,选中并滚动到对应 row
  // 注:不自动改 type/category 过滤(尊重 default static-only);若目标被过滤掉,
  // 右侧详情仍会显示(detail 基于全集查找),用户可点 chip 自行展开。
  const didDeepLinkRef = useRef(false)
  useEffect(() => {
    if (didDeepLinkRef.current) return
    if (!initialSelectedId || elements.length === 0) return
    if (!elements.some((e) => e.id === initialSelectedId)) return
    setSelectedId(initialSelectedId)
    didDeepLinkRef.current = true
    // wait next tick for highlight + 滚动到中央(若 row 被过滤掉,scrollIntoView 静默 no-op)
    setTimeout(() => {
      const row = document.querySelector(
        `[data-element-id="${initialSelectedId}"]`,
      ) as HTMLElement | null
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }, [elements, initialSelectedId])

  const updateElement = useCallback(
    (id: string, patch: Partial<LayoutElement>): void => {
      setElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, ...patch } : el)),
      )
      setDirty(true)
    },
    [],
  )

  const removeElement = useCallback((id: string): void => {
    setElements((prev) => prev.filter((el) => el.id !== id))
    setSelectedId((prev) => (prev === id ? null : prev))
    setDirty(true)
  }, [])

  const restoreFromTiny = useCallback((el: LayoutElement): void => {
    setFilteredTiny((prev) => prev.filter((t) => t.id !== el.id))
    setElements((prev) => [...prev, { ...el, reviewed: false }])
    setDirty(true)
  }, [])

  const save = useCallback(async (): Promise<void> => {
    setSaving(true)
    try {
      const res = await fetch(`/api/pages/${pageId}/elements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('已保存')
      setDirty(false)
    } catch (err) {
      toast.error(`保存失败:${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }, [pageId, elements])

  const allReviewed = elements.length > 0 && elements.every((e) => e.reviewed)

  const selected = useMemo(
    () => elements.find((e) => e.id === selectedId) ?? null,
    [elements, selectedId],
  )
  const typeCounts = useMemo(() => {
    const counts: Record<'static' | 'code', number> = { static: 0, code: 0 }
    // 计算 type 计数时,只考虑当前 category 过滤后的元素(faceted filtering)
    for (const el of elements) {
      if (visibleCategories.has(el.visual_category)) counts[el.type]++
    }
    return counts
  }, [elements, visibleCategories])
  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      ALL_VISUAL_CATEGORIES.map((c) => [c, 0]),
    ) as Record<VisualCategory, number>
    // 计算 category 计数时,只考虑当前 type 过滤后的元素
    for (const el of elements) {
      if (visibleTypes.has(el.type)) counts[el.visual_category]++
    }
    return counts
  }, [elements, visibleTypes])
  const visibleElements = useMemo(
    () => {
      const filtered = elements.filter(
        (e) => visibleTypes.has(e.type) && visibleCategories.has(e.visual_category),
      )
      // 排序:category 顺序 → bbox y(上→下) → bbox x(左→右)
      const catIdx = (c: VisualCategory): number => ALL_VISUAL_CATEGORIES.indexOf(c)
      return filtered.sort((a, b) => {
        const dc = catIdx(a.visual_category) - catIdx(b.visual_category)
        if (dc !== 0) return dc
        const dy = a.bbox[1] - b.bbox[1]
        if (dy !== 0) return dy
        return a.bbox[0] - b.bbox[0]
      })
    },
    [elements, visibleTypes, visibleCategories],
  )
  const toggleType = useCallback((t: 'static' | 'code'): void => {
    setVisibleTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }, [])
  const toggleCategory = useCallback((c: VisualCategory): void => {
    setVisibleCategories((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }, [])
  const state = page?.states[0]
  const breadcrumbs = useMemo(
    () =>
      project && page
        ? [
            { label: '项目', href: '/' },
            { label: project.name, href: `/projects/${projectId}` },
            { label: page.name, href: `/projects/${projectId}/pages/${pageId}` },
            { label: 'Element Review' },
          ]
        : [{ label: '加载中…' }],
    [project, page, projectId, pageId],
  )

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      rightAction={
        <Button
          variant="contained"
          color="primary"
          size="small"
          startIcon={<SaveIcon />}
          disabled={!dirty || saving}
          onClick={() => void save()}
          sx={{ mr: 1 }}
        >
          保存
        </Button>
      }
    >
      <Container maxWidth={false} sx={{ py: 3 }}>
        {loading || !state ? (
          <Skeleton variant="rounded" height={600} />
        ) : (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ height: 'calc(100vh - 120px)' }}>
            {/* 左:Element 列表 */}
            <ElementSidebar
              elements={elements}
              visibleElements={visibleElements}
              typeCounts={typeCounts}
              visibleTypes={visibleTypes}
              onToggleType={toggleType}
              categoryCounts={categoryCounts}
              visibleCategories={visibleCategories}
              onToggleCategory={toggleCategory}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMarkAllReviewed={() => {
                setElements((prev) => prev.map((e) => ({ ...e, reviewed: true })))
                setDirty(true)
              }}
              filteredTiny={filteredTiny}
              onRestore={restoreFromTiny}
              allReviewed={allReviewed}
              onProceed={async () => {
                if (dirty) await save()
                if (!state) return
                // P1-2 修复:点击 = 真触发 Pass 2,然后跳页面看进度
                try {
                  const res = await fetch(`/api/states/${state.id}/pass2`, {
                    method: 'POST',
                  })
                  if (!res.ok) throw new Error(await res.text())
                  toast.info('Pass 2 启动…回到页面看进度')
                } catch (err) {
                  toast.error(`Pass 2 启动失败:${err instanceof Error ? err.message : String(err)}`)
                }
                window.location.href = `/projects/${projectId}/pages/${pageId}`
              }}
            />
            {/* 中:Canvas + bbox 叠加 */}
            <ElementCanvas
              state={state}
              elements={visibleElements}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChangeBbox={(id, bbox) => updateElement(id, { bbox })}
            />
            {/* 右:详情 */}
            <ElementDetail
              element={selected}
              onChange={(patch) => selected && updateElement(selected.id, patch)}
              onDelete={() => selected && removeElement(selected.id)}
            />
          </Stack>
        )}
      </Container>
    </AppShell>
  )
}

// ─── ElementSidebar ────────────────────────────────────────────────────────

function ElementSidebar({
  elements,
  visibleElements,
  typeCounts,
  visibleTypes,
  onToggleType,
  categoryCounts,
  visibleCategories,
  onToggleCategory,
  selectedId,
  onSelect,
  onMarkAllReviewed,
  filteredTiny,
  onRestore,
  allReviewed,
  onProceed,
}: {
  elements: LayoutElement[]
  visibleElements: LayoutElement[]
  typeCounts: Record<'static' | 'code', number>
  visibleTypes: Set<'static' | 'code'>
  onToggleType: (t: 'static' | 'code') => void
  categoryCounts: Record<VisualCategory, number>
  visibleCategories: Set<VisualCategory>
  onToggleCategory: (c: VisualCategory) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMarkAllReviewed: () => void
  filteredTiny: LayoutElement[]
  onRestore: (el: LayoutElement) => void
  allReviewed: boolean
  onProceed: () => void
}): React.ReactElement {
  const [tinyOpen, setTinyOpen] = useState(false)
  const reviewedCount = elements.filter((e) => e.reviewed).length
  const filteringActive =
    visibleTypes.size < 2 || visibleCategories.size < ALL_VISUAL_CATEGORIES.length

  return (
    <Box sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">
          Elements ({filteringActive ? `${visibleElements.length}/${elements.length}` : elements.length})
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {reviewedCount}/{elements.length} 已确认
        </Typography>
      </Box>

      {/* 过滤:type + visual_category */}
      <Box sx={{ px: 1.5, pb: 1 }}>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
          {(['static', 'code'] as const).map((t) => {
            const active = visibleTypes.has(t)
            return (
              <Chip
                key={t}
                size="small"
                label={`${t} ${typeCounts[t]}`}
                onClick={() => onToggleType(t)}
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                sx={{ opacity: active ? 1 : 0.55 }}
              />
            )
          })}
        </Stack>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {ALL_VISUAL_CATEGORIES.map((c) => {
            const active = visibleCategories.has(c)
            const color = CATEGORY_COLOR[c]
            return (
              <Chip
                key={c}
                size="small"
                onClick={() => onToggleCategory(c)}
                variant={active ? 'filled' : 'outlined'}
                label={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: color,
                        flexShrink: 0,
                      }}
                    />
                    <span>
                      {VISUAL_CATEGORY_CN[c]} {categoryCounts[c]}
                    </span>
                  </Stack>
                }
                sx={{
                  opacity: active ? 1 : 0.5,
                  bgcolor: active ? `${color}1f` : undefined,
                  borderColor: active ? color : undefined,
                  '& .MuiChip-label': { display: 'flex', px: 0.75 },
                }}
              />
            )
          })}
        </Stack>
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 1, pb: 2 }}>
        <Stack spacing={1}>
          {visibleElements.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              {elements.length === 0 ? '没有元素' : '当前过滤无匹配'}
            </Typography>
          ) : (
            visibleElements.map((el) => {
              const color = CATEGORY_COLOR[el.visual_category]
              const isSel = selectedId === el.id
              return (
                <Card
                  key={el.id}
                  variant="outlined"
                  data-element-id={el.id}
                  sx={{
                    borderLeft: 4,
                    borderLeftColor: color,
                    bgcolor: isSel ? `${color}1f` : undefined,
                    borderColor: isSel ? color : 'divider',
                    borderWidth: isSel ? 2 : 1,
                  }}
                >
                  <CardActionArea onClick={() => onSelect(el.id)} sx={{ p: 1.25 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap fontWeight={500}>
                        {el.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        component="div"
                      >
                        {el.reviewed ? '✅' : '⏳'} {el.type} ·{' '}
                        <Box component="span" sx={{ color, fontWeight: 500 }}>
                          {VISUAL_CATEGORY_CN[el.visual_category]}
                        </Box>
                      </Typography>
                    </Box>
                  </CardActionArea>
                </Card>
              )
            })
          )}
        </Stack>

        {filteredTiny.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Button
              size="small"
              fullWidth
              startIcon={tinyOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setTinyOpen((v) => !v)}
              sx={{ justifyContent: 'flex-start' }}
            >
              已过滤的小元素 ({filteredTiny.length})
            </Button>
            <Collapse in={tinyOpen}>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {filteredTiny.map((el) => (
                  <Stack key={el.id} direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="caption" sx={{ flexGrow: 1 }} noWrap>
                      {el.name}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => onRestore(el)}
                      title="恢复到 elements 列表"
                    >
                      <RestoreIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            </Collapse>
          </Box>
        )}
      </Box>

      <Divider />
      <Box sx={{ p: 1.5 }}>
        <Stack spacing={1}>
          <Button size="small" variant="outlined" onClick={onMarkAllReviewed} startIcon={<CheckIcon />}>
            全部标记已确认
          </Button>
          <Button
            size="small"
            variant="contained"
            color="primary"
            disabled={!allReviewed}
            onClick={onProceed}
          >
            返回页面 · 运行 Pass 2
          </Button>
        </Stack>
      </Box>
    </Box>
  )
}

// ─── ElementCanvas ─────────────────────────────────────────────────────────

interface DragState {
  kind: 'move' | 'resize'
  /** for resize: which handle */
  handle?: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  startMouseX: number
  startMouseY: number
  startBbox: BBox
  elementId: string
}

function ElementCanvas({
  state,
  elements,
  selectedId,
  onSelect,
  onChangeBbox,
}: {
  state: StateRecord
  elements: LayoutElement[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChangeBbox: (id: string, bbox: BBox) => void
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgRect, setImgRect] = useState<{ width: number; height: number; offsetX: number; offsetY: number } | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const recalcRect = useCallback(() => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container) return
    const cRect = container.getBoundingClientRect()
    const iRect = img.getBoundingClientRect()
    setImgRect({
      width: iRect.width,
      height: iRect.height,
      offsetX: iRect.left - cRect.left,
      offsetY: iRect.top - cRect.top,
    })
  }, [])

  useEffect(() => {
    recalcRect()
    window.addEventListener('resize', recalcRect)
    return () => window.removeEventListener('resize', recalcRect)
  }, [recalcRect])

  // mouse handlers (window-level for drag)
  useEffect(() => {
    if (!drag || !imgRect) return
    const onMove = (e: MouseEvent): void => {
      const dx = (e.clientX - drag.startMouseX) / imgRect.width
      const dy = (e.clientY - drag.startMouseY) / imgRect.height
      const [bx, by, bw, bh] = drag.startBbox
      let nx = bx, ny = by, nw = bw, nh = bh

      if (drag.kind === 'move') {
        nx = bx + dx
        ny = by + dy
      } else if (drag.kind === 'resize') {
        const h = drag.handle ?? 'se'
        if (h.includes('w')) { nx = bx + dx; nw = bw - dx }
        if (h.includes('e')) { nw = bw + dx }
        if (h.includes('n')) { ny = by + dy; nh = bh - dy }
        if (h.includes('s')) { nh = bh + dy }
      }

      // clamp
      nx = Math.max(0, Math.min(1, nx))
      ny = Math.max(0, Math.min(1, ny))
      nw = Math.max(0.001, Math.min(1 - nx, nw))
      nh = Math.max(0.001, Math.min(1 - ny, nh))
      onChangeBbox(drag.elementId, [nx, ny, nw, nh])
    }
    const onUp = (): void => setDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, imgRect, onChangeBbox])

  const startDrag = (
    e: React.MouseEvent,
    elementId: string,
    bbox: BBox,
    kind: 'move' | 'resize',
    handle?: DragState['handle'],
  ): void => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(elementId)
    setDrag({
      kind,
      ...(handle ? { handle } : {}),
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBbox: bbox,
      elementId,
    })
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        flexGrow: 1,
        position: 'relative',
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null)
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={`/api/raw/${state.id}`}
        alt="design"
        onLoad={recalcRect}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', pointerEvents: 'none' }}
      />
      {imgRect &&
        elements.map((el) => {
          const isSelected = el.id === selectedId
          const color = CATEGORY_COLOR[el.visual_category]
          const left = imgRect.offsetX + el.bbox[0] * imgRect.width
          const top = imgRect.offsetY + el.bbox[1] * imgRect.height
          const width = el.bbox[2] * imgRect.width
          const height = el.bbox[3] * imgRect.height
          return (
            <Box
              key={el.id}
              onMouseDown={(e: React.MouseEvent) => startDrag(e, el.id, el.bbox, 'move')}
              sx={{
                position: 'absolute',
                left,
                top,
                width,
                height,
                border: `${isSelected ? 2 : 1}px solid ${color}`,
                bgcolor: isSelected ? `${color}22` : 'transparent',
                cursor: 'move',
                // P1-1 修复:选中元素 + 它的 handles 永远在最上层,防止嵌套 bbox 抢焦点
                zIndex: isSelected ? 100 : 1,
                ...(isSelected ? { boxShadow: `0 0 0 2px ${color}55` } : {}),
                '&:hover': { bgcolor: `${color}1a` },
              }}
            >
              {/* label chip */}
              <Box
                sx={{
                  position: 'absolute',
                  top: -22,
                  left: -2,
                  px: 0.75,
                  py: 0.25,
                  fontSize: 10,
                  fontWeight: 500,
                  bgcolor: color,
                  color: 'white',
                  borderRadius: '4px 4px 4px 0',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {el.name}
              </Box>
              {/* resize handles (only on selected) */}
              {isSelected &&
                (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((h) => {
                  // 用百分比 + translate(-50%, -50%) 让 handle 中心精确落在 bbox
                  // 角点 / 边中点的几何位置上(handle 跨框线居中,Figma 标准)
                  const positions: Record<typeof h, { left: string; top: string; cursor: string }> = {
                    nw: { left: '0%', top: '0%', cursor: 'nwse-resize' },
                    n: { left: '50%', top: '0%', cursor: 'ns-resize' },
                    ne: { left: '100%', top: '0%', cursor: 'nesw-resize' },
                    e: { left: '100%', top: '50%', cursor: 'ew-resize' },
                    se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
                    s: { left: '50%', top: '100%', cursor: 'ns-resize' },
                    sw: { left: '0%', top: '100%', cursor: 'nesw-resize' },
                    w: { left: '0%', top: '50%', cursor: 'ew-resize' },
                  }
                  return (
                    <Box
                      key={h}
                      onMouseDown={(e) => startDrag(e, el.id, el.bbox, 'resize', h)}
                      sx={{
                        position: 'absolute',
                        width: 10,
                        height: 10,
                        bgcolor: 'background.paper',
                        border: `1.5px solid ${color}`,
                        borderRadius: '2px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                        transform: 'translate(-50%, -50%)',
                        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                        '&:hover': {
                          transform: 'translate(-50%, -50%) scale(1.25)',
                          boxShadow: `0 0 0 3px ${color}33, 0 1px 2px rgba(0,0,0,0.22)`,
                        },
                        ...positions[h],
                      }}
                    />
                  )
                })}
            </Box>
          )
        })}
    </Box>
  )
}

// ─── ElementDetail (right panel) ───────────────────────────────────────────

function ElementDetail({
  element,
  onChange,
  onDelete,
}: {
  element: LayoutElement | null
  onChange: (patch: Partial<LayoutElement>) => void
  onDelete: () => void
}): React.ReactElement {
  if (!element) {
    return (
      <Box sx={{ width: 320, flexShrink: 0, p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          点击元素查看 / 编辑
        </Typography>
      </Box>
    )
  }
  const [px, py, pw, ph] = element.bbox
  return (
    <Box sx={{ width: 320, flexShrink: 0, p: 2, overflowY: 'auto' }}>
      <Stack spacing={2}>
        <Typography variant="h5" noWrap>
          {element.name || '(未命名)'}
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {element.pass1_routes_seen?.map((r) => (
            <Chip key={r} size="small" label={r} variant="outlined" />
          ))}
        </Stack>
        <TextField
          label="名称"
          size="small"
          value={element.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <FormControl size="small">
          <FormLabel>type</FormLabel>
          <RadioGroup
            row
            value={element.type}
            onChange={(e) => onChange({ type: e.target.value as 'static' | 'code' })}
          >
            <FormControlLabel value="static" control={<Radio size="small" />} label="static" />
            <FormControlLabel value="code" control={<Radio size="small" />} label="code" />
          </RadioGroup>
        </FormControl>
        <TextField
          select
          label="visual_category"
          size="small"
          value={element.visual_category}
          onChange={(e) => onChange({ visual_category: e.target.value as VisualCategory })}
        >
          {ALL_VISUAL_CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {VISUAL_CATEGORY_CN[c]} ({c})
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="描述"
          size="small"
          multiline
          rows={4}
          value={element.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <Box>
          <FormLabel sx={{ fontSize: 12 }}>bbox(归一化)</FormLabel>
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', color: 'text.secondary' }}>
            x={px.toFixed(3)} y={py.toFixed(3)} w={pw.toFixed(3)} h={ph.toFixed(3)}
          </Typography>
        </Box>
        {element.type === 'code' && (
          <>
            <TextField
              label="shape_spec"
              size="small"
              multiline
              rows={2}
              value={element.shape_spec ?? ''}
              onChange={(e) => onChange({ shape_spec: e.target.value })}
              helperText="SVG path / clip-path / 几何描述"
            />
            <TextField
              label="material_spec"
              size="small"
              multiline
              rows={2}
              value={element.material_spec ?? ''}
              onChange={(e) => onChange({ material_spec: e.target.value })}
              helperText="渐变 / 阴影 / 玻璃质感"
            />
          </>
        )}
        <TextField
          label="z-index"
          size="small"
          type="number"
          value={element.z_index}
          onChange={(e) => onChange({ z_index: parseInt(e.target.value, 10) || 0 })}
        />
        <Divider />
        <Stack direction="row" spacing={1}>
          <Button
            variant={element.reviewed ? 'outlined' : 'contained'}
            color="primary"
            startIcon={<CheckIcon />}
            onClick={() => onChange({ reviewed: !element.reviewed })}
            fullWidth
          >
            {element.reviewed ? '已确认' : '确认'}
          </Button>
          <IconButton color="error" onClick={onDelete}>
            <DeleteIcon />
          </IconButton>
        </Stack>
      </Stack>
    </Box>
  )
}
