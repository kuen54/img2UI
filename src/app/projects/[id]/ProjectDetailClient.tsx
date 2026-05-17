'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import { alpha } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import HomeIcon from '@mui/icons-material/Home'
import { AppShell } from '@/components/AppShell'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusDot } from '@/components/StatusDot'
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

export function ProjectDetailClient({ projectId }: { projectId: string }): React.ReactElement {
  const [project, setProject] = useState<Project | null>(null)
  const [pages, setPages] = useState<PageListItem[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

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
        toast.error(`加载失败:${err instanceof Error ? err.message : String(err)}`)
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
      window.location.href = '/'
    } catch (err) {
      toast.error(`删除失败:${err instanceof Error ? err.message : String(err)}`)
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
            <DeleteIcon />
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
            <Box sx={{ flex: 1, minWidth: 0 }}>
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
          <LoadingList />
        ) : pages.length === 0 ? (
          <EmptyInline onCreate={() => setDialogOpen(true)} />
        ) : (
          <PageList projectId={projectId} pages={pages} />
        )}
      </Container>

      <NewPageDialog
        projectId={projectId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false)
          reload()
        }}
      />
      <ConfirmDialog
        open={confirmDelOpen}
        onClose={() => setConfirmDelOpen(false)}
        title="删除项目"
        body={
          pages && pages.length > 0
            ? `删除「${project?.name ?? ''}」会级联删除 ${pages.length} 个页面及它们的所有 state / pass / asset。无法恢复。`
            : '该项目没有页面,可以放心删除。'
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

  const parts: string[] = [
    `${pages.length} 页`,
    `${totals.states} 状态`,
    `${totals.elements} 元素`,
    totals.assets > 0
      ? `${totals.uploaded}/${totals.assets} 资产已上传`
      : `${totals.assets} 资产`,
  ]
  if (lastRunAt) parts.push(`最近活动 ${formatRelative(lastRunAt)}`)

  return (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      {parts.join(' · ')}
    </Typography>
  )
}

// ─── Page list ──────────────────────────────────────────────────────────────

function PageList({
  projectId,
  pages,
}: {
  projectId: string
  pages: PageListItem[]
}): React.ReactElement {
  return (
    <Card variant="outlined" sx={{ overflow: 'hidden' }}>
      <Stack divider={<Divider flexItem />}>
        {pages.map((p) => (
          <PageRow key={p.id} projectId={projectId} page={p} />
        ))}
      </Stack>
    </Card>
  )
}

function PageRow({
  projectId,
  page: p,
}: {
  projectId: string
  page: PageListItem
}): React.ReactElement {
  const { kind, label } = describePageStatus(p.stats, p.has_state)

  const metaParts: string[] = []
  if (p.route_hint) metaParts.push(p.route_hint)
  if (p.stats.total_elements > 0) {
    metaParts.push(`${p.stats.total_elements} 元素`)
  }
  if (p.stats.total_assets > 0) {
    metaParts.push(`${p.stats.uploaded_assets}/${p.stats.total_assets} 资产已上传`)
  }
  // 全无:显示「等待首次 Pass 1」
  if (metaParts.length === 0) {
    metaParts.push(p.has_state ? '等待首次 Pass 1' : '尚未上传设计稿')
  }

  return (
    <Box
      component={Link}
      href={`/projects/${projectId}/pages/${p.id}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2.5,
        py: 1.75,
        textDecoration: 'none',
        color: 'inherit',
        outline: '1px solid transparent',
        outlineOffset: -1,
        transition:
          'background-color 0.15s ease, outline-color 0.15s ease',
        '&:hover': {
          bgcolor: alpha('#0d99ff', 0.04),
          outline: `1px solid ${alpha('#0d99ff', 0.4)}`,
        },
      }}
    >
      <Thumbnail url={p.thumbnail_url} alt={p.name} />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          alignItems="baseline"
          gap={2}
          sx={{ minWidth: 0 }}
        >
          <Typography
            variant="h5"
            noWrap
            sx={{ minWidth: 0, flex: 1 }}
          >
            {p.name}
          </Typography>
          <Stack
            direction="row"
            alignItems="center"
            gap={0.875}
            sx={{ flexShrink: 0 }}
          >
            <StatusDot status={kind} />
            <Typography
              variant="caption"
              sx={{
                color: kind === 'idle' ? 'text.disabled' : 'text.secondary',
              }}
            >
              {label}
            </Typography>
          </Stack>
        </Stack>
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ mt: 0.25 }}
        >
          {metaParts.join(' · ')}
        </Typography>
      </Box>
    </Box>
  )
}

function Thumbnail({
  url,
  alt,
}: {
  url: string | undefined
  alt: string
}): React.ReactElement {
  return (
    <Box
      sx={{
        width: 64,
        height: 40,
        borderRadius: 1.5,
        overflow: 'hidden',
        bgcolor: 'background.default',
        flexShrink: 0,
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Box
          component="img"
          src={url}
          alt={alt}
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <Typography
          variant="caption"
          sx={{ fontSize: 11, color: 'text.disabled' }}
        >
          —
        </Typography>
      )}
    </Box>
  )
}

// ─── Empty / loading ────────────────────────────────────────────────────────

function EmptyInline({
  onCreate,
}: {
  onCreate: () => void
}): React.ReactElement {
  return (
    <Card variant="outlined" sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        还没有页面
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        新建页面后,上传设计稿截图,跑 Pass 1 / Pass 2 即可生成 coding agent 素材包
      </Typography>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
        新建页面
      </Button>
    </Card>
  )
}

function LoadingList(): React.ReactElement {
  return (
    <Card variant="outlined" sx={{ overflow: 'hidden' }}>
      <Stack divider={<Divider flexItem />}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Stack
            key={i}
            direction="row"
            alignItems="center"
            gap={2}
            sx={{ px: 2.5, py: 1.75 }}
          >
            <Skeleton
              variant="rounded"
              width={64}
              height={40}
              sx={{ borderRadius: 1.5, flexShrink: 0 }}
            />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="40%" height={20} />
              <Skeleton width="60%" height={16} sx={{ mt: 0.5 }} />
            </Box>
            <Skeleton width={120} height={16} />
          </Stack>
        ))}
      </Stack>
    </Card>
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
  onCreated: () => void
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
      toast.success('页面已创建')
      setName('')
      setRouteHint('')
      onCreated()
    } catch (err) {
      toast.error(`创建失败:${err instanceof Error ? err.message : String(err)}`)
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
        >
          创建
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
