import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { callMatting } from '@/lib/matting-client'
import type { ProviderConfig } from '@/lib/types'

const provider: ProviderConfig = {
  id: 'prv_kk',
  kind: 'matting',
  name: 'koukoutu',
  api_format: 'koukoutu',
  base_url: 'https://sync.koukoutu.com/v1',
  api_key: 'test-key',
  model: 'background-removal',
  active: true,
  created_at: '2026-05-15T00:00:00Z',
  updated_at: '2026-05-15T00:00:00Z',
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('callMatting · koukoutu', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('成功路径:200 + octet-stream → 返回 PNG buffer', async () => {
    const respBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    fetchMock.mockResolvedValueOnce(
      new Response(respBytes, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    )
    const out = await callMatting(provider, { png: PNG_BYTES })
    expect(out).toBeInstanceOf(Buffer)
    expect(Array.from(out)).toEqual(Array.from(respBytes))

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://sync.koukoutu.com/v1/create')
    expect((init as RequestInit).method).toBe('POST')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('test-key')
    expect((init as RequestInit).body).toBeInstanceOf(FormData)
  })

  it('错误路径:200 + JSON { code, message } → 抛 message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 405, message: 'The image address is invalid.' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    )
    await expect(callMatting(provider, { png: PNG_BYTES })).rejects.toThrow(
      /The image address is invalid/,
    )
  })

  it('HTTP 5xx → 抛 HTTP code + body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('upstream timeout', { status: 504 }),
    )
    await expect(callMatting(provider, { png: PNG_BYTES })).rejects.toThrow(
      /HTTP 504.*upstream timeout/,
    )
  })

  it('api_key 未填 → 直接抛,不发请求', async () => {
    const noKey = { ...provider, api_key: '' }
    await expect(callMatting(noKey, { png: PNG_BYTES })).rejects.toThrow(/api_key 未填/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('kind 不是 matting → 直接抛', async () => {
    const wrongKind = { ...provider, kind: 'mllm' as const }
    await expect(callMatting(wrongKind, { png: PNG_BYTES })).rejects.toThrow(
      /kind 不是 matting/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('未知 api_format → 抛', async () => {
    const wrongFmt = { ...provider, api_format: 'openai' as const }
    await expect(callMatting(wrongFmt, { png: PNG_BYTES })).rejects.toThrow(
      /matting 不支持 api_format: openai/,
    )
  })

  it('使用默认 model_key=background-removal(model 字段未填时)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )
    const noModel = (() => {
      const { model: _ignored, ...rest } = provider
      void _ignored
      return rest as ProviderConfig
    })()
    await callMatting(noModel, { png: PNG_BYTES })
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    const form = init.body as FormData
    expect(form.get('model_key')).toBe('background-removal')
  })

  it('user 提供 signal abort → 抛 AbortError', async () => {
    const ctrl = new AbortController()
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          ;(init as RequestInit).signal?.addEventListener('abort', () => {
            const e = new Error('aborted')
            e.name = 'AbortError'
            reject(e)
          })
        }),
    )
    const promise = callMatting(provider, { png: PNG_BYTES, signal: ctrl.signal })
    ctrl.abort()
    await expect(promise).rejects.toThrow(/abort/i)
  })
})
