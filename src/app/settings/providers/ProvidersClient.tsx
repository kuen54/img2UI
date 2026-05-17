'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import TextField from '@mui/material/TextField'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HomeIcon from '@mui/icons-material/Home'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import BoltIcon from '@mui/icons-material/Bolt'
import SaveIcon from '@mui/icons-material/Save'
import type {
  AppConfig,
  ProviderConfig,
  ProviderKind,
} from '@/lib/types'

const KIND_LABEL: Record<ProviderKind, string> = {
  mllm: 'MLLM (布局分析)',
  image_gen: 'Image Gen (资产提取)',
  cdn: 'CDN (S3 兼容)',
  matting: 'Matting (抠图 fallback)',
}

const KIND_ORDER: ProviderKind[] = ['mllm', 'image_gen', 'cdn', 'matting']

export function ProvidersClient(): React.ReactElement {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    void fetch('/api/config')
      .then((r) => r.json())
      .then((c: AppConfig) => {
        setConfig(c)
        setLoading(false)
      })
      .catch((err) => {
        toast.error(`加载配置失败:${err instanceof Error ? err.message : String(err)}`)
        setLoading(false)
      })
  }, [])

  const updateProvider = (id: string, patch: Partial<ProviderConfig>): void => {
    setConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        providers: prev.providers.map((p) =>
          p.id === id ? { ...p, ...patch } : p,
        ),
      }
    })
    setDirty(true)
  }

  const setActive = (kind: ProviderKind, id: string): void => {
    setConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        providers: prev.providers.map((p) =>
          p.kind === kind ? { ...p, active: p.id === id } : p,
        ),
      }
    })
    setDirty(true)
  }

  const save = async (): Promise<void> => {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t)
      }
      const updated = (await res.json()) as AppConfig
      setConfig(updated)
      setDirty(false)
      toast.success('已保存')
    } catch (err) {
      toast.error(`保存失败:${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ p: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }
  if (!config) return <Box sx={{ p: 8 }}>配置加载失败</Box>

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    providers: config.providers.filter((p) => p.kind === kind),
  }))

  return (
    <>
      <AppBar position="sticky">
        <Toolbar>
          <IconButton component={Link} href="/" edge="start" sx={{ mr: 2 }}>
            <HomeIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            img2UI · Settings · Providers
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            保存
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={3}>
          {grouped.map(({ kind, providers }) => (
            <Box key={kind}>
              <Typography variant="h3" sx={{ mb: 1.5 }}>
                {KIND_LABEL[kind]}
              </Typography>
              <Stack spacing={1.5}>
                {providers.length === 0 ? (
                  <Typography color="text.secondary" variant="body2">
                    无 provider
                  </Typography>
                ) : (
                  providers.map((p) => (
                    <ProviderAccordion
                      key={p.id}
                      provider={p}
                      onChange={(patch) => updateProvider(p.id, patch)}
                      onSetActive={() => setActive(p.kind, p.id)}
                    />
                  ))
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Container>
    </>
  )
}

// ─── 单个 provider 编辑卡 ─────────────────────────────────────────────────

interface ProviderAccordionProps {
  provider: ProviderConfig
  onChange: (patch: Partial<ProviderConfig>) => void
  onSetActive: () => void
}

function ProviderAccordion({
  provider: p,
  onChange,
  onSetActive,
}: ProviderAccordionProps): React.ReactElement {
  // active 的 provider 默认展开 — 减少首屏空气感
  const [expanded, setExpanded] = useState(!!p.active)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message?: string
    latency_ms?: number
  } | null>(null)

  const test = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: p.id }),
      })
      const data = (await res.json()) as {
        ok: boolean
        message?: string
        latency_ms?: number
      }
      setTestResult(data)
      if (data.ok) {
        toast.success(`✓ 连通,${data.latency_ms}ms`)
      } else {
        toast.error(`✗ ${data.message ?? '失败'}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setTestResult({ ok: false, message })
      toast.error(`✗ ${message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, x) => setExpanded(x)}
      sx={{
        '&:before': { display: 'none' },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        boxShadow: 'none',
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexGrow: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: p.active ? 'primary.main' : 'action.disabled',
            }}
          />
          <Typography fontWeight={500}>{p.name}</Typography>
          <Chip
            size="small"
            label={p.api_format}
            variant="outlined"
            sx={{ ml: 1 }}
          />
          {p.active && (
            <Chip size="small" label="active" color="primary" sx={{ ml: 'auto', mr: 1 }} />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={!!p.active}
                onChange={(e) => {
                  if (e.target.checked) onSetActive()
                  else onChange({ active: false })
                }}
              />
            }
            label="active(同 kind 内只能一个 active)"
          />

          <TextField
            label="名称"
            value={p.name}
            onChange={(e) => onChange({ name: e.target.value })}
            fullWidth
          />
          <TextField
            label="Base URL"
            value={p.base_url}
            onChange={(e) => onChange({ base_url: e.target.value })}
            fullWidth
            helperText={p.kind === 'cdn' ? 'S3 endpoint URL,如 https://s3.amazonaws.com' : ''}
          />

          {/* api_key field — secret */}
          <TextField
            label={p.kind === 'cdn' ? 'Secret Access Key' : 'API Key'}
            type={showKey ? 'text' : 'password'}
            value={p.api_key}
            onChange={(e) => onChange({ api_key: e.target.value })}
            fullWidth
            slotProps={{
              input: {
                endAdornment: (
                  <IconButton size="small" onClick={() => setShowKey((v) => !v)}>
                    {showKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                ),
              },
            }}
          />

          {p.kind === 'cdn' && (
            <>
              <TextField
                label="Access Key ID"
                value={p.access_key_id ?? ''}
                onChange={(e) => onChange({ access_key_id: e.target.value })}
                fullWidth
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Bucket"
                  value={p.bucket ?? ''}
                  onChange={(e) => onChange({ bucket: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Region"
                  value={p.region ?? ''}
                  onChange={(e) => onChange({ region: e.target.value })}
                  sx={{ width: 200 }}
                />
              </Stack>
              <TextField
                label="Public URL Prefix"
                value={p.public_url_prefix ?? ''}
                onChange={(e) => onChange({ public_url_prefix: e.target.value })}
                fullWidth
                helperText="e.g. https://cdn.example.com/img2ui/"
              />
            </>
          )}

          {(p.kind === 'mllm' || p.kind === 'image_gen' || p.kind === 'matting') && (
            <TextField
              label="Model"
              value={p.model ?? ''}
              onChange={(e) => onChange({ model: e.target.value })}
              fullWidth
            />
          )}

          {p.kind === 'mllm' && (
            <Stack direction="row" spacing={2}>
              <TextField
                label="Temperature"
                type="number"
                inputProps={{ step: 0.1, min: 0, max: 2 }}
                value={p.default_temperature ?? 1}
                onChange={(e) =>
                  onChange({ default_temperature: parseFloat(e.target.value) })
                }
                sx={{ width: 160 }}
              />
              <TextField
                label="Max tokens"
                type="number"
                value={p.default_max_tokens ?? 32000}
                onChange={(e) =>
                  onChange({ default_max_tokens: parseInt(e.target.value, 10) })
                }
                sx={{ width: 200 }}
              />
            </Stack>
          )}

          {p.kind === 'image_gen' && (
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <TextField
                label="Quality"
                value={p.default_quality ?? 'high'}
                onChange={(e) =>
                  onChange({
                    default_quality: e.target.value as 'low' | 'medium' | 'high',
                  })
                }
                select
                SelectProps={{ native: true }}
                sx={{ width: 140 }}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </TextField>
              <TextField
                label="Poll initial delay (s)"
                type="number"
                value={p.poll_initial_delay_seconds ?? 12}
                onChange={(e) =>
                  onChange({ poll_initial_delay_seconds: parseInt(e.target.value, 10) })
                }
                sx={{ width: 180 }}
              />
              <TextField
                label="Poll interval (s)"
                type="number"
                value={p.poll_interval_seconds ?? 5}
                onChange={(e) =>
                  onChange({ poll_interval_seconds: parseInt(e.target.value, 10) })
                }
                sx={{ width: 160 }}
              />
              <TextField
                label="Poll max attempts"
                type="number"
                value={p.poll_max_attempts ?? 60}
                onChange={(e) =>
                  onChange({ poll_max_attempts: parseInt(e.target.value, 10) })
                }
                sx={{ width: 180 }}
              />
            </Stack>
          )}

          <Divider />

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="contained"
              color="primary"
              startIcon={
                testing ? <CircularProgress size={16} /> : <BoltIcon />
              }
              disabled={testing}
              onClick={() => void test()}
              aria-label={`Test Connection (${p.name})`}
            >
              Test Connection
            </Button>
            {testResult && (
              <Chip
                size="small"
                color={testResult.ok ? 'success' : 'error'}
                label={
                  testResult.ok
                    ? `✓ ${testResult.latency_ms ?? '?'}ms`
                    : `✗ ${testResult.message ?? '失败'}`
                }
              />
            )}
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}
