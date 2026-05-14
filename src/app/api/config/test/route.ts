import { NextRequest, NextResponse } from 'next/server'

import { loadConfig } from '@/lib/config'
import { pingMllm, pingImageGen } from '@/lib/llm-client'
import { pingCdn } from '@/lib/cdn-client'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { provider_id?: string } | null
  const providerId = body?.provider_id
  if (!providerId) {
    return NextResponse.json({ ok: false, error: 'provider_id 缺失' }, { status: 400 })
  }

  const config = await loadConfig()
  const provider = config.providers.find((p) => p.id === providerId)
  if (!provider) {
    return NextResponse.json({ ok: false, error: 'provider 不存在' }, { status: 404 })
  }

  // ★ 测试结果只暴露 { ok, error?, latency_ms? },绝对不返回 raw api_key
  // matting kind 暂不支持 ping(没有免费 ping endpoint,koukoutu 每次 1 积分)
  const result =
    provider.kind === 'mllm'
      ? await pingMllm(provider)
      : provider.kind === 'image_gen'
        ? await pingImageGen(provider)
        : provider.kind === 'cdn'
          ? await pingCdn(provider)
          : provider.kind === 'matting'
            ? ({ ok: false as const, error: '抠图 provider 暂不支持连通测试,请到 Asset Review 实测' })
            : ({ ok: false as const, error: `unsupported kind: ${String(provider.kind)}` })

  return NextResponse.json(result)
}
