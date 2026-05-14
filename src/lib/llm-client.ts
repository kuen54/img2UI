// llm-client: chat completions + image_gen 调用
// Phase 2 实现:Test Connection 用的 ping(最小请求 + 30s timeout)
// Phase 4 扩展:callMllm 完整 chat completion(多模态 messages + 解析 content)

import type { ProviderConfig } from '@/lib/types'

export type PingResult =
  | { ok: true; latency_ms: number }
  | { ok: false; error: string }

const PING_TIMEOUT_MS = 30_000
const CALL_TIMEOUT_MS = 120_000

// =============================================================================
// callMllm:完整 chat completion(Pass 1 主调用,Phase 4 新增)
// =============================================================================

// 内部约定输入用 OpenAI message 格式,内部转译 anthropic
export type MllmTextPart = { type: 'text'; text: string }
export type MllmImagePart = { type: 'image_url'; image_url: { url: string } }
export type MllmContent = string | Array<MllmTextPart | MllmImagePart>
export type MllmMessage = { role: 'system' | 'user' | 'assistant'; content: MllmContent }

export type CallMllmOptions = {
  messages: MllmMessage[]
  max_tokens?: number
  temperature?: number
  response_format?: { type: 'json_object' }
  extra_body?: Record<string, unknown>
  signal?: AbortSignal
}

export async function callMllm(
  provider: ProviderConfig,
  opts: CallMllmOptions,
): Promise<{ content: string; usage?: Record<string, unknown> }> {
  if (provider.kind !== 'mllm') throw new Error(`provider kind 不是 mllm: ${provider.kind}`)
  if (!provider.api_key) throw new Error('api_key 未填')
  if (!provider.model) throw new Error('model 未填')

  switch (provider.api_format) {
    case 'openai':
    case 'apimart':
      return callOpenAICompat(provider, opts, true)
    case 'sankuai':
      return callOpenAICompat(provider, opts, false)
    case 'anthropic':
      return callAnthropic(provider, opts)
    default:
      throw new Error(`mllm 不支持 api_format: ${provider.api_format}`)
  }
}

async function callOpenAICompat(
  p: ProviderConfig,
  opts: CallMllmOptions,
  withBearer: boolean,
): Promise<{ content: string; usage?: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: withBearer ? `Bearer ${p.api_key}` : p.api_key,
  }
  const body: Record<string, unknown> = {
    model: p.model,
    messages: opts.messages,
    ...(opts.max_tokens !== undefined && { max_tokens: opts.max_tokens }),
    ...(opts.temperature !== undefined && { temperature: opts.temperature }),
    ...(opts.response_format !== undefined && { response_format: opts.response_format }),
    ...(opts.extra_body !== undefined && opts.extra_body),
  }
  const json = (await callJsonWithTimeout(`${p.base_url}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    ...(opts.signal !== undefined && { signal: opts.signal }),
  })) as { choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, unknown> }
  const content = json.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`LLM 响应无 content:${JSON.stringify(json).slice(0, 300)}`)
  }
  return { content, ...(json.usage !== undefined && { usage: json.usage }) }
}

async function callAnthropic(
  p: ProviderConfig,
  opts: CallMllmOptions,
): Promise<{ content: string; usage?: Record<string, unknown> }> {
  // 转译 OpenAI → Anthropic 格式:
  //   - system message → top-level `system` 字段
  //   - user content array image_url → image source(data URL parse)
  let systemText = ''
  const userMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> = []
  for (const m of opts.messages) {
    if (m.role === 'system') {
      systemText += (typeof m.content === 'string' ? m.content : '') + '\n'
      continue
    }
    if (typeof m.content === 'string') {
      userMessages.push({ role: m.role, content: m.content })
      continue
    }
    const parts = m.content.map((part) => {
      if (part.type === 'text') return { type: 'text', text: part.text }
      // image_url: data:image/png;base64,xxx
      const url = part.image_url.url
      const m1 = url.match(/^data:([^;]+);base64,(.+)$/)
      if (!m1) throw new Error('Anthropic 仅支持 data URL 形式的 image')
      return { type: 'image', source: { type: 'base64', media_type: m1[1], data: m1[2] } }
    })
    userMessages.push({ role: m.role, content: parts })
  }
  const body: Record<string, unknown> = {
    model: p.model,
    max_tokens: opts.max_tokens ?? 4096,
    messages: userMessages,
    ...(systemText.trim() && { system: systemText.trim() }),
    ...(opts.temperature !== undefined && { temperature: opts.temperature }),
  }
  const json = (await callJsonWithTimeout(`${p.base_url}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': p.api_key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    ...(opts.signal !== undefined && { signal: opts.signal }),
  })) as { content?: Array<{ type: string; text?: string }>; usage?: Record<string, unknown> }
  const text = json.content?.find((c) => c.type === 'text')?.text
  if (typeof text !== 'string') {
    throw new Error(`Anthropic 响应无 text content:${JSON.stringify(json).slice(0, 300)}`)
  }
  return { content: text, ...(json.usage !== undefined && { usage: json.usage }) }
}

