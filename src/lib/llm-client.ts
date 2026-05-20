// HANDOFF §7 — provider 调用封装。
// callMllm:openai / anthropic / sankuai 三种 api_format
// callImageGen:openai (sync) / apimart (async with task polling)

import type { ProviderConfig } from './types'
import { fetchWithRetry, HttpError, sleep } from './http'

const DOWNLOAD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0'

// ─── callMllm ───────────────────────────────────────────────────────────────

export type MllmMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | {
          type: 'image_url'
          image_url: { url: string; detail?: 'auto' | 'low' | 'high' }
        }
    >

export interface MllmMessage {
  role: 'system' | 'user' | 'assistant'
  content: MllmMessageContent
}

export interface MllmCallOpts {
  messages: MllmMessage[]
  max_tokens?: number
  temperature?: number
  response_format?: { type: 'json_object' | 'text' }
  /** provider 特有透传(如 gemini 的 google.thinking_config) */
  extra_body?: Record<string, unknown>
  signal?: AbortSignal
}

export interface MllmCallResult {
  content: string
  usage: Record<string, unknown>
}

const MLLM_TIMEOUT_MS = 120_000

export async function callMllm(
  provider: ProviderConfig,
  opts: MllmCallOpts,
): Promise<MllmCallResult> {
  if (!provider.api_key) {
    throw new HttpError(401, 'provider.api_key is empty', false)
  }

  switch (provider.api_format) {
    case 'openai':
      return callOpenAiCompat(provider, opts, /* withBearer */ true)
    case 'sankuai':
      // sankuai gateway 用 raw token 不带 Bearer 前缀
      return callOpenAiCompat(provider, opts, /* withBearer */ false)
    case 'anthropic':
      return callAnthropic(provider, opts)
    default:
      throw new HttpError(
        400,
        `mllm api_format unsupported: ${provider.api_format}`,
        false,
      )
  }
}

async function callOpenAiCompat(
  provider: ProviderConfig,
  opts: MllmCallOpts,
  withBearer: boolean,
): Promise<MllmCallResult> {
  const url = `${trimSlash(provider.base_url)}/chat/completions`
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: opts.messages,
  }
  if (opts.max_tokens != null) body['max_tokens'] = opts.max_tokens
  if (opts.temperature != null) body['temperature'] = opts.temperature
  if (opts.response_format) body['response_format'] = opts.response_format
  if (opts.extra_body) Object.assign(body, opts.extra_body)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: withBearer ? `Bearer ${provider.api_key}` : provider.api_key,
  }

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    timeoutMs: MLLM_TIMEOUT_MS,
    ...(opts.signal ? { externalSignal: opts.signal } : {}),
  })
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: Record<string, unknown>
  }
  const content = json.choices?.[0]?.message?.content ?? ''
  return { content, usage: json.usage ?? {} }
}

async function callAnthropic(
  provider: ProviderConfig,
  opts: MllmCallOpts,
): Promise<MllmCallResult> {
  const url = `${trimSlash(provider.base_url)}/messages`
  // Anthropic 把 system 作为 top-level field,user/assistant 在 messages 数组里
  const systemMessages = opts.messages.filter((m) => m.role === 'system')
  const otherMessages = opts.messages.filter((m) => m.role !== 'system')
  const system = systemMessages.map((m) =>
    typeof m.content === 'string'
      ? m.content
      : m.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n'),
  )

  const body: Record<string, unknown> = {
    model: provider.model,
    messages: otherMessages,
    max_tokens: opts.max_tokens ?? 4096,
  }
  if (system.length > 0) body['system'] = system.join('\n')
  if (opts.temperature != null) body['temperature'] = opts.temperature
  if (opts.extra_body) Object.assign(body, opts.extra_body)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': provider.api_key,
    'anthropic-version': '2023-06-01',
  }

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    timeoutMs: MLLM_TIMEOUT_MS,
    ...(opts.signal ? { externalSignal: opts.signal } : {}),
  })
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>
    usage?: Record<string, unknown>
  }
  const content = (json.content ?? [])
    .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
    .join('')
  return { content, usage: json.usage ?? {} }
}

