// CDN provider 测试连通性:S3 HeadBucket
// 凭据约定:`api_key` 字段存 `ACCESS_KEY_ID:SECRET_ACCESS_KEY`(冒号分隔)
// 这样 mask/unmask 复用同一套字符串变换,不为 cdn 引入特殊路径

import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'

import type { ProviderConfig } from '@/lib/types'
import type { PingResult } from '@/lib/llm-client'

export async function pingCdn(provider: ProviderConfig): Promise<PingResult> {
  if (provider.kind !== 'cdn') {
    return { ok: false, error: `provider kind 不是 cdn: ${provider.kind}` }
  }
  if (!provider.bucket) return { ok: false, error: 'bucket 未填' }
  if (!provider.region) return { ok: false, error: 'region 未填' }
  if (!provider.api_key) return { ok: false, error: 'api_key(凭据)未填' }

  let creds: { id: string; secret: string }
  try {
    creds = parseAccessKey(provider.api_key)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const t0 = Date.now()
  try {
    const client = new S3Client({
      region: provider.region,
      // 自定义 endpoint(MinIO / 七牛兼容 S3 等);exactOptionalPropertyTypes 下不能传 undefined
      ...(provider.base_url ? { endpoint: provider.base_url } : {}),
      credentials: {
        accessKeyId: creds.id,
        secretAccessKey: creds.secret,
      },
      forcePathStyle: !!provider.base_url,
    })
    await client.send(new HeadBucketCommand({ Bucket: provider.bucket }))
    return { ok: true, latency_ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function parseAccessKey(raw: string): { id: string; secret: string } {
  const idx = raw.indexOf(':')
  if (idx < 0) {
    throw new Error('CDN 凭据格式错:应为 "ACCESS_KEY_ID:SECRET_ACCESS_KEY"')
  }
  return { id: raw.slice(0, idx), secret: raw.slice(idx + 1) }
}
