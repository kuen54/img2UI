'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import Fab from '@mui/material/Fab'
import Stack from '@mui/material/Stack'
import Skeleton from '@mui/material/Skeleton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import AddIcon from '@mui/icons-material/Add'
import { AppShell } from '@/components/AppShell'
import type { Project } from '@/lib/types'

interface ProjectListItem extends Project {
  sample_thumbnail_url?: string
  pages_count: number
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
        <Typography variant="h2" sx={{ mb: 3 }}>
          我的项目
        </Typography>

        {projects === null ? (
          <Stack
            direction="row"
            useFlexGap
            sx={{ flexWrap: 'wrap', gap: 2.5 }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rounded"
                width={260}
                height={300}
                sx={{ borderRadius: 4 }}
              />
            ))}
          </Stack>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={() => setDialogOpen(true)} />
        ) : (
          <Stack
            direction="row"
            useFlexGap
            sx={{ flexWrap: 'wrap', gap: 2.5 }}
          >
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
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

function ProjectCard({ project: p }: { project: ProjectListItem }): React.ReactElement {
  return (
    <Card
      sx={{
        width: 260,
        transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.18s ease, outline-color 0.18s ease',
        outline: '1px solid transparent',
        outlineOffset: -1,
        '&:hover': {
          boxShadow: 3,
          transform: 'translateY(-2px)',
          outline: '1px solid rgba(13, 153, 255, 0.4)',
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
              color: 'text.secondary',
              fontSize: 12,
            }}
          >
            （无设计稿）
          </Box>
        )}
        <CardContent>
          <Typography variant="h5" noWrap>
            {p.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {p.pages_count} 页 · {new Date(p.created_at).toLocaleDateString('zh-CN')}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }): React.ReactElement {
  return (
    <Box
      sx={{
        textAlign: 'center',
        py: 10,
        color: 'text.secondary',
      }}
    >
      <Typography variant="h5" sx={{ mb: 1 }}>
        还没有项目
      </Typography>
      <Typography variant="body2" sx={{ mb: 3 }}>
        创建第一个项目,把 AI 生图设计稿转成 coding agent 可消费的素材包
      </Typography>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
        新建项目
      </Button>
    </Box>
  )
}

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