// ─── callImageGen ──────────────────────────────────────────────────────────

export interface ImageGenCallOpts {
  prompt: string
  /** 主图,data URL `data:image/png;base64,...` 或 https URL */
  reference_image_base64?: string
  /** 额外参考图(crops),内部拼成 image_urls = [main, ...refs] */
  reference_image_base64s?: string[]
  size?: string
  resolution?: string
  quality?: 'low' | 'medium' | 'high'
  n?: number
  signal?: AbortSignal
}

export interface ImageGenResult {
  /** 生成的图片二进制 */
  image: Buffer
  cost?: number
  latency_ms: number
}

export async function callImageGen(
  provider: ProviderConfig,
  opts: ImageGenCallOpts,
): Promise<ImageGenResult> {
  if (!provider.api_key) {
    throw new HttpError(401, 'provider.api_key is empty', false)
  }

  const start = Date.now()
  if (provider.api_format === 'apimart' || provider.is_async) {
    return callApimartAsync(provider, opts, start)
  }
  if (provider.api_format === 'openai') {
    return callOpenAiImageSync(provider, opts, start)
  }
  throw new HttpError(
    400,
    `image_gen api_format unsupported: ${provider.api_format}`,
    false,
  )
}

const IMAGE_GEN_TIMEOUT_MS = 600_000

async function callOpenAiImageSync(
  provider: ProviderConfig,
  opts: ImageGenCallOpts,
  startMs: number,
): Promise<ImageGenResult> {
  const endpoint = provider.endpoint_kind === 'image_edit' ? 'edits' : 'generations'
  const url = `${trimSlash(provider.base_url)}/images/${endpoint}`
  const imageUrls = collectImageUrls(opts)

  const body: Record<string, unknown> = {
    model: provider.model,
    prompt: opts.prompt,
    n: opts.n ?? 1,
  }
  if (imageUrls.length > 0) body['image_urls'] = imageUrls
  if (opts.size) body['size'] = opts.size
  if (opts.quality ?? provider.default_quality) {
    body['quality'] = opts.quality ?? provider.default_quality
  }

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify(body),
    timeoutMs: IMAGE_GEN_TIMEOUT_MS,
    ...(opts.signal ? { externalSignal: opts.signal } : {}),
  })
  const json = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>
  }
  const first = json.data?.[0]
  if (!first) throw new HttpError(500, 'no image in response', false)

  let image: Buffer
  if (first.b64_json) {
    image = Buffer.from(first.b64_json, 'base64')
  } else if (first.url) {
    image = await downloadBuffer(first.url, opts.signal)
  } else {
    throw new HttpError(500, 'image response has neither b64_json nor url', false)
  }
  return { image, latency_ms: Date.now() - startMs }
}

