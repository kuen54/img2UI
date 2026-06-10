import type { AppConfig, ProviderConfig } from './types'

/** 遮罩格式:`sk-***xxxx`(前 3 + *** + 后 4) */
export function maskKey(k: string): string {
  if (!k) return ''
  if (k.length <= 8) return '***'
  return `${k.slice(0, 3)}***${k.slice(-4)}`
}

/** 形如 `xxx***xxxx` 的遮罩格式(仅作粗判;判断「用户没改」一律用精确相等) */
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
 * 仅当与磁盘同 id provider 的 maskKey() 输出**精确相等**时视为「前端未改」→ 还原明文。
 * (不能用 `***` 子串启发式:新 provider 复制了别家 masked key 时会把遮罩串存成真 key。)
 * 磁盘上没有的新 provider 若带遮罩格式 key → 置空,逼用户填真 key。
 * 其余情况一律视为用户真改了,直接采用新值。
 */
export function unmaskApiKeys(
  incoming: AppConfig,
  onDisk: AppConfig,
): AppConfig {
  const onDiskById = new Map(onDisk.providers.map((p) => [p.id, p]))
  return {
    ...incoming,
    providers: incoming.providers.map((p) => {
      const original = onDiskById.get(p.id)
      if (original && p.api_key === maskKey(original.api_key)) {
        return { ...p, api_key: original.api_key }
      }
      if (!original && isMasked(p.api_key)) {
        return { ...p, api_key: '' }
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
  if (onDisk && incoming.api_key === maskKey(onDisk.api_key)) {
    return { ...incoming, api_key: onDisk.api_key }
  }
  return incoming
}
