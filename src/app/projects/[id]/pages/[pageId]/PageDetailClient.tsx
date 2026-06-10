'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { errText } from '@/lib/error-text'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import Card from '@mui/material/Card'
import Divider from '@mui/material/Divider'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Alert from '@mui/material/Alert'
import { alpha } from '@mui/material/styles'
import { dotGridBg } from '@/theme'
import {
  FileUp as UploadFileIcon,
  RotateCw as RefreshIcon,
  Trash2 as DeleteIcon,
  Play as PlayArrowIcon,
  Home as HomeIcon,
  Check as CheckIcon,
  X as CloseIcon,
  Layers as LayersOutlinedIcon,
  CircleCheckBig as TaskAltOutlinedIcon,
  Puzzle as ExtensionOutlinedIcon,
  CloudUpload as CloudUploadOutlinedIcon,
  Clock as ScheduleOutlinedIcon,
  SearchX as SearchOffOutlinedIcon,
} from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatChip } from '@/components/StatChip'
import { EmptyState } from '@/components/EmptyState'
import { StatusDot } from '@/components/StatusDot'
import {
  formatRelative,
  pipelineStatusLabel,
  type RunStatusKind,
} from '@/lib/format'
import {
  VISUAL_CATEGORY_CN,
  VISUAL_CATEGORY_COLOR,
} from '@/lib/visual-category'
import type {
  Project,
  Page,
  StateRecord,
  StatePipelineStatus,
  LayoutElement,
} from '@/lib/types'
import type { PageStats } from '@/lib/page-stats'

interface PageWithStates extends Page {
  states: StateRecord[]
  stats: PageStats
}

const STAGE_LABELS: Array<{ key: string; label: string }> = [
  { key: 'pass1', label: 'Pass 1 · 布局分析' },
  { key: 'element_review', label: 'Element Review' },
  { key: 'pass2', label: 'Pass 2 · 资产提取' },
  { key: 'asset_review', label: 'Asset Review' },
  { key: 'validate', label: 'Validate' },
  { key: 'export', label: 'Export' },
]

export function PageDetailClient({
  projectId,
  pageId,
}: {
  projectId: string
  pageId: string
}): React.ReactElement {
  const [project, setProject] = useState<Project | null>(null)
  const [page, setPage] = useState<PageWithStates | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback((): void => {
    void Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/pages/${pageId}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([proj, pg]: [Project | null, PageWithStates | null]) => {
        setProject(proj)
        setPage(pg)
        setLoading(false)
      })
      .catch((err) => {
        toast.error(`加载失败:${errText(err)}`)
        setLoading(false)
      })
  }, [projectId, pageId])

  useEffect(reload, [reload])

  const state = page?.states[0] // MVP S1: 单 state per page
  const hasState = !!state

  return (
    <AppShell
      breadcrumbs={
        project && page
          ? [
              { label: '项目', href: '/' },
              { label: project.name, href: `/projects/${projectId}` },
              { label: page.name },
            ]
          : [{ label: '加载中…' }]
      }
    >
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {loading ? (
          // 跟真实布局同构的 Skeleton:标题 + stats 行 + 左预览/右面板
          <>
            <Skeleton width={240} height={44} />
            <Skeleton width={400} height={20} sx={{ mb: 3 }} />
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={3}
              alignItems="flex-start"
            >
              <Skeleton
                variant="rounded"
                height={400}
                sx={{ flexGrow: 1, alignSelf: 'stretch' }}
              />
              <Skeleton variant="rounded" width={320} height={340} />
            </Stack>
          </>
        ) : !page ? (
          <NotFoundCard message="该页面不存在或已被删除。" />
        ) : (
          <>
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="h2">{page.name}</Typography>
              {page.route_hint && (
                <Typography color="text.secondary" sx={{ mt: 0.25 }}>
                  路由 {page.route_hint}
                </Typography>
              )}
            </Box>

            <PageStatsStrip stats={page.stats} hasState={hasState} />

            {!hasState ? (
              <UploadDropzone pageId={pageId} onUploaded={reload} />
            ) : (
              <DesignWithPipeline
                state={state!}
                onChanged={reload}
                projectId={projectId}
                pageId={pageId}
              />
            )}
          </>
        )}
      </Container>
    </AppShell>
  )
}

// ─── Stats strip ────────────────────────────────────────────────────────────

