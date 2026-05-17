import { NextRequest } from 'next/server'
import { getConfig, saveConfig } from '@/lib/config'
import { maskConfigForResponse, unmaskApiKeys } from '@/lib/mask'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { nowIso } from '@/lib/id'
import type { AppConfig } from '@/lib/types'

export async function GET(): Promise<Response> {
  try {
    const config = await getConfig()
    return jsonResponse(maskConfigForResponse(config))
  } catch (err) {
    return errorToResponse(err)
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  try {
    const incoming = (await req.json()) as AppConfig
    const onDisk = await getConfig()
    const merged = unmaskApiKeys(incoming, onDisk)

    // bump updated_at on every provider that may have changed
    const now = nowIso()
    const next: AppConfig = {
      ...merged,
      providers: merged.providers.map((p) => ({ ...p, updated_at: now })),
    }
    // 同 kind 至多 1 个 active=true,UI 可能没强制,这里兜底
    const seenActiveKinds = new Set<string>()
    next.providers = next.providers.map((p) => {
      if (p.active && seenActiveKinds.has(p.kind)) {
        return { ...p, active: false }
      }
      if (p.active) seenActiveKinds.add(p.kind)
      return p
    })

    const saved = await saveConfig(next)
    return jsonResponse(maskConfigForResponse(saved))
  } catch (err) {
    return errorToResponse(err)
  }
}
