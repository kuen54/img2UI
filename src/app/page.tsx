'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardMedia from '@mui/material/CardMedia'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Skeleton from '@mui/material/Skeleton'
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
          <LoadingGrid />
        ) : projects.length === 0 ? (
          <EmptyInline onCreate={() => setDialogOpen(true)} />
        ) : (
          <ProjectCardGrid projects={projects} />
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

// ─── Project card grid ─────────────────────────────────────────────────────

function ProjectCardGrid({
  projects,
}: {
  projects: ProjectListItem[]
}): React.ReactElement {
  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ flexWrap: 'wrap', gap: 2.5 }}
    >
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </Stack>
  )
}

function ProjectCard({
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

  return (
    <Card
      sx={{
        width: 280,
        outline: '1px solid transparent',
        outlineOffset: -1,
        transition:
          'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.18s ease, outline-color 0.18s ease',
        '&:hover': {
          boxShadow: 3,
          transform: 'translateY(-2px)',
          outline: `1px solid ${alpha('#0d99ff', 0.4)}`,
        },
      }}
    >
      <CardActionArea component={Link} href={`/projects/${p.id}`}>
        {p.sample_thumbnail_url ? (
          <CardMedia
            component="img"
            image={p.sample_thumbnail_url}
            alt={p.name}
            sx={{
              height: 180,
              objectFit: 'cover',
              bgcolor: 'background.default',
            }}
          />
        ) : (
          <Box
            sx={{
              height: 180,
              bgcolor: 'background.default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.disabled',
              fontSize: 12,
            }}
          >
            (无设计稿)
          </Box>
        )}
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="h5" noWrap>
            {p.name}
          </Typography>
          {p.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ mt: 0.25 }}
            >
              {p.description}
            </Typography>
          )}
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            sx={{ mt: 0.5 }}
          >
            {metaParts.join(' · ')}
          </Typography>
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

function LoadingGrid(): React.ReactElement {
  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ flexWrap: 'wrap', gap: 2.5 }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton
          key={i}
          variant="rounded"
          width={280}
          height={310}
          sx={{ borderRadius: 3 }}
        />
      ))}
    </Stack>
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
