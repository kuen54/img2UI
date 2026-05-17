import type { AppConfig, ProviderConfig } from './types'

/** 遮罩格式:`sk-***xxxx`(前 3 + *** + 后 4) */
export function maskKey(k: string): string {
  if (!k) return ''
  if (k.length <= 8) return '***'
  return `${k.slice(0, 3)}***${k.slice(-4)}`
}

/** 形如 `xxx***xxxx` 视为已遮罩(用户没改) */
export function isMasked(s: string): boolean {
  return /\*\*\*/.test(s)
}

/** GET /api/config 时返回前对所有 provider.api_key 跑一遍 */
export function maskConfigForResponse(config: AppConfig): AppConfig {
  return {
    ...config,
    providers: config.providers.map((p) => ({
      ...p,
      api_key: maskKey(p.api_key),
    })),
  }
}

/**
 * PUT /api/config 时,对每个 provider 检查 api_key:
 * 若仍是遮罩格式(说明前端未改)→ 从磁盘读原值还原。
 * 否则视为用户真改了,直接采用新值。
 */
export function unmaskApiKeys(
  incoming: AppConfig,
  onDisk: AppConfig,
): AppConfig {
  const onDiskById = new Map(onDisk.providers.map((p) => [p.id, p]))
  return {
    ...incoming,
    providers: incoming.providers.map((p) => {
      if (isMasked(p.api_key)) {
        const original = onDiskById.get(p.id)
        if (original) {
          return { ...p, api_key: original.api_key }
        }
      }
      return p
    }),
  }
}

/** 用于 provider-level 单字段(test endpoint 中 用) */
export function unmaskProviderApiKey(
  incoming: ProviderConfig,
  onDisk: ProviderConfig | undefined,
): ProviderConfig {
  if (isMasked(incoming.api_key) && onDisk) {
    return { ...incoming, api_key: onDisk.api_key }
  }
  return incoming
}