function PageStatsStrip({
  stats,
  hasState,
}: {
  stats: PageStats
  hasState: boolean
}): React.ReactElement {
  // 状态点 + 当前 pipeline_status 标签(整页主状态指示)
  const statusKind: RunStatusKind =
    stats.pipeline_status === null
      ? 'idle'
      : stats.pipeline_status.endsWith('_failed')
        ? 'failed'
        : stats.pipeline_status.endsWith('_running') || stats.pipeline_status === 'validating'
          ? 'running'
          : stats.pipeline_status === 'idle'
            ? 'idle'
            : 'completed'
  const statusLabel = !hasState
    ? '未上传'
    : stats.pipeline_status
      ? pipelineStatusLabel(stats.pipeline_status)
      : '未上传'

  return (
    <Stack
      direction="row"
      alignItems="center"
      useFlexGap
      columnGap={3}
      rowGap={1}
      sx={{ mb: 3, flexWrap: 'wrap' }}
    >
      <StatChip
        icon={<LayersOutlinedIcon />}
        value={stats.state_count}
        label="状态"
      />
      {stats.total_elements > 0 && (
        <StatChip
          icon={<TaskAltOutlinedIcon />}
          value={`${stats.reviewed_elements}/${stats.total_elements}`}
          label="元素已确认"
          valueColor={
            stats.reviewed_elements === stats.total_elements
              ? 'success.main'
              : 'text.primary'
          }
        />
      )}
      {stats.static_elements > 0 && (
        <StatChip
          icon={<ExtensionOutlinedIcon />}
          value={`${stats.total_assets}/${stats.static_elements}`}
          label="已指派"
          valueColor={
            stats.total_assets === stats.static_elements
              ? 'success.main'
              : 'text.primary'
          }
        />
      )}
      {stats.total_assets > 0 && (
        <StatChip
          icon={<CloudUploadOutlinedIcon />}
          value={`${stats.uploaded_assets}/${stats.total_assets}`}
          label="资产已上传"
          valueColor={
            stats.uploaded_assets === stats.total_assets
              ? 'success.main'
              : 'text.primary'
          }
        />
      )}
      {stats.last_run && (
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ color: 'text.secondary' }}
        >
          <ScheduleOutlinedIcon size={14} />
          <Typography variant="caption">
            最近活动 {formatRelative(stats.last_run.at)}
          </Typography>
        </Stack>
      )}
      <Box sx={{ flex: 1 }} />
      <Stack direction="row" alignItems="center" gap={0.875}>
        <StatusDot status={statusKind} />
        <Typography
          variant="caption"
          sx={{ color: statusKind === 'idle' ? 'text.disabled' : 'text.secondary' }}
        >
          {statusLabel}
        </Typography>
      </Stack>
    </Stack>
  )
}

// ─── Dropzone ──────────────────────────────────────────────────────────────

function UploadDropzone({
  pageId,
  onUploaded,
}: {
  pageId: string
  onUploaded: () => void
}): React.ReactElement {
  const [uploading, setUploading] = useState(false)
  const [uploadingName, setUploadingName] = useState('')
  const [drag, setDrag] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const upload = async (file: File): Promise<void> => {
    if (!file.type.includes('png') && !file.name.toLowerCase().endsWith('.png')) {
      toast.error('只接受 PNG 文件')
      return
    }
    setUploading(true)
    setUploadingName(file.name)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/pages/${pageId}/states`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('上传成功')
      onUploaded()
    } catch (err) {
      toast.error(`上传失败:${errText(err)}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Paper
      variant="outlined"
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        const file = e.dataTransfer.files[0]
        if (file) void upload(file)
      }}
      sx={{
        py: 8,
        textAlign: 'center',
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: drag ? 'primary.main' : 'divider',
        bgcolor: drag ? 'action.hover' : 'background.paper',
        // 草稿本叙事:dropzone 是"待绘制区域",点阵比页面背景加强一档
        ...dotGridBg(0.16),
        transition: 'all 0.2s',
      }}
    >
      {uploading ? (
        <Stack alignItems="center" spacing={2} sx={{ px: 6 }}>
          <Box sx={{ color: 'primary.main', display: 'flex' }}>
            <UploadFileIcon size={44} strokeWidth={1.5} />
          </Box>
          <Box sx={{ width: '100%', maxWidth: 360 }}>
            <LinearProgress />
          </Box>
          <Typography variant="body2" color="text.secondary">
            上传中 <code>{uploadingName}</code> …
          </Typography>
        </Stack>
      ) : (
        <Stack alignItems="center" spacing={2}>
          <Box sx={{ color: 'text.secondary', display: 'flex' }}>
            <UploadFileIcon size={44} strokeWidth={1.5} />
          </Box>
          <Typography variant="h5">拖拽 PNG 到此处 或</Typography>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInput.current?.click()}
          >
            选择文件
          </Button>
          <Typography variant="body2" color="text.secondary">
            每个页面仅支持 1 张设计稿
          </Typography>
        </Stack>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".png,image/png"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
        }}
      />
    </Paper>
  )
}

// ─── Design + Pipeline ─────────────────────────────────────────────────────

