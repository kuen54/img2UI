// llm-client: chat completions + image_gen 调用
// Phase 2 实现:Test Connection 用的 ping(最小请求 + 30s timeout)
// Phase 4/5 扩展:加 retry / response 解析 / streaming

import type { ProviderConfig } from '@/lib/types'

export type PingResult =
  | { ok: true; latency_ms: number }
  | { ok: false; error: string }

const PING_TIMEOUT_MS = 30_000

// =============================================================================
// MLLM ping(5-token chat completion)
// =============================================================================

export async function pingMllm(provider: ProviderConfig): Promise<PingResult> {
  if (provider.kind !== 'mllm') {
    return { ok: false, error: `provider kind 不是 mllm: ${provider.kind}` }
  }
  if (!provider.api_key) return { ok: false, error: 'api_key 未填' }
  if (!provider.model) return { ok: false, error: 'model 未填' }

  const t0 = Date.now()
  try {
    switch (provider.api_format) {
      case 'openai':
      case 'apimart':
        await openaiCompatChatPing(provider, true)
        break
      case 'sankuai':
        await openaiCompatChatPing(provider, false)
        break
      case 'anthropic':
        await anthropicMessagesPing(provider)
        break
      default:
        return { ok: false, error: `mllm 不支持 api_format: ${provider.api_format}` }
    }
    return { ok: true, latency_ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: errMessage(e) }
  }
}

async function openaiCompatChatPing(p: ProviderConfig, withBearer: boolean): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: withBearer ? `Bearer ${p.api_key}` : p.api_key,
  }
  const body = {
    model: p.model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 5,
    temperature: 0,
  }
  await fetchWithTimeout(`${p.base_url}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

async function anthropicMessagesPing(p: ProviderConfig): Promise<void> {
  await fetchWithTimeout(`${p.base_url}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': p.api_key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  })
}

// =============================================================================
// ImageGen ping
// =============================================================================
// - api_format='openai' + is_async=false:发最小 generations 请求(256x256, n=1, prompt="test")
// - api_format='apimart' + is_async=true:仅 submit 拿 task_id,不轮询不下载(0 cost)

export async function pingImageGen(provider: ProviderConfig): Promise<PingResult> {
  if (provider.kind !== 'image_gen') {
    return { ok: false, error: `provider kind 不是 image_gen: ${provider.kind}` }
  }
  if (!provider.api_key) return { ok: false, error: 'api_key 未填' }
  if (!provider.model) return { ok: false, error: 'model 未填' }

  const t0 = Date.now()
  try {
    if (provider.api_format === 'apimart' && provider.is_async) {
      await apimartSubmitPing(provider)
    } else if (provider.api_format === 'openai') {
      await openaiImageGenPing(provider)
    } else {
      return {
        ok: false,
        error: `image_gen 不支持 api_format=${provider.api_format} is_async=${provider.is_async}`,
      }
    }
    return { ok: true, latency_ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: errMessage(e) }
  }
}

async function apimartSubmitPing(p: ProviderConfig): Promise<void> {
  const body = {
    model: p.model,
    prompt: 'test',
    size: '1:1',
    resolution: '1k',
    quality: p.default_quality ?? 'high',
    n: 1,
  }
  const res = await fetchWithTimeout(`${p.base_url}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.api_key}`,
    },
    body: JSON.stringify(body),
  })
  // 必须返回 task_id 才算 submit 成功
  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{ status?: string; task_id?: string }>
  }
  const first = json.data?.[0]
  if (!first?.task_id) {
    throw new Error(`apimart submit 未返回 task_id: ${JSON.stringify(json).slice(0, 200)}`)
  }
}

async function openaiImageGenPing(p: ProviderConfig): Promise<void> {
  const body = {
    model: p.model,
    prompt: 'test',
    size: '256x256',
    n: 1,
  }
  await fetchWithTimeout(`${p.base_url}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.api_key}`,
    },
    body: JSON.stringify(body),
  })
}

// =============================================================================
// 通用工具
// =============================================================================

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}

function errMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'AbortError') return '请求超时(>30s)'
    return e.message
  }
  return String(e)
}
