'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { errText } from '@/lib/error-text'
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
import Slide from '@mui/material/Slide'
import Paper from '@mui/material/Paper'
import Popover from '@mui/material/Popover'
import CircularProgress from '@mui/material/CircularProgress'
import {
  ChevronDown as ExpandMoreIcon,
  ChevronUp as ExpandLessIcon,
  Trash2 as DeleteIcon,
  Check as CheckIcon,
  History as RestoreIcon,
  Save as SaveIcon,
  Keyboard as KeyboardOutlinedIcon,
  CircleCheck as CheckCircleIcon,
  Circle as RadioButtonUncheckedIcon,
  FilterX as FilterAltOffOutlinedIcon,
  MousePointerClick as TouchAppOutlinedIcon,
} from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { UnsavedNavDialog } from '@/components/UnsavedNavDialog'
import { EmptyState } from '@/components/EmptyState'
import { KbdHintRow, type KbdHintItem } from '@/components/KbdHint'
import { successFlash, MD3_STANDARD_EASING } from '@/components/flash'
import { riseInSx } from '@/theme'
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
  // 「仅未确认」筛选:收尾阶段只看还没过的元素
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false)
  // dirty 时拦下的导航目标(确认 Dialog 处理后 router.push)
  const [pendingNav, setPendingNav] = useState<string | null>(null)
  // 确认动作的绿闪微反馈:key 递增让同一行能重放动画
  const [flash, setFlash] = useState<{ id: string; key: number }>({ id: '', key: 0 })
  const confirmFlash = useCallback((id: string): void => {
    setFlash((f) => ({ id, key: f.key + 1 }))
  }, [])
  const router = useRouter()

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
      toast.error(`加载失败:${errText(err)}`)
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

  // 返回是否保存成功(onProceed 据此决定要不要继续)
  const save = useCallback(async (): Promise<boolean> => {
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
      return true
    } catch (err) {
      toast.error(`保存失败:${errText(err)}`)
      return false
    } finally {
      setSaving(false)
    }
  }, [pageId, elements])

  // dirty 离开防护:刷新 / 关 tab / window.location 离开时弹原生确认
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

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
        (e) =>
          visibleTypes.has(e.type) &&
          visibleCategories.has(e.visual_category) &&
          (!onlyUnreviewed || !e.reviewed),
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
    [elements, visibleTypes, visibleCategories, onlyUnreviewed],
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

  const scrollRowIntoView = useCallback((id: string): void => {
    // 等 React 渲染完(筛选可能让行刚出现)再滚
    setTimeout(() => {
      const row = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement | null
      row?.scrollIntoView({ block: 'nearest' })
    }, 0)
  }, [])

  // 键盘快捷键:↑/↓ 切元素、Enter 确认并跳下一个未确认、⌘/Ctrl+S 保存、Delete 删除。
  // review 是高频流水操作(几十个元素逐个过),不该每个都要鼠标点 3 次。
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      // 输入控件 / 下拉里不抢键(改名、描述、category select)
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable ||
          t.closest('[role="combobox"], [role="listbox"], [role="option"]'))
      )
        return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty && !saving) void save()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (visibleElements.length === 0) return
        e.preventDefault()
        const idx = visibleElements.findIndex((el) => el.id === selectedId)
        const next =
          e.key === 'ArrowDown'
            ? visibleElements[Math.min(idx + 1, visibleElements.length - 1)]!
            : visibleElements[Math.max(idx - 1, 0)]!
        setSelectedId(next.id)
        scrollRowIntoView(next.id)
        return
      }
      if (e.key === 'Enter') {
        // 普通按钮 / chip(保存、筛选等)让它自然响应 Enter,不抢
        if (
          t &&
          (t.tagName === 'BUTTON' || t.getAttribute('role') === 'button') &&
          !t.closest('[data-element-id]')
        )
          return
        if (!selectedId) return
        const cur = elements.find((el) => el.id === selectedId)
        if (!cur) return
        e.preventDefault()
        const confirming = !cur.reviewed
        updateElement(cur.id, { reviewed: confirming })
        if (confirming) confirmFlash(cur.id)
        if (confirming) {
          // 自动跳下一个未确认(从当前往后找,wrap 回开头)
          const idx = visibleElements.findIndex((el) => el.id === cur.id)
          const ordered = [
            ...visibleElements.slice(idx + 1),
            ...visibleElements.slice(0, Math.max(idx, 0)),
          ]
          const next = ordered.find((el) => !el.reviewed && el.id !== cur.id)
          if (next) {
            setSelectedId(next.id)
            scrollRowIntoView(next.id)
          }
        }
        return
      }
      if (e.key === 'Delete' && selectedId) {
        removeElement(selectedId)
        return
      }
      if (e.key === 'Escape') {
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    visibleElements,
    selectedId,
    elements,
    dirty,
    saving,
    save,
    updateElement,
    removeElement,
    scrollRowIntoView,
    confirmFlash,
  ])

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
      onNavigate={(href) => {
        if (!dirty) return true
        setPendingNav(href) // 拦下,交给「未保存」Dialog 处理
        return false
      }}
      rightAction={<ShortcutsHelp />}
    >
      <Container maxWidth={false} sx={{ py: 3 }}>
        {loading || !state ? (
          // 跟真实三栏布局同构的 Skeleton
          <Stack direction="row" spacing={2} sx={{ height: 'calc(100vh - 120px)' }}>
            <Skeleton variant="rounded" width={280} sx={{ height: '100%' }} />
            <Skeleton variant="rounded" sx={{ flexGrow: 1, height: '100%' }} />
            <Skeleton variant="rounded" width={320} sx={{ height: '100%' }} />
          </Stack>
        ) : (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ height: 'calc(100vh - 120px)', ...riseInSx }}>
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
              onlyUnreviewed={onlyUnreviewed}
              onToggleOnlyUnreviewed={() => setOnlyUnreviewed((v) => !v)}
              flash={flash}
              onProceed={async () => {
                // P3-#14:保存失败 / 后端拒绝时不跳转,留在页面处理
                if (dirty) {
                  const ok = await save()
                  if (!ok) return
                }
                if (!state) return
                try {
                  const res = await fetch(`/api/states/${state.id}/pass2`, {
                    method: 'POST',
                  })
                  if (!res.ok) {
                    const data = (await res.json().catch(() => null)) as {
                      error?: string
                      unreviewed_count?: number
                    } | null
                    const msg = data?.unreviewed_count
                      ? `还有 ${data.unreviewed_count} 个元素未确认`
                      : (data?.error ?? `HTTP ${res.status}`)
                    toast.error(`Pass 2 启动失败:${msg}`)
                    return
                  }
                  toast.info('Pass 2 启动…回到页面看进度')
                  router.push(`/projects/${projectId}/pages/${pageId}`)
                } catch (err) {
                  toast.error(`Pass 2 启动失败:${errText(err)}`)
                }
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
              onChange={(patch) => {
                if (!selected) return
                updateElement(selected.id, patch)
                if (patch.reviewed === true) confirmFlash(selected.id)
              }}
              onDelete={() => selected && removeElement(selected.id)}
            />
          </Stack>
        )}
      </Container>

      {/* 浮动保存条:dirty 时从底部滑入(Linear 风格),主操作不再藏在 AppBar */}
      <Slide direction="up" in={dirty || saving} mountOnEnter unmountOnExit>
        <Paper
          elevation={6}
          sx={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%) !important',
            zIndex: (t) => t.zIndex.snackbar,
            borderRadius: '10px',
            px: 2,
            py: 0.75,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            // 反色胶囊:浅色近黑底白字 / 深色近白底黑字(grey.900 = ink 轴)
            bgcolor: 'grey.900',
            color: 'background.paper',
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'warning.main',
              flexShrink: 0,
            }}
          />
          <Typography variant="body2" sx={{ color: 'inherit' }}>
            有未保存的修改
          </Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={
              saving ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <SaveIcon size={16} />
              )
            }
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '保存 ⌘S'}
          </Button>
        </Paper>
      </Slide>

      {/* 未保存离开确认(替代原生 window.confirm) */}
      <UnsavedNavDialog
        href={pendingNav}
        onClose={() => setPendingNav(null)}
        onSave={save}
        onNavigate={(href) => router.push(href)}
      />
    </AppShell>
  )
}