function DesignWithPipeline({
  state,
  onChanged,
  projectId,
  pageId,
}: {
  state: StateRecord
  onChanged: () => void
  projectId: string
  pageId: string
}): React.ReactElement {
  const [reUploading, setReUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [elements, setElements] = useState<LayoutElement[]>([])
  const [showBboxes, setShowBboxes] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)

  // 拉 elements 给 bbox overlay。无条件拉(无 element 文件返回 []),简单
  useEffect(() => {
    void fetch(`/api/pages/${pageId}/elements`)
      .then((r) => (r.ok ? r.json() : { elements: [] }))
      .then((data: { elements: LayoutElement[] }) => {
        setElements(data.elements ?? [])
      })
      .catch(() => setElements([]))
  }, [pageId, state.pipeline_status])

  const inFlight = state.pipeline_status.endsWith('_running') || state.pipeline_status === 'validating'
  const inFlightWarning = inFlight ? (
    <Alert severity="warning" sx={{ mt: 1.5 }}>
      当前 pipeline 还在跑(<code>{state.pipeline_status}</code>
      )。继续会丢失正在执行的结果(LLM 调用本身不会停止,但产物会被删)。
    </Alert>
  ) : null

  const replaceUpload = async (file: File): Promise<void> => {
    setReUploading(true)
    try {
      const delRes = await fetch(`/api/states/${state.id}`, { method: 'DELETE' })
      if (!delRes.ok && delRes.status !== 204) throw new Error(await delRes.text())
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/pages/${state.page_id}/states`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('已替换')
      onChanged()
    } catch (err) {
      toast.error(`替换失败:${errText(err)}`)
    } finally {
      setReUploading(false)
      setPendingFile(null)
    }
  }

  const remove = async (): Promise<void> => {
    try {
      const res = await fetch(`/api/states/${state.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error(await res.text())
      toast.success('已删除')
      onChanged()
    } catch (err) {
      toast.error(`删除失败:${errText(err)}`)
    }
  }

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="flex-start">
      {/* 设计稿预览 */}
      <Card variant="outlined" sx={{ flexGrow: 1, maxWidth: { md: 720 }, overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
            minHeight: 240,
          }}
        >
          <DesignWithBboxOverlay
            stateId={state.id}
            elements={showBboxes ? elements.filter((e) => e.type === 'static') : []}
            projectId={projectId}
            pageId={pageId}
          />
        </Box>
        <Divider />
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          useFlexGap
          columnGap={1}
          rowGap={0.75}
          sx={{ px: 2, py: 1.25, flexWrap: 'wrap' }}
        >
          <Stack
            direction="row"
            alignItems="center"
            useFlexGap
            columnGap={2}
            rowGap={0.5}
            sx={{ flexWrap: 'wrap', minWidth: 0 }}
          >
            <Typography variant="body2" color="text.secondary">
              {state.width} × {state.height} px · {state.name}
            </Typography>
            {elements.length > 0 && (() => {
              const staticCount = elements.filter((e) => e.type === 'static').length
              return (
                <FormControlLabel
                  control={
                    <Switch
                      checked={showBboxes}
                      onChange={(e) => setShowBboxes(e.target.checked)}
                    />
                  }
                  label={`显示 static 元素 (${staticCount})`}
                  slotProps={{
                    typography: { variant: 'body2', color: 'text.secondary' },
                  }}
                  sx={{ ml: 0, mr: 0 }}
                />
              )
            })()}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              disabled={reUploading}
              onClick={() => fileInput.current?.click()}
            >
              {reUploading ? '替换中…' : '重新上传'}
            </Button>
            <IconButton
              size="small"
              color="error"
              onClick={() => setConfirmDeleteOpen(true)}
              aria-label="删除当前 state"
              title="删除当前 state"
            >
              <DeleteIcon size={18} />
            </IconButton>
            <input
              ref={fileInput}
              type="file"
              accept=".png,image/png"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setPendingFile(f)
                e.target.value = ''
              }}
            />
          </Stack>
        </Stack>
      </Card>

      {/* Pipeline 状态 */}
      <PipelinePanel
        state={state}
        onChanged={onChanged}
        projectId={projectId}
        pageId={pageId}
      />

      <ConfirmDialog
        open={!!pendingFile}
        onClose={() => setPendingFile(null)}
        title="重新上传"
        body={
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              替换为新设计稿,会先删除现有 state 及所有 pass 结果(elements / 切片 / asset / 校验)。无法恢复。
            </Typography>
            <Typography variant="body2" color="text.secondary">
              新文件:<code>{pendingFile?.name}</code>({pendingFile ? Math.round(pendingFile.size / 1024) : 0} KB)
            </Typography>
            {inFlightWarning}
          </Box>
        }
        confirmLabel="替换"
        confirmColor="error"
        onConfirm={async () => {
          if (pendingFile) await replaceUpload(pendingFile)
        }}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="删除当前 state"
        body={
          <Box>
            <Typography variant="body2">
              所有 pass 结果(elements / 切片 / asset)会一起删,无法恢复。原图也会删。
            </Typography>
            {inFlightWarning}
          </Box>
        }
        confirmLabel="删除"
        confirmColor="error"
        onConfirm={remove}
      />
    </Stack>
  )
}