async function callJsonWithTimeout(url: string, init: RequestInit): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS)
  try {
    const passedSignal = init.signal
    if (passedSignal) {
      passedSignal.addEventListener('abort', () => ctrl.abort())
    }
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

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

// =============================================================================
// callImageGen:完整 image generation(Pass 2 主调用,Phase 5 新增)
// 只支持 apimart async + openai sync 两种(SPEC § Provider 调用模式 § image generation)
// =============================================================================

const APIMART_INITIAL_DELAY_MS = 12_000
const APIMART_POLL_INTERVAL_MS = 5_000
const APIMART_MAX_ATTEMPTS = 60   // Phase 8f BUG #2:60 × 5s = 300s(5 分钟兜底)
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0'

export type CallImageGenOptions = {
  prompt: string
  reference_image_base64?: string    // 完整 data URL `data:image/png;base64,...`(主图,通常是原图)
  reference_image_base64s?: string[] // 额外参考图(crop 列表),Phase 8c 多参考图新增
  size?: string                      // apimart: '1:1' / '9:16';openai: '1024x1024' 等
  resolution?: string                // apimart 专用:'1k' / '2k' / '4k'
  quality?: 'low' | 'medium' | 'high'
  n?: number
  signal?: AbortSignal
}

export async function callImageGen(
  provider: ProviderConfig,
  opts: CallImageGenOptions,
): Promise<{ image: Buffer; cost?: number; latency_ms: number }> {
  if (provider.kind !== 'image_gen') throw new Error(`provider kind 不是 image_gen: ${provider.kind}`)
  if (!provider.api_key) throw new Error('api_key 未填')
  if (!provider.model) throw new Error('model 未填')

  const t0 = Date.now()
  if (provider.api_format === 'apimart' && provider.is_async) {
    const result = await callApimartAsync(provider, opts)
    return { ...result, latency_ms: Date.now() - t0 }
  }
  if (provider.api_format === 'openai') {
    const buffer = await callOpenAIImageSync(provider, opts)
    return { image: buffer, latency_ms: Date.now() - t0 }
  }
  throw new Error(`image_gen 不支持 api_format=${provider.api_format} is_async=${String(provider.is_async)}`)
}

async function callApimartAsync(
  p: ProviderConfig,
  opts: CallImageGenOptions,
): Promise<{ image: Buffer; cost?: number }> {
  // 1. submit
  const submitBody: Record<string, unknown> = {
    model: p.model,
    prompt: opts.prompt,
    size: opts.size ?? '1:1',
    resolution: opts.resolution ?? '1k',
    quality: opts.quality ?? p.default_quality ?? 'high',
    n: opts.n ?? 1,
  }
  if (opts.reference_image_base64 || opts.reference_image_base64s?.length) {
    const imageUrls: string[] = []
    if (opts.reference_image_base64) imageUrls.push(opts.reference_image_base64)
    if (opts.reference_image_base64s) imageUrls.push(...opts.reference_image_base64s)
    submitBody.image_urls = imageUrls
  }
  const submitRes = await fetch(`${p.base_url}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.api_key}`,
    },
    body: JSON.stringify(submitBody),
    ...(opts.signal !== undefined && { signal: opts.signal }),
  })
  if (!submitRes.ok) {
    throw new Error(`apimart submit HTTP ${submitRes.status}: ${(await submitRes.text()).slice(0, 200)}`)
  }
  const submitJson = (await submitRes.json()) as { data?: Array<{ task_id?: string }> }
  const taskId = submitJson.data?.[0]?.task_id
  if (!taskId) throw new Error(`apimart submit 未返回 task_id: ${JSON.stringify(submitJson).slice(0, 200)}`)

  // 2. poll
  // Phase 8f BUG #2:provider polling 配置优先,fallback 到顶层常量(60 attempts × 5s = 5min)
  const pollMaxAttempts = p.poll_max_attempts ?? APIMART_MAX_ATTEMPTS
  const pollIntervalMs = (p.poll_interval_seconds ?? 5) * 1000
  const pollInitialDelayMs = (p.poll_initial_delay_seconds ?? 12) * 1000
  await new Promise((r) => setTimeout(r, pollInitialDelayMs))
  let imageUrl: string | null = null
  let cost: number | undefined
  for (let i = 0; i < pollMaxAttempts; i++) {
    const pollRes = await fetch(`${p.base_url}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${p.api_key}` },
      ...(opts.signal !== undefined && { signal: opts.signal }),
    })
    if (!pollRes.ok) {
      throw new Error(`apimart poll HTTP ${pollRes.status}: ${(await pollRes.text()).slice(0, 200)}`)
    }
    const pollJson = (await pollRes.json()) as {
      data?: { status?: string; result?: { images?: Array<{ url?: string[] }> }; cost?: number; error?: string }
    }
    const status = pollJson.data?.status
    if (status === 'completed') {
      const url = pollJson.data?.result?.images?.[0]?.url?.[0]
      if (!url) throw new Error('apimart completed 但 result.images[0].url[0] 缺失')
      imageUrl = url
      cost = pollJson.data?.cost
      break
    }
    if (status === 'failed') {
      throw new Error(`apimart task failed: ${pollJson.data?.error ?? 'unknown'}`)
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
  if (!imageUrl) throw new Error('apimart 轮询超时(>5min)')

  // 3. download(必须带浏览器 UA,否则 S3 403)
  const dlRes = await fetch(imageUrl, {
    headers: { 'User-Agent': BROWSER_UA },
    ...(opts.signal !== undefined && { signal: opts.signal }),
  })
  if (!dlRes.ok) throw new Error(`apimart download HTTP ${dlRes.status}`)
  const arrayBuf = await dlRes.arrayBuffer()
  return { image: Buffer.from(arrayBuf), ...(cost !== undefined && { cost }) }
}

async function callOpenAIImageSync(
  p: ProviderConfig,
  opts: CallImageGenOptions,
): Promise<Buffer> {
  const body: Record<string, unknown> = {
    model: p.model,
    prompt: opts.prompt,
    size: opts.size ?? '1024x1024',
    n: opts.n ?? 1,
    response_format: 'b64_json',
  }
  if (opts.quality) body.quality = opts.quality
  const res = await fetch(`${p.base_url}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.api_key}`,
    },
    body: JSON.stringify(body),
    ...(opts.signal !== undefined && { signal: opts.signal }),
  })
  if (!res.ok) throw new Error(`openai image HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> }
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new Error('openai 响应无 b64_json')
  return Buffer.from(b64, 'base64')
}
