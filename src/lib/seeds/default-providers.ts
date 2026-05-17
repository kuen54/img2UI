// HANDOFF §12 — 首启动 seed。已有 config 的用户不会被覆写(by config.ts)。

import type { ProviderConfig } from '../types'
import { newProviderId, nowIso } from '../id'

/** 5 个开箱即用的 provider 模板;api_key 留空,用户需 Settings 填后才能用 */
export function buildDefaultProviders(): ProviderConfig[] {
  const now = nowIso()

  return [
    // ─── MLLM ─────────────────────────────────────────────
    {
      id: newProviderId(),
      kind: 'mllm',
      name: 'sankuai Gemini 3.1 Pro (default)',
      api_format: 'sankuai', // 注意:sankuai gateway auth header 不带 Bearer 前缀
      base_url: 'https://aigc.sankuai.com/v1/openai/native',
      api_key: '',
      model: 'gemini-3.1-pro-preview',
      default_temperature: 1, // PoC v8-v11 实测最优
      default_max_tokens: 32000, // gemini thinking 占 budget,中文 30 元素 JSON 6k char,留 buffer
      vision_capable: true,
      active: true,
      created_at: now,
      updated_at: now,
    },
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

    // ─── Image Gen ────────────────────────────────────────
    {
      id: newProviderId(),
      kind: 'image_gen',
      name: 'apimart gpt-image-2-official (default)',
      api_format: 'apimart',
      base_url: 'https://api.apimart.ai/v1',
      api_key: '',
      model: 'gpt-image-2-official', // ★ 不是 backup gpt-image-2,backup 字形漂移
      endpoint_kind: 'image_generation',
      is_async: true,
      poll_interval_seconds: 5,
      poll_initial_delay_seconds: 12,
      poll_max_attempts: 60, // 5 分钟兜底,实测多路并发拥挤
      default_quality: 'high', // 必须 high,否则文字大量乱码
      active: true,
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

    // ─── Matting fallback (默认不在自动路径,§7.7) ─────────
    {
      id: newProviderId(),
      kind: 'matting',
      name: 'koukoutu (sync)',
      api_format: 'koukoutu',
      base_url: 'https://sync.koukoutu.com/v1',
      api_key: '',
      model: 'background-removal',
      active: true,
      created_at: now,
      updated_at: now,
    },

    // ─── CDN(可选,Export 时上传) ─────────────────────────
    {
      id: newProviderId(),
      kind: 'cdn',
      name: 'Self-hosted S3 (default)',
      api_format: 's3',
      base_url: '', // S3 endpoint URL,如 https://s3.amazonaws.com 或自建 minio
      api_key: '', // = AWS Secret Access Key
      access_key_id: '', // = AWS Access Key ID
      bucket: '',
      region: 'us-east-1',
      public_url_prefix: '', // e.g. https://cdn.example.com/img2ui/
      active: true,
      created_at: now,
      updated_at: now,
    },
  ]
}