// ─── DesignWithBboxOverlay ──────────────────────────────────────────────────
// 设计稿 img + 在它上面叠 element bbox(只读,click 跳 element-review 深链)。
// 用 inline-block 包装让外层 box 紧贴 img 的实际渲染尺寸,bbox 用百分比定位
// 自动随 img 缩放;img 设 pointerEvents none + bbox div pointerEvents auto
// 让 click 只在 bbox 边框区域生效。

function DesignWithBboxOverlay({
  stateId,
  elements,
  projectId,
  pageId,
}: {
  stateId: string
  elements: LayoutElement[]
  projectId: string
  pageId: string
}): React.ReactElement {
  const router = useRouter()

  return (
    <Box sx={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/raw/${stateId}`}
        alt="design mockup"
        style={{
          maxWidth: '100%',
          maxHeight: '70vh',
          objectFit: 'contain',
          display: 'block',
        }}
      />
      {elements.map((e) => {
        const color = VISUAL_CATEGORY_COLOR[e.visual_category]
        const [x, y, w, h] = e.bbox
        return (
          <Tooltip
            key={e.id}
            title={`${e.name} · ${VISUAL_CATEGORY_CN[e.visual_category]}`}
            placement="top"
            arrow
          >
            <Box
              onClick={() =>
                router.push(
                  `/projects/${projectId}/pages/${pageId}/element-review?selected=${e.id}`,
                )
              }
              sx={{
                position: 'absolute',
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                border: '1.5px solid',
                borderColor: color,
                bgcolor: alpha(color, 0.06),
                cursor: 'pointer',
                transition: 'background-color 0.12s ease, box-shadow 0.12s ease',
                '&:hover': {
                  bgcolor: alpha(color, 0.18),
                  boxShadow: `0 0 0 1px ${alpha(color, 0.6)}`,
                  zIndex: 2,
                },
              }}
            />
          </Tooltip>
        )
      })}
    </Box>
  )
}

function PipelinePanel({
  state,
  onChanged,
  projectId,
  pageId,
}: {
  state: StateRecord
  onChanged: () => void
  projectId: string
  pageId: string
}): React.ReactElement {
  const status = state.pipeline_status
  // stage list 里 dot 只反映「过去 / 失败」状态(completed / failed / idle)。
  // 「next-up」语义通过 isCurrent + bold 文字表达,不让 dot 脉动 ——
  // 真实的 in-flight 状态由下方 LinearProgress 单独表达。
  const stageState = (key: string): RunStatusKind => {
    const order = ['pass1', 'element_review', 'pass2', 'asset_review', 'validate', 'export']
    const idx = order.indexOf(key)
    const currentIdx = currentStageIdx(status)
    if (status.endsWith('_failed') && idx === currentIdx) return 'failed'
    if (idx < currentIdx) return 'completed'
    return 'idle'
  }
  const isStageCurrent = (key: string): boolean => {
    const order = ['pass1', 'element_review', 'pass2', 'asset_review', 'validate', 'export']
    const idx = order.indexOf(key)
    const currentIdx = currentStageIdx(status)
    if (status.endsWith('_failed')) return false
    return idx === currentIdx + 1
  }
  const inFlightNow = status.endsWith('_running') || status === 'validating'
  const isStageRunning = (key: string): boolean => {
    const order = ['pass1', 'element_review', 'pass2', 'asset_review', 'validate', 'export']
    return inFlightNow && order.indexOf(key) === currentStageIdx(status)
  }

  const [running, setRunning] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // 上次 pass2 audit 报告里失败的 categories(若有,可只重跑这些路省钱)
  const [failedRoutes, setFailedRoutes] = useState<string[]>([])
  // Pass 1 重跑确认(后端 409 ELEMENTS_EXIST 时弹出)
  const [confirmRerunPass1Open, setConfirmRerunPass1Open] = useState(false)

  // 刷新 / 重进页面后恢复运行中 pipeline 的进度感知:状态在 *_running / validating
  // 时周期性 reload 直到落到终态。否则只有「点击发起的那次轮询」能更新状态,
  // 切走再回来就是一个永不前进的假进度条。
  // 上限 ~10 分钟:防止进程重启留下的悬挂 running 状态导致无限轮询。
  const resumePollCount = useRef(0)
  useEffect(() => {
    const inFlight = status.endsWith('_running') || status === 'validating'
    if (!inFlight) {
      resumePollCount.current = 0
      return
    }
    const t = setInterval(() => {
      resumePollCount.current += 1
      if (resumePollCount.current > 300) {
        clearInterval(t)
        return
      }
      onChanged()
    }, 2000)
    return () => clearInterval(t)
  }, [status, onChanged])

  // 失败时拉 PipelineRun.error.message 显示在 banner
  useEffect(() => {
    setErrorMessage(null)
    const failedRunId =
      status === 'pass1_failed'
        ? state.pass1_run_id
        : status === 'pass2_failed'
          ? state.pass2_run_id
          : null
    if (!failedRunId) return
    void fetch(`/api/pipeline-runs/${failedRunId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((run: { error?: { message: string } } | null) => {
        if (run?.error?.message) setErrorMessage(run.error.message)
      })
      .catch(() => {})
  }, [status, state.pass1_run_id, state.pass2_run_id])

  // 失败路次名单:新数据直接读 state.pass2_failed_categories;
  // 老数据(无此字段)fallback 到 pass2 audit run 的 failed_routes
  useEffect(() => {
    setFailedRoutes([])
    if (status !== 'pass2_done' && status !== 'pass2_failed' && status !== 'validated')
      return
    if (state.pass2_failed_categories !== undefined) {
      setFailedRoutes(state.pass2_failed_categories)
      return
    }
    if (!state.pass2_run_id) return
    void fetch(`/api/pipeline-runs/${state.pass2_run_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((run: { parsed_result?: { failed_routes?: Array<{ category: string }> } } | null) => {
        const fr = run?.parsed_result?.failed_routes ?? []
        setFailedRoutes(fr.map((f) => f.category))
      })
      .catch(() => {})
  }, [status, state.pass2_run_id, state.pass2_failed_categories])

  const runPass1 = async (force = false): Promise<void> => {
    setRunning(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/states/${state.id}/pass1`, {
        method: 'POST',
        ...(force
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ force: true }),
            }
          : {}),
      })
      if (res.status === 409) {
        const data = (await res.json().catch(() => null)) as { code?: string; error?: string } | null
        if (data?.code === 'ELEMENTS_EXIST') {
          // 已有标注 → 弹确认,确认后带 force 重试
          setRunning(false)
          setConfirmRerunPass1Open(true)
          return
        }
        throw new Error(data?.error ?? 'state busy')
      }
      if (!res.ok) throw new Error(await res.text())
      const { run_id } = (await res.json()) as { run_id: string }
      toast.info('Pass 1 启动…轮询状态中')
      pollPipelineRun(run_id, 'Pass 1', () => {
        onChanged()
        setRunning(false)
      })
    } catch (err) {
      toast.error(`Pass 1 失败:${errText(err)}`)
      setRunning(false)
    }
  }

  const runPass2 = async (categories?: string[]): Promise<void> => {
    setRunning(true)
    try {
      const res = await fetch(`/api/states/${state.id}/pass2`, {
        method: 'POST',
        ...(categories && categories.length > 0
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categories }),
            }
          : {}),
      })
      if (!res.ok) throw new Error(await res.text())
      const { run_id } = (await res.json()) as { run_id: string }
      const label = categories && categories.length > 0
        ? `Pass 2 重跑 ${categories.length} 路`
        : 'Pass 2'
      toast.info(`${label} 启动…轮询状态中(可能要 1-3 分钟)`)
      pollPipelineRun(run_id, 'Pass 2', () => {
        onChanged()
        setRunning(false)
      })
    } catch (err) {
      toast.error(`Pass 2 失败:${errText(err)}`)
      setRunning(false)
    }
  }

  return (
    <Card
      variant="outlined"
      sx={{
        width: { md: 320 },
        flexShrink: 0,
        position: { md: 'sticky' },
        top: { md: 16 },
        alignSelf: 'flex-start',
      }}
    >
      <Box sx={{ px: 2.5, py: 2, minWidth: 0 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Pipeline
        </Typography>

        {/* 竖向 stepper:dot 之间连接线(完成段染主色),completed=✓ / failed=✕ /
            running=脉动 ring / next-up=ring,流程推进感比 6 个孤立点强得多 */}
        <Stack spacing={0}>
          {STAGE_LABELS.map((s, i) => {
            const st = stageState(s.key)
            const isCurrent = isStageCurrent(s.key)
            const isRunning = isStageRunning(s.key)
            const isLast = i === STAGE_LABELS.length - 1
            return (
              <Stack key={s.key} direction="row" spacing={1.25} alignItems="stretch">
                <Stack alignItems="center" sx={{ width: 18, flexShrink: 0 }}>
                  <StageDot state={st} current={isCurrent} running={isRunning} />
                  {!isLast && (
                    <Box
                      sx={{
                        width: '2px',
                        flexGrow: 1,
                        minHeight: 12,
                        my: '3px',
                        borderRadius: 1,
                        bgcolor:
                          st === 'completed' ? 'primary.main' : 'surface.outlineVariant',
                      }}
                    />
                  )}
                </Stack>
                <Typography
                  variant="body2"
                  sx={{
                    pb: isLast ? 0 : 1.5,
                    lineHeight: '18px',
                    color:
                      st === 'failed' ? 'error.main'
                      : st === 'completed' || isCurrent || isRunning ? 'text.primary'
                      : 'text.secondary',
                    fontWeight: isCurrent || isRunning ? 600 : 400,
                  }}
                >
                  {s.label}
                </Typography>
              </Stack>
            )
          })}
        </Stack>

        {errorMessage && (
          <Alert severity="error" sx={{ mt: 2.5, alignItems: 'flex-start' }}>
            <Typography
              variant="caption"
              sx={{ display: 'block', fontWeight: 600 }}
            >
              上次失败原因
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                fontFamily: 'monospace',
                wordBreak: 'break-word',
                mt: 0.5,
              }}
            >
              {errorMessage}
            </Typography>
          </Alert>
        )}

        {(status === 'idle' || status === 'pass1_failed') && (
          <Button
            variant="contained"
            startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
            disabled={running}
            onClick={() => void runPass1()}
            fullWidth
            sx={{ mt: 3 }}
          >
            {running
              ? 'Pass 1 运行中…'
              : status === 'pass1_failed'
                ? '重跑 Pass 1'
                : '运行 Pass 1'}
          </Button>
        )}

        {status === 'pass1_running' && (
          <RunningProgress
            stateId={state.id}
            runId={state.pass1_run_id}
            label="Pass 1 运行中"
          />
        )}

        {status === 'pass1_done' && (
          <Stack spacing={1} sx={{ mt: 3 }}>
            <Button
              variant="contained"
              component={Link}
              href={`/projects/${projectId}/pages/${pageId}/element-review`}
              fullWidth
              startIcon={<PlayArrowIcon />}
            >
              Element Review
            </Button>
            <Button
              variant="outlined"
              fullWidth
              startIcon={running ? <CircularProgress size={14} /> : <PlayArrowIcon />}
              disabled={running}
              onClick={() => void runPass2()}
            >
              {running ? 'Pass 2 运行中…' : '直接运行 Pass 2'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              确认每个元素后再跑 Pass 2(若已跳过 Element Review)
            </Typography>
          </Stack>
        )}

        {status === 'pass2_running' && (
          <RunningProgress
            stateId={state.id}
            runId={state.pass2_run_id}
            label="Pass 2 运行中"
            estimate="1-3 分钟"
          />
        )}

        {status === 'validating' && (
          <RunningProgress stateId={state.id} label="反向校验运行中" />
        )}

        {(status === 'pass2_done' || status === 'validated') && (
          <Stack spacing={1} sx={{ mt: 3 }}>
            <Button
              variant="contained"
              component={Link}
              href={`/projects/${projectId}/pages/${pageId}/asset-review`}
              fullWidth
              startIcon={<PlayArrowIcon />}
            >
              Asset Review
            </Button>
            {failedRoutes.length > 0 && (
              <Button
                variant="outlined"
                color="warning"
                fullWidth
                startIcon={running ? <CircularProgress size={14} /> : <PlayArrowIcon />}
                disabled={running}
                onClick={() => void runPass2(failedRoutes)}
              >
                {running ? '重跑中…' : `只重跑失败 ${failedRoutes.length} 路 (${failedRoutes.join(' / ')})`}
              </Button>
            )}
            <Button
              variant="outlined"
              fullWidth
              startIcon={running ? <CircularProgress size={14} /> : <PlayArrowIcon />}
              disabled={running}
              onClick={() => void runPass2()}
            >
              {running ? 'Pass 2 重跑中…' : '重跑全部 Pass 2'}
            </Button>
            <CdnExportActions stateId={state.id} pageId={pageId} onChanged={onChanged} />
          </Stack>
        )}

        {status === 'pass2_failed' && (
          <Stack spacing={1} sx={{ mt: 3 }}>
            {failedRoutes.length > 0 && (
              <Button
                variant="contained"
                color="warning"
                fullWidth
                startIcon={running ? <CircularProgress size={14} /> : <PlayArrowIcon />}
                disabled={running}
                onClick={() => void runPass2(failedRoutes)}
              >
                {running ? '重跑中…' : `只重跑失败 ${failedRoutes.length} 路 (${failedRoutes.join(' / ')})`}
              </Button>
            )}
            <Button
              variant={failedRoutes.length > 0 ? 'outlined' : 'contained'}
              fullWidth
              startIcon={running ? <CircularProgress size={14} /> : <PlayArrowIcon />}
              disabled={running}
              onClick={() => void runPass2()}
            >
              重跑全部 Pass 2
            </Button>
          </Stack>
        )}
      </Box>

      <ConfirmDialog
        open={confirmRerunPass1Open}
        onClose={() => setConfirmRerunPass1Open(false)}
        title="重跑 Pass 1?"
        body="该页面已有元素标注(可能含你的人工修改和已指派的素材)。重跑会完全替换所有元素并清理已指派的 asset,此操作不可撤销。"
        confirmLabel="重跑并替换"
        confirmColor="warning"
        onConfirm={() => runPass1(true)}
      />
    </Card>
  )
}