// ─── ShortcutsHelp:AppBar「?」快捷键说明 ──────────────────────────────────

const SHORTCUT_ITEMS: KbdHintItem[] = [
  { keys: ['↑', '↓'], label: '上下切换元素' },
  { keys: ['⏎'], label: '确认并跳到下一个未确认' },
  { keys: ['⌘', 'S'], label: '保存' },
  { keys: ['⌫'], label: '删除选中元素' },
  { keys: ['Esc'], label: '取消选择' },
]

function ShortcutsHelp(): React.ReactElement {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconButton
        size="small"
        aria-label="快捷键说明"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ mr: 1 }}
      >
        <KeyboardOutlinedIcon size={18} />
      </IconButton>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack spacing={1.25} sx={{ p: 2 }}>
          <Typography variant="overline">键盘快捷键</Typography>
          {SHORTCUT_ITEMS.map((item, i) => (
            <KbdHintRow key={i} items={[item]} />
          ))}
        </Stack>
      </Popover>
    </>
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
  onlyUnreviewed,
  onToggleOnlyUnreviewed,
  flash,
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
  onlyUnreviewed: boolean
  onToggleOnlyUnreviewed: () => void
  flash: { id: string; key: number }
  onProceed: () => void
}): React.ReactElement {
  const [tinyOpen, setTinyOpen] = useState(false)
  const reviewedCount = elements.filter((e) => e.reviewed).length
  const unreviewedCount = elements.length - reviewedCount
  const filteringActive =
    visibleTypes.size < 2 ||
    visibleCategories.size < ALL_VISUAL_CATEGORIES.length ||
    onlyUnreviewed

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
                variant={active ? 'filled' : 'outlined'}
                {...(active
                  ? {
                      icon: <CheckIcon size={14} />,
                      sx: {
                        // 嵌 &.MuiChip-filled 提升 specificity,
                        // 否则会被 theme 的 colorDefault 浅灰底吃掉
                        '&.MuiChip-filled': {
                          bgcolor: 'text.primary',
                          color: 'background.paper',
                          '&:hover': { bgcolor: 'text.primary' },
                        },
                        '& .MuiChip-icon': { color: 'background.paper' },
                      },
                    }
                  : {})}
              />
            )
          })}
          <Chip
            size="small"
            label={`仅未确认 ${unreviewedCount}`}
            onClick={onToggleOnlyUnreviewed}
            variant={onlyUnreviewed ? 'filled' : 'outlined'}
            color={onlyUnreviewed ? 'warning' : 'default'}
          />
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
                    {active ? (
                      <CheckIcon size={14} color="#fff" />
                    ) : (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: color,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span>
                      {VISUAL_CATEGORY_CN[c]} {categoryCounts[c]}
                    </span>
                  </Stack>
                }
                sx={{
                  // 同样:active 态 bgcolor 必须嵌 &.MuiChip-filled 才能压过 theme
                  ...(active
                    ? {
                        '&.MuiChip-filled': {
                          bgcolor: color,
                          color: '#fff',
                          borderColor: color,
                          '&:hover': { bgcolor: color },
                        },
                      }
                    : {}),
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
            <Box sx={{ py: 4 }}>
              <EmptyState
                variant="compact"
                icon={<FilterAltOffOutlinedIcon />}
                title={elements.length === 0 ? '没有元素' : '当前过滤无匹配'}
              />
            </Box>
          ) : (
            visibleElements.map((el) => {
              const color = CATEGORY_COLOR[el.visual_category]
              const isSel = selectedId === el.id
              const isFlash = flash.id === el.id
              return (
                <Card
                  // flash 行换 key 重挂载 → 动画可重放
                  key={isFlash ? `${el.id}-f${flash.key}` : el.id}
                  variant="outlined"
                  data-element-id={el.id}
                  sx={{
                    borderLeft: 4,
                    borderLeftColor: color,
                    bgcolor: isSel ? `${color}1f` : undefined,
                    borderColor: isSel ? color : 'divider',
                    transition: 'border-color 150ms, box-shadow 150ms',
                    ...(isSel ? { boxShadow: `0 0 0 1px ${color}` } : {}),
                    ...(isFlash
                      ? { animation: `${successFlash} 700ms ${MD3_STANDARD_EASING}` }
                      : {}),
                  }}
                >
                  <CardActionArea onClick={() => onSelect(el.id)} sx={{ p: 1.25 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap fontWeight={500}>
                        {el.name}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {el.reviewed ? (
                          <Box
                            component={CheckCircleIcon}
                            size={13}
                            sx={{ color: 'success.main', flexShrink: 0 }}
                          />
                        ) : (
                          <Box
                            component={RadioButtonUncheckedIcon}
                            size={13}
                            sx={{ color: 'text.disabled', flexShrink: 0 }}
                          />
                        )}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          component="div"
                        >
                          {el.type} ·{' '}
                          <Box component="span" sx={{ color, fontWeight: 500 }}>
                            {VISUAL_CATEGORY_CN[el.visual_category]}
                          </Box>
                        </Typography>
                      </Stack>
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
                      <RestoreIcon size={16} />
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
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 0.5 }}>
            <KbdHintRow
              wrap
              items={[
                { keys: ['↑', '↓'], label: '切换' },
                { keys: ['⏎'], label: '确认' },
                { keys: ['⌘S'], label: '保存' },
                { keys: ['⌫'], label: '删除' },
              ]}
            />
          </Box>
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
        borderRadius: 1,
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
      <Box sx={{ width: 320, flexShrink: 0, p: 2, pt: 8 }}>
        <EmptyState
          variant="compact"
          icon={<TouchAppOutlinedIcon />}
          title="点击元素查看 / 编辑"
        />
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
            <DeleteIcon size={18} />
          </IconButton>
        </Stack>
      </Stack>
    </Box>
  )
}
