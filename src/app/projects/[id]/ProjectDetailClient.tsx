'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { errText } from '@/lib/error-text'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardMedia from '@mui/material/CardMedia'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Skeleton from '@mui/material/Skeleton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import DialogContentText from '@mui/material/DialogContentText'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import Grow from '@mui/material/Grow'
import Alert from '@mui/material/Alert'
import {
  Plus as AddIcon,
  Trash2 as DeleteIcon,
  Home as HomeIcon,
  FileText as ArticleOutlinedIcon,
  Layers as LayersOutlinedIcon,
  LayoutGrid as DashboardCustomizeOutlinedIcon,
  CloudUpload as CloudUploadOutlinedIcon,
  Clock as ScheduleOutlinedIcon,
  Image as ImageOutlinedIcon,
  CircleCheckBig as TaskAltOutlinedIcon,
  Puzzle as ExtensionOutlinedIcon,
} from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusDot } from '@/components/StatusDot'
import { StatChip } from '@/components/StatChip'
import { EmptyState } from '@/components/EmptyState'
import { riseInSx } from '@/theme'
import {
  describeRunStatus,
  formatRelative,
  pipelineStatusLabel,
  type RunStatusKind,
} from '@/lib/format'
import type { Project, Page } from '@/lib/types'
import type { PageStats } from '@/lib/page-stats'

interface PageListItem extends Page {
  thumbnail_url?: string
  has_state: boolean
  stats: PageStats
}

/** 新建页面尚未有任何内容,零值 stats(局部插入用,后台 refetch 会校准) */
const EMPTY_PAGE_STATS: PageStats = {
  state_count: 0,
  pipeline_status: null,
  total_elements: 0,
  reviewed_elements: 0,
  static_elements: 0,
  total_assets: 0,
  uploaded_assets: 0,
}

