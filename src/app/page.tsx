'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { errText } from '@/lib/error-text'
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
import CircularProgress from '@mui/material/CircularProgress'
import Grow from '@mui/material/Grow'
import {
  Plus as AddIcon,
  Folder as FolderOutlinedIcon,
  FileText as ArticleOutlinedIcon,
  LayoutGrid as DashboardCustomizeOutlinedIcon,
  CloudUpload as CloudUploadOutlinedIcon,
  Clock as ScheduleOutlinedIcon,
  Image as ImageOutlinedIcon,
} from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { StatusDot } from '@/components/StatusDot'
import { StatChip } from '@/components/StatChip'
import { EmptyState } from '@/components/EmptyState'
import { riseInSx } from '@/theme'
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

/** 新建项目尚未有任何内容,零值 stats(局部插入用,后台 refetch 会校准) */
const EMPTY_STATS: ProjectStats = {
  total_pages: 0,
  total_states: 0,
  total_elements: 0,
  total_assets: 0,
  uploaded_assets: 0,
  pipeline_coverage: { idle: 0, pass1_done: 0, pass2_done: 0, validated: 0, other: 0 },
}

export default function HomePage(): React.ReactElement {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // 最近一次本地插入的项目 id:只让它做 Grow 进场,存量卡片不动
  const [recentId, setRecentId] = useState<string | null>(null)

  const reload = (): void => {
    void fetch('/api/projects')
      .then((r) => r.json())
      .then(setProjects)
      .catch((err) => {
        toast.error(`加载失败:${errText(err)}`)
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
          gap={1}
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
          <ProjectCardGrid projects={projects} recentId={recentId} />
        )}
      </Container>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(project) => {
          setDialogOpen(false)
          // 局部插入(Grow 进场),后台 refetch 校准 stats/缩略图
          setRecentId(project.id)
          setProjects((prev) => [
            { ...project, pages_count: 0, stats: EMPTY_STATS },
            ...(prev ?? []),
          ])
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
      <StatChip icon={<FolderOutlinedIcon />} value={projects.length} label="项目" />
      <StatChip icon={<ArticleOutlinedIcon />} value={totals.pages} label="页" />
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

// ─── Project card grid ─────────────────────────────────────────────────────

function ProjectCardGrid({
  projects,
  recentId,
}: {
  projects: ProjectListItem[]
  recentId: string | null
}): React.ReactElement {
  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ flexWrap: 'wrap', gap: 2.5, ...riseInSx }}
    >
      {projects.map((p) => (
        // appear 只对「本地新插入」的卡片为 true:存量卡片首屏不播动画
        <Grow key={p.id} in appear={p.id === recentId} timeout={250}>
          <Box>
            <ProjectCard project={p} />
          </Box>
        </Grow>
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
  const allUploaded =
    p.stats.total_assets > 0 && p.stats.uploaded_assets === p.stats.total_assets

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
          <Box sx={{ height: 180, bgcolor: 'surface.container' }}>
            <EmptyState
              variant="compact"
              icon={<ImageOutlinedIcon />}
              title="无设计稿"
            />
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
          <Stack
            direction="row"
            useFlexGap
            columnGap={1.5}
            alignItems="center"
            sx={{ mt: 0.75, flexWrap: 'wrap' }}
          >
            <StatChip
              size="small"
              icon={<ArticleOutlinedIcon />}
              value={p.stats.total_pages}
              label="页"
            />
            {p.stats.total_elements > 0 && (
              <StatChip
                size="small"
                icon={<DashboardCustomizeOutlinedIcon />}
                value={p.stats.total_elements}
                label="元素"
              />
            )}
            {p.stats.total_assets > 0 && (
              <StatChip
                size="small"
                icon={<CloudUploadOutlinedIcon />}
                value={`${p.stats.uploaded_assets}/${p.stats.total_assets}`}
                label="已上传"
                valueColor={allUploaded ? 'success.main' : 'text.primary'}
              />
            )}
          </Stack>
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
        icon={<FolderOutlinedIcon />}
        title="还没有项目"
        description="创建第一个项目,把 AI 生图设计稿转成 coding agent 可消费的素材包"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
            新建项目
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
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} sx={{ width: 280 }}>
          <Skeleton variant="rectangular" height={180} animation="wave" />
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

// ─── New project dialog ─────────────────────────────────────────────────────

function NewProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (project: Project) => void
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
      const project = (await res.json()) as Project
      toast.success('项目已创建')
      setName('')
      setDescription('')
      onCreated(project)
    } catch (err) {
      toast.error(`创建失败:${errText(err)}`)
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
// formatRelative / formatPassKind / describeRunStatus 已抽到 src/lib/format.ts
