import { NextRequest, NextResponse } from 'next/server'

import { loadConfig, saveConfig, maskConfig, unmaskApiKeys } from '@/lib/config'
import type { AppConfig } from '@/lib/types'

export async function GET() {
  const config = await loadConfig()
  return NextResponse.json(maskConfig(config))
}

export async function PUT(req: NextRequest) {
  const incoming = (await req.json().catch(() => null)) as AppConfig | null
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.providers)) {
    return NextResponse.json({ error: 'invalid AppConfig body' }, { status: 400 })
  }
  const restored = await unmaskApiKeys(incoming)
  await saveConfig(restored)
  return NextResponse.json(maskConfig(restored))
}