export function ProjectDetailClient({ projectId }: { projectId: string }): React.ReactElement {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [pages, setPages] = useState<PageListItem[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // 最近一次本地插入的页面 id:只让它做 Grow 进场
  const [recentId, setRecentId] = useState<string | null>(null)

  const reload = (): void => {
    void Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/projects/${projectId}/pages`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([proj, pgs]: [Project | null, PageListItem[]]) => {
        setProject(proj)
        setPages(pgs)
      })
      .catch((err) => {
        toast.error(`加载失败:${errText(err)}`)
        setPages([])
      })
  }
  useEffect(reload, [projectId])

  const [confirmDelOpen, setConfirmDelOpen] = useState(false)
  const deleteProject = async (): Promise<void> => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      toast.success('项目已删除')
      router.push('/')
    } catch (err) {
      toast.error(`删除失败:${errText(err)}`)
    }
  }

  // 加载完发现项目不存在 → 整页 404,不渲染下方页面列表 / 删除按钮
  if (pages !== null && !project) {
    return (
      <AppShell breadcrumbs={[{ label: '项目', href: '/' }]}>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography variant="h2" sx={{ fontSize: 56, color: 'text.disabled' }}>
              404
            </Typography>
            <Typography variant="body1" sx={{ mt: 1, mb: 3 }} color="text.secondary">
              项目不存在或已被删除。
            </Typography>
            <Button variant="contained" component={Link} href="/" startIcon={<HomeIcon />}>
              回首页
            </Button>
          </Box>
        </Container>
      </AppShell>
    )
  }

  return (
    <AppShell
      breadcrumbs={
        project
          ? [{ label: '项目', href: '/' }, { label: project.name }]
          : [{ label: '项目', href: '/' }]
      }
      rightAction={
        project && (
          <IconButton
            color="error"
            onClick={() => setConfirmDelOpen(true)}
            title="删除项目"
            aria-label="删除项目"
          >
            <DeleteIcon size={18} />
          </IconButton>
        )
      }
    >
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          sx={{ mb: 1.5, gap: 2 }}
        >
          {project ? (
            <Box sx={{ flex: 1, minWidth: 0, ...riseInSx }}>
              <Typography variant="h2">{project.name}</Typography>
              {project.description && (
                <Typography color="text.secondary" sx={{ mt: 0.25 }}>
                  {project.description}
                </Typography>
              )}
            </Box>
          ) : (
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width={320} height={48} />
            </Box>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ flexShrink: 0 }}
          >
            新建页面
          </Button>
        </Stack>

        {pages && pages.length > 0 && <StatsStrip pages={pages} />}

        {pages === null ? (
          <LoadingGrid />
        ) : pages.length === 0 ? (
          <EmptyInline onCreate={() => setDialogOpen(true)} />
        ) : (
          <PageCardGrid projectId={projectId} pages={pages} recentId={recentId} />
        )}
      </Container>

      <NewPageDialog
        projectId={projectId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(page) => {
          setDialogOpen(false)
          // 局部插入(Grow 进场),后台 refetch 校准 stats
          setRecentId(page.id)
          setPages((prev) => [
            ...(prev ?? []),
            { ...page, has_state: false, stats: EMPTY_PAGE_STATS },
          ])
          reload()
        }}
      />
      <ConfirmDialog
        open={confirmDelOpen}
        onClose={() => setConfirmDelOpen(false)}
        title="删除项目"
        body={
          pages && pages.length > 0 ? (
            <Stack spacing={1.5}>
              <DialogContentText>
                将删除「{project?.name ?? ''}」及其 {pages.length} 个页面的所有
                state / pass / asset。
              </DialogContentText>
              <Alert severity="warning">此操作无法恢复</Alert>
            </Stack>
          ) : (
            '该项目没有页面,可以放心删除。'
          )
        }
        confirmLabel="删除项目"
        confirmColor="error"
        onConfirm={deleteProject}
      />
    </AppShell>
  )
}

// ─── Stats strip ────────────────────────────────────────────────────────────

function StatsStrip({ pages }: { pages: PageListItem[] }): React.ReactElement {
  const totals = pages.reduce(
    (acc, p) => ({
      states: acc.states + p.stats.state_count,
      elements: acc.elements + p.stats.total_elements,
      assets: acc.assets + p.stats.total_assets,
      uploaded: acc.uploaded + p.stats.uploaded_assets,
    }),
    { states: 0, elements: 0, assets: 0, uploaded: 0 },
  )
  const lastRunAt = pages
    .map((p) => p.stats.last_run?.at)
    .filter((s): s is string => Boolean(s))
    .sort((a, b) => b.localeCompare(a))[0]

  const allUploaded = totals.assets > 0 && totals.uploaded === totals.assets

  return (
    <Stack
      direction="row"
      useFlexGap
      columnGap={3}
      rowGap={1}
      alignItems="center"
      sx={{ mb: 3, flexWrap: 'wrap', ...riseInSx }}
    >
      <StatChip icon={<ArticleOutlinedIcon />} value={pages.length} label="页" />
      <StatChip icon={<LayersOutlinedIcon />} value={totals.states} label="状态" />
      <StatChip
        icon={<DashboardCustomizeOutlinedIcon />}
        value={totals.elements}
        label="元素"
      />
      <StatChip
        icon={<CloudUploadOutlinedIcon />}
        value={totals.assets > 0 ? `${totals.uploaded}/${totals.assets}` : 0}
        label={totals.assets > 0 ? '资产已上传' : '资产'}
        valueColor={allUploaded ? 'success.main' : 'text.primary'}
      />
      {lastRunAt && (
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ ml: 'auto', color: 'text.secondary' }}
        >
          <ScheduleOutlinedIcon size={14} />
          <Typography variant="caption">
            最近活动 {formatRelative(lastRunAt)}
          </Typography>
        </Stack>
      )}
    </Stack>
  )
}

// ─── Page card grid ─────────────────────────────────────────────────────────

function PageCardGrid({
  projectId,
  pages,
  recentId,
}: {
  projectId: string
  pages: PageListItem[]
  recentId: string | null
}): React.ReactElement {
  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ flexWrap: 'wrap', gap: 2.5, ...riseInSx }}
    >
      {pages.map((p) => (
        // appear 只对「本地新插入」的卡片为 true:存量卡片首屏不播动画
        <Grow key={p.id} in appear={p.id === recentId} timeout={250}>
          <Box>
            <PageCard projectId={projectId} page={p} />
          </Box>
        </Grow>
      ))}
    </Stack>
  )
}

function PageCard({
  projectId,
  page: p,
}: {
  projectId: string
  page: PageListItem
}): React.ReactElement {
  const { kind, label } = describePageStatus(p.stats, p.has_state)
  const s = p.stats
  const hasProgress =
    s.total_elements > 0 || s.static_elements > 0 || s.total_assets > 0

  return (
    <Card
      sx={{
        width: 280,
        transition:
          'transform 0.18s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.18s ease, border-color 0.18s ease',
        '&:hover': {
          boxShadow: 3,
          transform: 'translateY(-2px)',
          borderColor: 'surface.outline',
        },
      }}
    >
      <CardActionArea component={Link} href={`/projects/${projectId}/pages/${p.id}`}>
        {p.thumbnail_url ? (
          <CardMedia
            component="img"
            image={p.thumbnail_url}
            alt={p.name}
            sx={{
              height: 160,
              objectFit: 'cover',
              bgcolor: 'background.default',
            }}
          />
        ) : (
          <Box sx={{ height: 160, bgcolor: 'surface.container' }}>
            <EmptyState
              variant="compact"
              icon={<ImageOutlinedIcon />}
              title="未上传设计稿"
            />
          </Box>
        )}
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="h5" noWrap>
            {p.name}
          </Typography>
          {p.route_hint && (
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ mt: 0.25 }}
            >
              {p.route_hint}
            </Typography>
          )}
          {hasProgress ? (
            <Stack
              direction="row"
              useFlexGap
              columnGap={1.5}
              alignItems="center"
              sx={{ mt: 0.75, flexWrap: 'wrap' }}
            >
              {s.total_elements > 0 && (
                <StatChip
                  size="small"
                  icon={<TaskAltOutlinedIcon />}
                  value={`${s.reviewed_elements}/${s.total_elements}`}
                  label="已确认"
                  valueColor={
                    s.reviewed_elements === s.total_elements
                      ? 'success.main'
                      : 'text.primary'
                  }
                />
              )}
              {s.static_elements > 0 && (
                <StatChip
                  size="small"
                  icon={<ExtensionOutlinedIcon />}
                  value={`${s.total_assets}/${s.static_elements}`}
                  label="已指派"
                  valueColor={
                    s.total_assets === s.static_elements
                      ? 'success.main'
                      : 'text.primary'
                  }
                />
              )}
              {s.total_assets > 0 && (
                <StatChip
                  size="small"
                  icon={<CloudUploadOutlinedIcon />}
                  value={`${s.uploaded_assets}/${s.total_assets}`}
                  label="已上传"
                  valueColor={
                    s.uploaded_assets === s.total_assets
                      ? 'success.main'
                      : 'text.primary'
                  }
                />
              )}
            </Stack>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ mt: 0.5 }}
            >
              {p.has_state ? '等待首次 Pass 1' : '尚未上传设计稿'}
            </Typography>
          )}
          <Stack
            direction="row"
            alignItems="center"
            gap={0.875}
            sx={{ mt: 1 }}
          >
            <StatusDot status={kind} />
            <Typography
              variant="caption"
              noWrap
              sx={{
                color: kind === 'idle' ? 'text.disabled' : 'text.secondary',
                minWidth: 0,
                flex: 1,
              }}
            >
              {label}
            </Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

// ─── Empty / loading ────────────────────────────────────────────────────────

function EmptyInline({
  onCreate,
}: {
  onCreate: () => void
}): React.ReactElement {
  return (
    <Card variant="outlined">
      <EmptyState
        icon={<ArticleOutlinedIcon />}
        title="还没有页面"
        description="新建页面后,上传设计稿截图,跑 Pass 1 / Pass 2 即可生成 coding agent 素材包"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
            新建页面
          </Button>
        }
      />
    </Card>
  )
}

function LoadingGrid(): React.ReactElement {
  // 复合 Skeleton:跟真实卡片同构(图块 + 标题行 + meta 行),避免整块灰条感
  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ flexWrap: 'wrap', gap: 2.5 }}
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} sx={{ width: 280 }}>
          <Skeleton variant="rectangular" height={160} animation="wave" />
          <CardContent sx={{ pb: '16px !important' }}>
            <Skeleton width="60%" height={24} />
            <Skeleton width="85%" height={18} sx={{ mt: 0.5 }} />
            <Skeleton width="40%" height={16} sx={{ mt: 1 }} />
          </CardContent>
        </Card>
      ))}
    </Stack>
  )
}

// ─── New page dialog ────────────────────────────────────────────────────────

function NewPageDialog({
  projectId,
  open,
  onClose,
  onCreated,
}: {
  projectId: string
  open: boolean
  onClose: () => void
  onCreated: (page: Page) => void
}): React.ReactElement {
  const [name, setName] = useState('')
  const [routeHint, setRouteHint] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          route_hint: routeHint.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const page = (await res.json()) as Page
      toast.success('页面已创建')
      setName('')
      setRouteHint('')
      onCreated(page)
    } catch (err) {
      toast.error(`创建失败:${errText(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>新建页面</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="页面名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="抽中页"
            autoFocus
            fullWidth
          />
          <TextField
            label="路由 hint(可选)"
            value={routeHint}
            onChange={(e) => setRouteHint(e.target.value)}
            placeholder="/lottery/win"
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={!name.trim() || submitting}
          startIcon={
            submitting ? <CircularProgress size={14} color="inherit" /> : undefined
          }
        >
          {submitting ? '创建中…' : '创建'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function describePageStatus(
  stats: PageStats,
  hasState: boolean,
): { kind: RunStatusKind; label: string } {
  // 优先看 last_run(更细:有时间 + pass kind)
  if (stats.last_run) return describeRunStatus(stats.last_run)
  // last_run 缺失:用 pipeline_status 兜底
  if (!hasState || stats.pipeline_status === null) {
    return { kind: 'idle', label: '未上传' }
  }
  return { kind: 'idle', label: pipelineStatusLabel(stats.pipeline_status) }
}
