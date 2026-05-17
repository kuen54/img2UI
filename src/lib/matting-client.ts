// HANDOFF §7.7:抠图 fallback,默认不在自动 pipeline 路径。
// 仅 Asset Review 用户主动点「用 API 抠图」时,/api/states/[id]/re-key-via-api 路由调用。

import type { ProviderConfig } from './types'
import { HttpError } from './http'

const MATTING_TIMEOUT_MS = 60_000

export interface CallMattingOpts {
  png: Buffer
  signal?: AbortSignal
}

/** 透明 PNG bytes;失败抛错 */
export async function callMatting(
  provider: ProviderConfig,
  opts: CallMattingOpts,
): Promise<Buffer> {
  if (provider.kind !== 'matting') {
    throw new Error(`provider kind 不是 matting: ${provider.kind}`)
  }
  if (!provider.api_key) throw new HttpError(401, 'api_key empty', false)

  switch (provider.api_format) {
    case 'koukoutu':
      return callKoukoutuSync(provider, opts)
    default:
      throw new Error(`matting api_format 不支持: ${provider.api_format}`)
  }
}

/**
 * koukoutu sync (`${base_url}/create`):
 * - 默认 base_url 含 /v1 后缀(sync.koukoutu.com/v1),所以 endpoint 拼成 `/create`
 * - multipart/form-data,字段:image_file (binary), model_key (str), output_format (str)
 * - 成功:Content-Type: application/octet-stream,body 是透明 PNG bytes
 * - 失败:Content-Type: application/json,body { code, message }
 * - 60s timeout(单图通常 5-15s)
 */
async function callKoukoutuSync(
  p: ProviderConfig,
  opts: CallMattingOpts,
): Promise<Buffer> {
  const form = new FormData()
  form.append('model_key', p.model && p.model !== 'default' ? p.model : 'background-removal')
  form.append('output_format', 'png')
  form.append(
    'image_file',
    new Blob([new Uint8Array(opts.png)], { type: 'image/png' }),
    'input.png',
  )

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('matting timeout')), MATTING_TIMEOUT_MS)
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal?.reason), {
      once: true,
    })
  }

  try {
    const url = `${trimSlash(p.base_url)}/create`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-Key': p.api_key },
      body: form,
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`koukoutu HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    // 200 但 Content-Type 是 JSON → 错误体
    const ct = res.headers.get('content-type') ?? ''
    if (ct.toLowerCase().includes('application/json')) {
      const j = (await res.json().catch(() => null)) as
        | { code?: number; message?: string }
        | null
      throw new Error(`koukoutu 错误:${j?.message ?? JSON.stringify(j)}`)
    }
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  } finally {
    clearTimeout(timer)
  }
}

function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s
}
