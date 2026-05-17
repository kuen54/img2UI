'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import Stack from '@mui/material/Stack'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { alpha } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import { AppShell } from '@/components/AppShell'
import { StatusDot } from '@/components/StatusDot'
import {
  describeRunStatus,
  formatRelative,
} from '@/lib/format'
import type { Project } from '@/lib/types'
import type { ProjectStats } from '@/lib/projects-stats'

interface ProjectListItem extends Project {
  sample_thumbnail_url?: string
  pages_count: number
  stats: ProjectStats
}

export default function HomePage(): React.ReactElement {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const reload = (): void => {
    void fetch('/api/projects')
      .then((r) => r.json())
      .then(setProjects)
      .catch((err) => {
        toast.error(`加载失败:${err instanceof Error ? err.message : String(err)}`)
        setProjects([])
      })
  }
  useEffect(reload, [])

  return (
    <AppShell>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1.5 }}
        >
          <Typography variant="h2">我的项目</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
          >
            新建项目
          </Button>
        </Stack>

        {projects && projects.length > 0 && <StatsStrip projects={projects} />}

        {projects === null ? (
          <LoadingList />
        ) : projects.length === 0 ? (
          <EmptyInline onCreate={() => setDialogOpen(true)} />
        ) : (
          <ProjectList projects={projects} />
        )}
      </Container>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false)
          reload()
        }}
      />
    </AppShell>
  )
}

// ─── Stats strip ────────────────────────────────────────────────────────────

function StatsStrip({
  projects,
}: {
  projects: ProjectListItem[]
}): React.ReactElement {
  const totals = projects.reduce(
    (acc, p) => ({
      pages: acc.pages + p.stats.total_pages,
      elements: acc.elements + p.stats.total_elements,
      assets: acc.assets + p.stats.total_assets,
      uploaded: acc.uploaded + p.stats.uploaded_assets,
    }),
    { pages: 0, elements: 0, assets: 0, uploaded: 0 },
  )
  const lastRunAt = projects
    .map((p) => p.stats.last_run?.at)
    .filter((s): s is string => Boolean(s))
    .sort((a, b) => b.localeCompare(a))[0]

  const parts: string[] = [
    `${projects.length} 项目`,
    `${totals.pages} 页`,
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

// ─── Project list ───────────────────────────────────────────────────────────

function ProjectList({
  projects,
}: {
  projects: ProjectListItem[]
}): React.ReactElement {
  return (
    <Card variant="outlined" sx={{ overflow: 'hidden' }}>
      <Stack divider={<Divider flexItem />}>
        {projects.map((p) => (
          <ProjectRow key={p.id} project={p} />
        ))}
      </Stack>
    </Card>
  )
}

function ProjectRow({
  project: p,
}: {
  project: ProjectListItem
}): React.ReactElement {
  const { kind, label } = describeRunStatus(p.stats.last_run)

  const metaParts: string[] = [
    `${p.stats.total_pages} 页`,
    p.stats.total_elements > 0 ? `${p.stats.total_elements} 元素` : null,
    p.stats.total_assets > 0
      ? `${p.stats.uploaded_assets}/${p.stats.total_assets} 资产已上传`
      : null,
  ].filter((s): s is string => s !== null)

  const subtitleParts: string[] = []
  if (p.description) subtitleParts.push(p.description)
  subtitleParts.push(metaParts.join(' · '))

  return (
    <Box
      component={Link}
      href={`/projects/${p.id}`}
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
      <Thumbnail url={p.sample_thumbnail_url} alt={p.name} />

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
          {subtitleParts.join(' · ')}
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
        还没有项目
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        创建第一个项目,把 AI 生图设计稿转成 coding agent 可消费的素材包
      </Typography>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
        新建项目
      </Button>
    </Card>
  )
}

function LoadingList(): React.ReactElement {
  return (
    <Card variant="outlined" sx={{ overflow: 'hidden' }}>
      <Stack divider={<Divider flexItem />}>
        {Array.from({ length: 4 }).map((_, i) => (
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
              <Skeleton width="65%" height={16} sx={{ mt: 0.5 }} />
            </Box>
            <Skeleton width={120} height={16} />
          </Stack>
        ))}
      </Stack>
    </Card>
  )
}

// ─── New project dialog ─────────────────────────────────────────────────────

function NewProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}): React.ReactElement {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('项目已创建')
      setName('')
      setDescription('')
      onCreated()
    } catch (err) {
      toast.error(`创建失败:${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>新建项目</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            fullWidth
          />
          <TextField
            label="描述(可选)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={2}
            fullWidth
            helperText="一句话说明这是什么页面 / 活动,会写入 Pass 1 prompt 帮助 LLM 理解上下文"
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
// formatRelative / formatPassKind / describeRunStatus 已抽到 src/lib/format.ts
