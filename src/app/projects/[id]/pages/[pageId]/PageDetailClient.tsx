'use client'

import Link from 'next/link'
import { useEffect, useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import RefreshIcon from '@mui/icons-material/Refresh'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import HomeIcon from '@mui/icons-material/Home'
import { AppShell } from '@/components/AppShell'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { Project, Page, StateRecord, StatePipelineStatus } from '@/lib/types'

interface PageWithStates extends Page {
  states: StateRecord[]
}

const STAGE_LABELS: Array<{ key: string; label: string; matchStatus: StatePipelineStatus[] }> = [
  { key: 'pass1', label: 'Pass 1 · 布局分析', matchStatus: ['pass1_running', 'pass1_done', 'pass1_failed'] },
  { key: 'element_review', label: 'Element Review', matchStatus: ['pass1_done'] },
  { key: 'pass2', label: 'Pass 2 · 资产提取', matchStatus: ['pass2_running', 'pass2_done', 'pass2_failed'] },
  { key: 'asset_review', label: 'Asset Review', matchStatus: ['pass2_done'] },
  { key: 'validate', label: 'Validate', matchStatus: ['validating', 'validated'] },
  { key: 'export', label: 'Export', matchStatus: [] },
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
        toast.error(`加载失败:${err instanceof Error ? err.message : String(err)}`)
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
          <Skeleton variant="rounded" height={400} />
        ) : !page ? (
          <NotFoundCard message="该页面不存在或已被删除。" />
        ) : (
          <>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h2">{page.name}</Typography>
              {page.route_hint && (
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  路由 {page.route_hint}
                </Typography>
              )}
            </Box>

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

// ─── Dropzone ──────────────────────────────────────────────────────────────

function UploadDropzone({
  pageId,
  onUploaded,
}: {
  pageId: string
  onUploaded: () => void
}): React.ReactElement {
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const upload = async (file: File): Promise<void> => {
    if (!file.type.includes('png') && !file.name.toLowerCase().endsWith('.png')) {
      toast.error('只接受 PNG 文件')
      return
    }
    setUploading(true)
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
      toast.error(`上传失败:${err instanceof Error ? err.message : String(err)}`)
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
        transition: 'all 0.2s',
      }}
    >
      {uploading ? (
        <Stack alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography color="text.secondary">上传中…</Typography>
        </Stack>
      ) : (
        <Stack alignItems="center" spacing={2}>
          <UploadFileIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
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
  const fileInput = useRef<HTMLInputElement>(null)

  const inFlight = state.pipeline_status.endsWith('_running') || state.pipeline_status === 'validating'
  const inFlightWarning = inFlight ? (
    <Box sx={{ mt: 1.5, p: 1, bgcolor: 'warning.light', color: 'warning.contrastText', borderRadius: 1 }}>
      ⚠ 当前 pipeline 还在跑(<code>{state.pipeline_status}</code>)。继续会丢失正在执行的结果(LLM 调用本身不会停止,但产物会被删)。
    </Box>
  ) : null

  const replaceUpload = async (file: File): Promise<void> => {
    setReUploading(true)
    try {
      // 先删除
      const delRes = await fetch(`/api/states/${state.id}`, { method: 'DELETE' })
      if (!delRes.ok && delRes.status !== 204) throw new Error(await delRes.text())
      // 再上传
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
      toast.error(`替换失败:${err instanceof Error ? err.message : String(err)}`)
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
      toast.error(`删除失败:${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
      {/* 设计稿预览 */}
      <Card sx={{ flexGrow: 1, maxWidth: { md: 720 } }}>
        <Box
          sx={{
            position: 'relative',
            bgcolor: 'background.default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 320,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/raw/${state.id}`}
            alt="design mockup"
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
        </Box>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {state.width} × {state.height} px · {state.name}
            </Typography>
            <Stack direction="row" spacing={1}>
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
                <DeleteIcon />
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
        </CardContent>
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
  const stageState = (key: string): 'done' | 'active' | 'pending' | 'failed' => {
    const order = ['pass1', 'element_review', 'pass2', 'asset_review', 'validate', 'export']
    const idx = order.indexOf(key)
    const currentIdx =
      status === 'pass1_running' ? 0
      : status === 'pass1_done' ? 1
      : status === 'pass1_failed' ? 0
      : status === 'pass2_running' ? 2
      : status === 'pass2_done' ? 3
      : status === 'pass2_failed' ? 2
      : status === 'validating' ? 4
      : status === 'validated' ? 5
      : -1
    if (status.endsWith('_failed') && idx === currentIdx) return 'failed'
    if (idx < currentIdx) return 'done'
    if (idx === currentIdx + 1) return 'active'
    return 'pending'
  }

  const [running, setRunning] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  const runPass1 = async (): Promise<void> => {
    setRunning(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/states/${state.id}/pass1`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const { run_id } = (await res.json()) as { run_id: string }
      toast.info('Pass 1 启动…轮询状态中')
      pollPipelineRun(run_id, () => {
        onChanged()
        setRunning(false)
      })
    } catch (err) {
      toast.error(`Pass 1 失败:${err instanceof Error ? err.message : String(err)}`)
      setRunning(false)
    }
  }

  const runPass2 = async (): Promise<void> => {
    setRunning(true)
    try {
      const res = await fetch(`/api/states/${state.id}/pass2`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const { run_id } = (await res.json()) as { run_id: string }
      toast.info('Pass 2 启动…轮询状态中(可能要 1-3 分钟)')
      pollPipelineRun(run_id, () => {
        onChanged()
        setRunning(false)
      })
    } catch (err) {
      toast.error(`Pass 2 失败:${err instanceof Error ? err.message : String(err)}`)
      setRunning(false)
    }
  }

  return (
    <Card sx={{ minWidth: { md: 320 }, flexShrink: 0 }}>
      <CardContent>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Pipeline
        </Typography>

        <Stack spacing={1.5}>
          {STAGE_LABELS.map((s) => {
            const st = stageState(s.key)
            return (
              <Stack key={s.key} direction="row" alignItems="center" spacing={1.5}>
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor:
                      st === 'done' ? 'success.main'
                      : st === 'active' ? 'primary.main'
                      : st === 'failed' ? 'error.main'
                      : 'action.disabled',
                    color: 'white',
                    fontSize: 12,
                  }}
                >
                  {st === 'done' ? (
                    <CheckIcon sx={{ fontSize: 14 }} />
                  ) : st === 'active' ? (
                    '▸'
                  ) : st === 'failed' ? (
                    <CloseIcon sx={{ fontSize: 14 }} />
                  ) : (
                    ''
                  )}
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color:
                      st === 'pending' ? 'text.secondary'
                      : st === 'failed' ? 'error.main'
                      : 'text.primary',
                    fontWeight: st === 'active' ? 600 : 400,
                  }}
                >
                  {s.label}
                </Typography>
              </Stack>
            )
          })}
        </Stack>

        {errorMessage && (
          <Box
            sx={{
              mt: 2.5,
              p: 1.5,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'error.main',
              bgcolor: 'error.light',
              color: 'error.contrastText',
            }}
          >
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <ErrorOutlineIcon sx={{ fontSize: 18, mt: 0.25 }} />
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
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
              </Box>
            </Stack>
          </Box>
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
            {running ? 'Pass 1 运行中…' : '运行 Pass 1'}
          </Button>
        )}

        {status === 'pass1_running' && (
          <Box sx={{ mt: 3 }}>
            <LinearProgress />
            <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
              Pass 1 运行中…
            </Typography>
          </Box>
        )}

        {status === 'pass1_done' && (
          <Stack spacing={1} sx={{ mt: 3 }}>
            <Chip label="Pass 1 已完成" color="success" />
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

        {(status === 'pass2_running') && (
          <Box sx={{ mt: 3 }}>
            <LinearProgress />
            <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
              Pass 2 运行中…1-3 分钟
            </Typography>
          </Box>
        )}

        {(status === 'pass2_done' || status === 'validated') && (
          <Stack spacing={1} sx={{ mt: 3 }}>
            <Chip label={status === 'validated' ? '已校验' : 'Pass 2 已完成'} color="success" />
            <Button
              variant="contained"
              component={Link}
              href={`/projects/${projectId}/pages/${pageId}/asset-review`}
              fullWidth
              startIcon={<PlayArrowIcon />}
            >
              Asset Review
            </Button>
            <CdnExportActions stateId={state.id} pageId={pageId} />
          </Stack>
        )}

        {status === 'pass2_failed' && (
          <Stack spacing={1} sx={{ mt: 3 }}>
            <Chip label="Pass 2 失败" color="error" />
            <Button
              variant="contained"
              fullWidth
              startIcon={running ? <CircularProgress size={14} /> : <PlayArrowIcon />}
              disabled={running}
              onClick={() => void runPass2()}
            >
              重跑 Pass 2
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

// ─── NotFoundCard ──────────────────────────────────────────────────────────

function NotFoundCard({ message }: { message: string }): React.ReactElement {
  return (
    <Box sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h2" sx={{ fontSize: 56, color: 'text.disabled' }}>
        404
      </Typography>
      <Typography variant="body1" sx={{ mt: 1, mb: 3 }} color="text.secondary">
        {message}
      </Typography>
      <Button variant="contained" component={Link} href="/" startIcon={<HomeIcon />}>
        回首页
      </Button>
    </Box>
  )
}

function pollPipelineRun(runId: string, onDone: () => void): void {
  const interval = setInterval(() => {
    void fetch(`/api/pipeline-runs/${runId}`)
      .then((r) => r.json())
      .then((run: { status: 'running' | 'completed' | 'failed'; error?: { message: string } }) => {
        if (run.status === 'completed') {
          clearInterval(interval)
          toast.success('Pass 1 完成')
          onDone()
        } else if (run.status === 'failed') {
          clearInterval(interval)
          toast.error(`Pass 1 失败:${run.error?.message ?? '未知错误'}`)
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
}: {
  stateId: string
  pageId: string
}): React.ReactElement {
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [validating, setValidating] = useState(false)

  const validate = async (): Promise<void> => {
    setValidating(true)
    try {
      const res = await fetch(`/api/states/${stateId}/validate`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      toast.info('反向校验运行中…')
    } catch (err) {
      toast.error(`校验失败:${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setValidating(false)
    }
  }

  const upload = async (): Promise<void> => {
    setUploading(true)
    try {
      const res = await fetch(`/api/pages/${pageId}/upload-all-assets`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { uploaded: number; failed: string[] }
      toast.success(`已上传 ${data.uploaded} 个 asset${data.failed.length > 0 ? `,${data.failed.length} 个失败` : ''}`)
    } catch (err) {
      toast.error(`上传失败:${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const exportFolder = async (): Promise<void> => {
    const dir = prompt('输出目录(留空 = ~/img2ui-out):', '')
    if (dir === null) return // cancelled
    setExporting(true)
    try {
      const body: Record<string, unknown> = {}
      if (dir.trim()) body['output_dir'] = dir.trim()
      const res = await fetch(`/api/pages/${pageId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { path: string }
      toast.success(`已导出到 ${data.path}`)
    } catch (err) {
      toast.error(`导出失败:${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Stack spacing={1}>
      <Button
        size="small"
        variant="outlined"
        disabled={validating}
        onClick={() => void validate()}
      >
        {validating ? '反向校验中…' : '反向校验(LLM 验质量)'}
      </Button>
      <Button
        size="small"
        variant="outlined"
        disabled={uploading}
        onClick={() => void upload()}
      >
        {uploading ? '上传中…' : '上传所有 asset 到 CDN'}
      </Button>
      <Button
        size="small"
        variant="contained"
        color="primary"
        disabled={exporting}
        onClick={() => void exportFolder()}
      >
        {exporting ? '导出中…' : '导出文件夹'}
      </Button>
    </Stack>
  )
}
