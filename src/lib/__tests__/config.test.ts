import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { DATA_ROOT } from '../fs-utils'
import { loadConfig, saveConfig, maskKey, isMasked, maskConfig, unmaskApiKeys } from '../config'
import type { AppConfig, ProviderConfig } from '../types'

const CONFIG_PATH = path.join(DATA_ROOT, 'config.json')

afterEach(async () => {
  await fs.rm(CONFIG_PATH, { force: true })
})

describe('config', () => {
  it('loadConfig seeds default on first run', async () => {
    const cfg = await loadConfig()
    expect(cfg.version).toBe('0.1.0')
    expect(cfg.providers.length).toBeGreaterThanOrEqual(2)
    expect(cfg.providers.find((p) => p.kind === 'mllm')).toBeDefined()
    expect(cfg.providers.find((p) => p.kind === 'image_gen')).toBeDefined()
    // sankuai mllm + apimart image_gen 默认 active
    expect(cfg.providers.find((p) => p.api_format === 'sankuai')?.active).toBe(true)
    expect(cfg.providers.find((p) => p.api_format === 'apimart')?.active).toBe(true)
    // 默认 prompts 非空
    expect(cfg.prompts.pass1_layout.length).toBeGreaterThan(100)
    expect(cfg.prompts.pass2_extract).toContain('{{element_summary}}')
    expect(cfg.prompts.pass2_extract).toContain('#00FF00')
  })

  it('loadConfig persists between calls', async () => {
    const cfg1 = await loadConfig()
    const cfg2 = await loadConfig()
    expect(cfg1.providers[0]!.id).toBe(cfg2.providers[0]!.id)
  })

  it('maskKey masks long keys with prefix+suffix', () => {
    const masked = maskKey('sk-abcdef1234567890')
    expect(isMasked(masked)).toBe(true)
    expect(masked).toBe('sk-***7890')
  })

  it('maskKey handles short keys', () => {
    const masked = maskKey('short')
    expect(isMasked(masked)).toBe(true)
    expect(masked).toBe('***rt')
  })

  it('maskKey handles empty string', () => {
    expect(maskKey('')).toBe('')
  })

  it('unmaskApiKeys restores original key when incoming is masked', async () => {
    const cfg = await loadConfig()
    const firstProvider = cfg.providers[0]!
    firstProvider.api_key = 'sk-real-key-12345'
    await saveConfig(cfg)

    const masked = maskConfig(cfg)
    expect(isMasked(masked.providers[0]!.api_key)).toBe(true)

    const restored = await unmaskApiKeys(masked)
    expect(restored.providers[0]!.api_key).toBe('sk-real-key-12345')
  })

  it('unmaskApiKeys takes new value when incoming is not masked', async () => {
    const cfg = await loadConfig()
    cfg.providers[0]!.api_key = 'sk-old'
    await saveConfig(cfg)

    const updated: AppConfig = {
      ...cfg,
      providers: [
        { ...cfg.providers[0]!, api_key: 'sk-new' } satisfies ProviderConfig,
        ...cfg.providers.slice(1),
      ],
    }
    const restored = await unmaskApiKeys(updated)
    expect(restored.providers[0]!.api_key).toBe('sk-new')
  })
})
