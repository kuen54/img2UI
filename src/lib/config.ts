import {
  paths,
  readJsonIfExists,
  writeJsonAtomic,
  ensureDataRoot,
} from './fs-utils'
import { buildDefaultAppConfig } from './seeds/default-config'
import type { AppConfig, ProviderConfig, ProviderKind } from './types'

let cached: AppConfig | null = null
let initPromise: Promise<AppConfig> | null = null

/**
 * 读 data/config.json。
 * 不存在时:写入 default seed 并返回。
 * 存在时:直接返回。
 * 内部缓存,避免每次请求都读盘。
 */
export async function getConfig(): Promise<AppConfig> {
  if (cached) return cached
  if (initPromise) return initPromise

  initPromise = (async () => {
    await ensureDataRoot()
    const existing = await readJsonIfExists<AppConfig>(paths.config())
    if (existing) {
      cached = existing
      return existing
    }
    const fresh = buildDefaultAppConfig()
    await writeJsonAtomic(paths.config(), fresh)
    cached = fresh
    return fresh
  })()

  try {
    return await initPromise
  } finally {
    initPromise = null
  }
}

/** 保存(覆盖)整个 AppConfig,更新缓存 */
export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  await ensureDataRoot()
  await writeJsonAtomic(paths.config(), config)
  cached = config
  return config
}

/** 测试 / dev HMR 用,清缓存 */
export function resetConfigCache(): void {
  cached = null
  initPromise = null
}

/** 拿当前 active 的 mllm / image_gen / cdn / matting provider */
export async function getActiveProvider(
  kind: ProviderKind,
): Promise<ProviderConfig | undefined> {
  const config = await getConfig()
  return config.providers.find((p) => p.kind === kind && p.active)
}

export async function getProviderById(
  id: string,
): Promise<ProviderConfig | undefined> {
  const config = await getConfig()
  return config.providers.find((p) => p.id === id)
}