async function callApimartAsync(
  provider: ProviderConfig,
  opts: ImageGenCallOpts,
  startMs: number,
): Promise<ImageGenResult> {
  const submitUrl = `${trimSlash(provider.base_url)}/images/generations`
  const imageUrls = collectImageUrls(opts)

  const submitBody: Record<string, unknown> = {
    model: provider.model,
    prompt: opts.prompt,
    n: opts.n ?? 1,
    size: opts.size ?? '1:1',
    resolution: opts.resolution ?? '1k',
    quality: opts.quality ?? provider.default_quality ?? 'high',
  }
  if (imageUrls.length > 0) submitBody['image_urls'] = imageUrls

  const submitRes = await fetchWithRetry(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify(submitBody),
    // Pass 2 subject 路 19+ 个参考图时 body 可能 ~4MB,30s 上传不够。
    // 实测 19 张 ref 在普通带宽下 30s × 3 retry 全部超时(89s 左右挂)。
    timeoutMs: 180_000,
    ...(opts.signal ? { externalSignal: opts.signal } : {}),
  })
  const submitJson = (await submitRes.json()) as {
    code?: number
    data?: Array<{ status?: string; task_id?: string }>
    msg?: string
  }
  const taskId = submitJson.data?.[0]?.task_id
  if (!taskId) {
    throw new HttpError(
      500,
      `apimart submit no task_id: ${JSON.stringify(submitJson).slice(0, 200)}`,
      false,
    )
  }

  // poll
  const initialDelay = (provider.poll_initial_delay_seconds ?? 12) * 1000
  const interval = (provider.poll_interval_seconds ?? 5) * 1000
  const maxAttempts = provider.poll_max_attempts ?? 60

  await sleep(initialDelay)
  const taskUrl = `${trimSlash(provider.base_url)}/tasks/${taskId}`

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (opts.signal?.aborted) throw new Error('aborted')
    const res = await fetchWithRetry(taskUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${provider.api_key}` },
      timeoutMs: 30_000,
      ...(opts.signal ? { externalSignal: opts.signal } : {}),
    })
    const json = (await res.json()) as {
      code?: number
      data?: {
        status?: 'pending' | 'completed' | 'failed' | 'submitted'
        result?: { images?: Array<{ url?: string[] }> }
        cost?: number
        actual_time?: number
        error?: string
      }
    }
    const status = json.data?.status
    if (status === 'completed') {
      const url = json.data?.result?.images?.[0]?.url?.[0]
      if (!url) {
        throw new HttpError(500, 'apimart completed but no url', false)
      }
      const image = await downloadBuffer(url, opts.signal)
      return {
        image,
        ...(typeof json.data?.cost === 'number' ? { cost: json.data.cost } : {}),
        latency_ms: Date.now() - startMs,
      }
    }
    if (status === 'failed') {
      throw new HttpError(
        500,
        `apimart task failed: ${json.data?.error ?? 'unknown'}`,
        false,
      )
    }
    await sleep(interval)
  }
  throw new HttpError(
    504,
    `apimart task ${taskId} timed out after ${maxAttempts} attempts`,
    true,
  )
}

async function downloadBuffer(
  url: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: { 'User-Agent': DOWNLOAD_UA }, // 默认 curl/python UA 会 403
    timeoutMs: 60_000,
    ...(signal ? { externalSignal: signal } : {}),
  })
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

function collectImageUrls(opts: ImageGenCallOpts): string[] {
  const urls: string[] = []
  if (opts.reference_image_base64) urls.push(opts.reference_image_base64)
  if (opts.reference_image_base64s)
    urls.push(...opts.reference_image_base64s)
  return urls
}

function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s
}

// ─── ping helpers (for /api/config/test) ───────────────────────────────────

export async function pingMllm(provider: ProviderConfig): Promise<void> {
  // 5-token ping
  await callMllm(provider, {
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 5,
    temperature: 0,
  })
}

export async function pingImageGen(provider: ProviderConfig): Promise<void> {
  // 单像素 generation。apimart async 实测要等 ~2 分钟,所以 ping 走 sync 直连或 stub。
  // MVP:仅 sync openai 走真生成;apimart sync ping 太贵太慢,只校验 submit 200。
  if (provider.api_format === 'apimart') {
    // submit 一个最小尺寸 task,看 submit response code 即可。不真等结果。
    const url = `${trimSlash(provider.base_url)}/images/generations`
    const body = {
      model: provider.model,
      prompt: 'tiny test',
      size: '1:1',
      resolution: '1k',
      quality: 'low',
      n: 1,
    }
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify(body),
      timeoutMs: 30_000,
      maxRetries: 0, // ping 不重试,快失败
    })
    const json = (await res.json()) as { code?: number; data?: unknown[] }
    if (!json.data) {
      throw new HttpError(500, 'apimart submit returned no data', false)
    }
    return
  }
  // openai sync: 真生成 1×1
  await callImageGen(provider, {
    prompt: 'a single white pixel',
    size: '1:1',
    quality: 'low',
    n: 1,
  })
}