// ─── StageDot:stepper 节点 ─────────────────────────────────────────────────
// completed=主色填充✓ / failed=红填充✕ / running=主色 ring+脉动芯 / next-up=主色 ring / idle=灰点

function StageDot({
  state,
  current,
  running,
}: {
  state: RunStatusKind
  current: boolean
  running: boolean
}): React.ReactElement {
  if (state === 'completed' || state === 'failed') {
    const Icon = state === 'completed' ? CheckIcon : CloseIcon
    return (
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: state === 'completed' ? 'primary.main' : 'error.main',
          color: '#fff',
        }}
      >
        <Icon size={12} strokeWidth={2.5} />
      </Box>
    )
  }
  if (running || current) {
    return (
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid',
          borderColor: 'primary.main',
          bgcolor: 'background.paper',
        }}
      >
        {running ? (
          <StatusDot status="running" size={6} />
        ) : (
          <Box
            sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main' }}
          />
        )}
      </Box>
    )
  }
  return (
    <Box
      sx={{
        width: 18,
        height: 18,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'grey.300' }} />
    </Box>
  )
}

// ─── RunningProgress:运行中进度(n/m 路完成 + 耗时秒表) ────────────────────
// sub-run(pass1_{cat} / pass2_{cat})在主 run 启动时一次性全部创建,所以
// 「started_at >= 主 run started_at」即本次的路次;done = 非 running 的数量。
// 拿不到 sub-run(如 validate 无分路)时退化为 indeterminate 进度条。

