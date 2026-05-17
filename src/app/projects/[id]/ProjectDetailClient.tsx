'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Skeleton from '@mui/material/Skeleton'
import Fab from '@mui/material/Fab'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import HomeIcon from '@mui/icons-material/Home'
import { AppShell } from '@/components/AppShell'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { Project, Page, StatePipelineStatus } from '@/lib/types'

interface PageListItem extends Page {
  thumbnail_url?: string
  has_state: boolean
  pipeline_status?: StatePipelineStatus
}

const STATUS_COLOR: Record<StatePipelineStatus, 'default' | 'primary' | 'success' | 'error'> = {
  idle: 'default',
  pass1_running: 'primary',
  pass1_done: 'primary',
  pass1_failed: 'error',
  pass2_running: 'primary',
  pass2_done: 'success',
  pass2_failed: 'error',
  validating: 'primary',
  validated: 'success',
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

  // 加载完发现项目不存在 → 整页 404,不渲染下方页面列表 / FAB / 删除按钮
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
        {project ? (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h2">{project.name}</Typography>
            {project.description && (
              <Typography color="text.secondary">{project.description}</Typography>
            )}
          </Box>
        ) : (
          <Skeleton variant="text" width={320} height={48} />
        )}

        <Typography variant="h4" sx={{ mb: 2, mt: 3 }}>
          页面
        </Typography>

        {pages === null ? (
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 2.5 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" width={280} height={260} sx={{ borderRadius: 4 }} />
            ))}
          </Stack>
        ) : pages.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              还没有页面
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              新建页面
            </Button>
          </Box>
        ) : (
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 2.5 }}>
            {pages.map((p) => (
              <PageCard key={p.id} projectId={projectId} page={p} />
            ))}
          </Stack>
        )}
      </Container>

      <Fab
        color="primary"
        onClick={() => setDialogOpen(true)}
        sx={{ position: 'fixed', bottom: 32, right: 32 }}
      >
        <AddIcon />
      </Fab>

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

function PageCard({
  projectId,
  page: p,
}: {
  projectId: string
  page: PageListItem
}): React.ReactElement {
  const status = p.pipeline_status ?? 'idle'
  return (
    <Card
      sx={{
        width: 280,
        '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' },
      }}
    >
      <CardActionArea component={Link} href={`/projects/${projectId}/pages/${p.id}`}>
        {p.thumbnail_url ? (
          <CardMedia
            component="img"
            image={p.thumbnail_url}
            alt={p.name}
            sx={{ height: 160, objectFit: 'cover', bgcolor: 'background.default' }}
          />
        ) : (
          <Box
            sx={{
              height: 160,
              bgcolor: 'background.default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              fontSize: 12,
            }}
          >
            （未上传图）
          </Box>
        )}
        <CardContent>
          <Typography variant="h5" noWrap>
            {p.name}
          </Typography>
          {p.route_hint && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {p.route_hint}
            </Typography>
          )}
          <Box sx={{ mt: 1 }}>
            {p.has_state ? (
              <Chip size="small" label={status} color={STATUS_COLOR[status]} />
            ) : (
              <Chip size="small" label="未上传" variant="outlined" />
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

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
