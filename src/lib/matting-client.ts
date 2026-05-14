// Matting client:抠图 API 调用统一封装
// 默认 pipeline 走绿幕 + chroma key(alpha-key.ts),这里仅作为 Asset Review 手动 fallback
// 见 CLAUDE.md § 7

import type { ProviderConfig } from '@/lib/types'

const MATTING_TIMEOUT_MS = 60_000  // koukoutu sync 单图实测 ~3-10s,1min 兜底

export type CallMattingOptions = {
  png: Buffer            // 输入 PNG(可以是绿幕的 pass2 raw,也可以是任何 PNG)
  signal?: AbortSignal
}

// 返回透明背景的 RGBA PNG bytes
export async function callMatting(
  provider: ProviderConfig,
  opts: CallMattingOptions,
): Promise<Buffer> {
  if (provider.kind !== 'matting') {
    throw new Error(`provider kind 不是 matting: ${provider.kind}`)
  }
  if (!provider.api_key) throw new Error('api_key 未填')

  switch (provider.api_format) {
    case 'koukoutu':
      return callKoukoutuSync(provider, opts)
    default:
      throw new Error(`matting 不支持 api_format: ${provider.api_format}`)
  }
}

// =============================================================================
// koukoutu sync /v1/create:multipart 上传 image_file → 直接返回 PNG bytes
// 实测响应 Content-Type: application/octet-stream(成功),application/json(错误)
// =============================================================================

async function callKoukoutuSync(p: ProviderConfig, opts: CallMattingOptions): Promise<Buffer> {
  const form = new FormData()
  form.append('model_key', p.model ?? 'background-removal')
  form.append('output_format', 'png')
  form.append(
    'image_file',
    new Blob([new Uint8Array(opts.png)], { type: 'image/png' }),
    'input.png',
  )

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), MATTING_TIMEOUT_MS)
  try {
    if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort())
    const res = await fetch(`${p.base_url}/create`, {
      method: 'POST',
      headers: { 'X-API-Key': p.api_key },
      body: form,
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`koukoutu HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    // 错误响应:200 但 content-type 是 application/json,body 含 { code, message }
    const ct = res.headers.get('content-type') ?? ''
    if (ct.toLowerCase().includes('application/json')) {
      const j = (await res.json().catch(() => null)) as
        | { code?: number; message?: string }
        | null
      throw new Error(`koukoutu 错误:${j?.message ?? JSON.stringify(j)}`)
    }
    const arrayBuf = await res.arrayBuffer()
    return Buffer.from(arrayBuf)
  } finally {
    clearTimeout(timer)
  }
}