function RunningProgress({
  stateId,
  runId,
  label,
  estimate,
}: {
  stateId: string
  runId?: string | undefined
  label: string
  estimate?: string
}): React.ReactElement {
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [routes, setRoutes] = useState<{ done: number; total: number } | null>(null)
  const startRef = useRef<number | null>(null)

  // 主 run started_at → 秒表(刷新/重进页面也能恢复真实耗时)
  useEffect(() => {
    if (!runId) return
    let cancelled = false
    void fetch(`/api/pipeline-runs/${runId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((run: { started_at?: string } | null) => {
        if (cancelled || !run?.started_at) return
        startRef.current = new Date(run.started_at).getTime()
      })
      .catch(() => {})
    const t = setInterval(() => {
      if (startRef.current !== null) {
        setElapsed(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)))
      }
    }, 1000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [runId])

  // 轮询 sub-run 进度
  useEffect(() => {
    if (!runId) return
    const poll = (): void => {
      void fetch(`/api/states/${stateId}/pipeline-runs`)
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            data: {
              runs: Array<{ pass: string; status: string; started_at: string }>
            } | null,
          ) => {
            if (!data || startRef.current === null) return
            const subs = data.runs.filter(
              (r) =>
                /^pass[12]_/.test(r.pass) &&
                new Date(r.started_at).getTime() >= startRef.current! - 2000,
            )
            if (subs.length === 0) return
            setRoutes({
              done: subs.filter((r) => r.status !== 'running').length,
              total: subs.length,
            })
          },
        )
        .catch(() => {})
    }
    poll()
    const t = setInterval(poll, 2000)
    return () => clearInterval(t)
  }, [stateId, runId])

  const pct =
    routes && routes.total > 0 && routes.done > 0
      ? (routes.done / routes.total) * 100
      : null
  return (
    <Box sx={{ mt: 3 }}>
      {pct !== null ? (
        <LinearProgress variant="determinate" value={pct} />
      ) : (
        <LinearProgress />
      )}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
        gap={1}
        sx={{ mt: 1 }}
      >
        <Typography variant="body2" color="text.secondary">
          {label}
          {routes ? ` · ${routes.done}/${routes.total} 路完成` : ''}
          {!routes && estimate ? ` · ${estimate}` : ''}
        </Typography>
        {elapsed !== null && (
          <Typography
            variant="caption"
            sx={{
              color: 'text.disabled',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {formatElapsed(elapsed)}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

function currentStageIdx(status: StatePipelineStatus): number {
  switch (status) {
    case 'pass1_running':
    case 'pass1_failed':
      return 0
    case 'pass1_done':
      return 1
    case 'pass2_running':
    case 'pass2_failed':
      return 2
    case 'pass2_done':
      return 3
    case 'validating':
      return 4
    case 'validated':
      return 5
    case 'idle':
      return -1
  }
}

// ─── NotFoundCard ──────────────────────────────────────────────────────────

function NotFoundCard({ message }: { message: string }): React.ReactElement {
  return (
    <EmptyState
      icon={<SearchOffOutlinedIcon />}
      title="404"
      description={message}
      action={
        <Button variant="contained" component={Link} href="/" startIcon={<HomeIcon />}>
          回首页
        </Button>
      }
    />
  )
}

function pollPipelineRun(
  runId: string,
  passLabel: string,
  onDone: () => void,
): void {
  const interval = setInterval(() => {
    void fetch(`/api/pipeline-runs/${runId}`)
      .then((r) => r.json())
      .then((run: { status: 'running' | 'completed' | 'failed'; error?: { message: string } }) => {
        if (run.status === 'completed') {
          clearInterval(interval)
          toast.success(`${passLabel} 完成`)
          onDone()
        } else if (run.status === 'failed') {
          clearInterval(interval)
          toast.error(`${passLabel} 失败:${errText(run.error?.message ?? '未知错误')}`)
          onDone()
        }
      })
      .catch(() => {
        clearInterval(interval)
        onDone()
      })
  }, 2000)
}

// ─── CDN + Export actions ─────────────────────────────────────────────────

function CdnExportActions({
  stateId,
  pageId,
  onChanged,
}: {
  stateId: string
  pageId: string
  onChanged: () => void
}): React.ReactElement {
  const [uploading, setUploading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  const validate = async (): Promise<void> => {
    setValidating(true)
    try {
      const res = await fetch(`/api/states/${stateId}/validate`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const { run_id } = (await res.json()) as { run_id: string }
      toast.info('反向校验运行中…')
      onChanged() // 状态进 validating,面板自动轮询接管进度
      pollPipelineRun(run_id, '反向校验', () => {
        onChanged()
        setValidating(false)
      })
    } catch (err) {
      toast.error(`校验失败:${errText(err)}`)
      setValidating(false)
    }
  }

  const upload = async (): Promise<void> => {
    setUploading(true)
    try {
      const res = await fetch(`/api/pages/${pageId}/upload-all-assets`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as {
        uploaded: number
        failed: Array<{ asset_id: string; element_name: string; error: string }>
      }
      if (data.failed.length > 0) {
        // 失败明细常驻展示(只报数量没法定位哪个素材挂了)
        toast.error(
          `${data.failed.length} 个 asset 上传失败:${data.failed
            .map((f) => `${f.element_name}(${f.error})`)
            .join('; ')}`,
          { duration: 10000 },
        )
      }
      if (data.uploaded > 0) {
        toast.success(`已上传 ${data.uploaded} 个 asset`)
      }
    } catch (err) {
      toast.error(`上传失败:${errText(err)}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        disabled={validating}
        onClick={() => void validate()}
      >
        {validating ? '反向校验中…' : '反向校验(LLM 验质量)'}
      </Button>
      <Button
        variant="outlined"
        disabled={uploading}
        onClick={() => void upload()}
      >
        {uploading ? '上传中…' : '上传所有 asset 到 CDN'}
      </Button>
      <Button
        variant="contained"
        color="primary"
        onClick={() => setExportDialogOpen(true)}
      >
        导出文件夹
      </Button>
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        pageId={pageId}
      />
    </>
  )
}

function ExportDialog({
  open,
  onClose,
  pageId,
}: {
  open: boolean
  onClose: () => void
  pageId: string
}): React.ReactElement {
  const [outputDir, setOutputDir] = useState('')
  const [exporting, setExporting] = useState(false)

  const submit = async (): Promise<void> => {
    setExporting(true)
    try {
      const body: Record<string, unknown> = {}
      const trimmed = outputDir.trim()
      if (trimmed) body['output_dir'] = trimmed
      const res = await fetch(`/api/pages/${pageId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as {
        path: string
        missing_assets?: Array<{ element_id: string; name: string }>
        orphan_assets_skipped?: number
      }
      toast.success(`已导出到 ${data.path}`)
      const missing = data.missing_assets ?? []
      if (missing.length > 0) {
        toast.warning(
          `⚠ 导出不完整:${missing.length} 个元素缺素材(${missing
            .slice(0, 3)
            .map((m) => m.name)
            .join(' / ')}${missing.length > 3 ? ' …' : ''}),详见 spec.md 顶部警告`,
          { duration: 8000 },
        )
      }
      setOutputDir('')
      onClose()
    } catch (err) {
      toast.error(`导出失败:${errText(err)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>导出文件夹</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="输出目录"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            placeholder="~/img2ui-out"
            helperText="留空 = ~/img2ui-out。会输出 elements.json + assets/ 目录"
            autoFocus
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>
          取消
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={exporting}>
          {exporting ? '导出中…' : '导出'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
