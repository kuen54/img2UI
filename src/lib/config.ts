import path from 'node:path'
import os from 'node:os'

import type { AppConfig } from '@/lib/types'
import { DATA_ROOT, readJson, writeJson } from '@/lib/fs-utils'
import { defaultProviders } from '@/lib/seeds/default-providers'
import {
  DEFAULT_PASS1_LAYOUT,
  DEFAULT_PASS2_EXTRACT,
  DEFAULT_PASS2_VALIDATE,
  DEFAULT_CODING_AGENT_INTRO,
} from '@/lib/seeds/default-prompts'
import { maskKey, isMasked } from '@/lib/mask'

// 重新导出,旧调用点不破
export { maskKey, isMasked } from '@/lib/mask'

const CONFIG_PATH = path.join(DATA_ROOT, 'config.json')
const SCHEMA_VERSION = '0.1.0'

function defaultConfig(): AppConfig {
  return {
    version: SCHEMA_VERSION,
    providers: defaultProviders(),
    prompts: {
      pass1_layout: DEFAULT_PASS1_LAYOUT,
      pass2_extract: DEFAULT_PASS2_EXTRACT,
      pass2_validate: DEFAULT_PASS2_VALIDATE,
      coding_agent_intro: DEFAULT_CODING_AGENT_INTRO,
    },
    settings: {
      auto_run_pass1_on_upload: true,
      auto_run_validation_after_pass2: true,
      default_export_dir: path.join(os.homedir(), 'img2ui-out'),
    },
  }
}

export async function loadConfig(): Promise<AppConfig> {
  const existing = await readJson<AppConfig>(CONFIG_PATH)
  if (existing) return existing
  // 首启动 seed
  const seed = defaultConfig()
  await writeJson(CONFIG_PATH, seed)
  return seed
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeJson(CONFIG_PATH, config)
}

// =============================================================================
// API key 双向 mask(直接复用 evalyst 模式)
// 纯字符串变换在 @/lib/mask;这里只放需要 fs 的「从磁盘还原」逻辑
// =============================================================================

// GET /api/config 用:把所有 api_key 替换成 mask
export function maskConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    providers: config.providers.map((p) => ({
      ...p,
      api_key: maskKey(p.api_key),
    })),
  }
}

// PUT /api/config 用:遮罩字符串视为「未改动」,从磁盘读原值还原
export async function unmaskApiKeys(incoming: AppConfig): Promise<AppConfig> {
  const onDisk = await readJson<AppConfig>(CONFIG_PATH)
  return {
    ...incoming,
    providers: incoming.providers.map((p) => {
      if (!isMasked(p.api_key)) return p  // 用户改过,采纳新值
      const original = onDisk?.providers.find((op) => op.id === p.id)
      return { ...p, api_key: original?.api_key ?? '' }
    }),
  }
}
