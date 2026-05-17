import { NextRequest } from 'next/server'
import { getProviderById } from '@/lib/config'
import { pingMllm, pingImageGen } from '@/lib/llm-client'
import { pingCdn } from '@/lib/cdn-client'
import { errorToResponse, jsonResponse } from '@/lib/api-response'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as { provider_id: string }
    const provider = await getProviderById(body.provider_id)
    if (!provider) {
      return jsonResponse(
        { ok: false, message: 'provider not found' },
        { status: 404 },
      )
    }
    const start = Date.now()
    try {
      switch (provider.kind) {
        case 'mllm':
          await pingMllm(provider)
          break
        case 'image_gen':
          await pingImageGen(provider)
          break
        case 'cdn':
          await pingCdn(provider)
          break
        case 'matting':
          // koukoutu 没有免费 ping endpoint,sync 调用每次扣 1 积分。
          // Settings UI 提示用户「请到 Asset Review 实测」(HANDOFF §7.7)
          return jsonResponse({
            ok: false,
            message:
              'matting (koukoutu) 不支持 ping;请到 Asset Review 实测「用 API 抠图」',
          })
      }
      return jsonResponse({
        ok: true,
        latency_ms: Date.now() - start,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return jsonResponse({
        ok: false,
        message,
        latency_ms: Date.now() - start,
      })
    }
  } catch (err) {
    return errorToResponse(err)
  }
}
