// Provider 默认 seed —— 跟 SPEC.md § Provider 默认 seed 完全一致
// 改这份要同步改 SPEC.md(参见 AGENTS.md § 8 文档同步规则)

import type { ProviderConfig } from '@/lib/types'
import { newProviderId } from '@/lib/id'

export function defaultProviders(): ProviderConfig[] {
  const now = new Date().toISOString()

  return [
    // === MVP-α 默认推荐(基于 PoC v11 锁定) ===
    {
      id: newProviderId(),
      kind: 'mllm',
      name: 'sankuai Gemini 3.1 Pro (default)',
      api_format: 'sankuai',  // 注意:auth header 不带 Bearer 前缀
      base_url: 'https://aigc.sankuai.com/v1/openai/native',
      api_key: '',  // 用户自填
      model: 'gemini-3.1-pro-preview',
      default_temperature: 1,  // PoC v8-v11 实测最优
      default_max_tokens: 32000,  // gemini thinking_config 占 budget,中文 30 元素 JSON ~6k char,留 buffer 防截断(2026-05-14 dogfood 验证 12k 不够)
      vision_capable: true,
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: newProviderId(),
      kind: 'image_gen',
      name: 'apimart gpt-image-2-official (default)',
      api_format: 'apimart',
      base_url: 'https://api.apimart.ai/v1',
      api_key: '',  // 用户自填
      model: 'gpt-image-2-official',  // ★ 不是 backup `gpt-image-2`(字形漂移)
      endpoint_kind: 'image_generation',
      is_async: true,
      poll_interval_seconds: 5,
      poll_initial_delay_seconds: 12,
      poll_max_attempts: 24,
      default_quality: 'high',  // 必须 high,否则文字大量乱码
      active: true,
      created_at: now,
      updated_at: now,
    },

    // === 备选:OpenAI 直连(用户可在 UI 切换 active) ===
    {
      id: newProviderId(),
      kind: 'mllm',
      name: 'OpenAI GPT-4o (备选,CJK 准确度低)',
      api_format: 'openai',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model: 'gpt-4o',
      vision_capable: true,
      active: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: newProviderId(),
      kind: 'image_gen',
      name: 'OpenAI gpt-image-1 (备选,直连)',
      api_format: 'openai',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model: 'gpt-image-1',
      endpoint_kind: 'image_edit',
      is_async: false,
      default_quality: 'high',
      active: false,
      created_at: now,
      updated_at: now,
    },
  ]
}
