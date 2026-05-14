'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { AppConfig } from '@/lib/types'

// =============================================================================
// useConfigDraft:fetch + draft state + save 的本地 hook
//
// - mount 时 GET /api/config 拿到 masked AppConfig,setSaved + setDraft
// - dirty = JSON.stringify(draft) !== JSON.stringify(saved)
// - save():PUT /api/config 发 draft,响应作为新的 saved + draft
// - reload():重 fetch
// =============================================================================

export type UseConfigDraft = {
  saved: AppConfig | null
  draft: AppConfig | null
  setDraft: (next: AppConfig) => void
  dirty: boolean
  saving: boolean
  loading: boolean
  save: () => Promise<void>
  reload: () => Promise<void>
}

export function useConfigDraft(): UseConfigDraft {
  const [saved, setSaved] = useState<AppConfig | null>(null)
  const [draft, setDraft] = useState<AppConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/config')
      if (!res.ok) throw new Error(`GET /api/config HTTP ${res.status}`)
      const cfg = (await res.json()) as AppConfig
      setSaved(cfg)
      setDraft(cfg)
    } catch (e) {
      toast.error('加载配置失败:' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 初始 fetch:UI 一进设置页就拉一次,触发首启动 seed
    // (loadConfig() 的 setState 通过 reload 异步触发,在外部 fetch 边界,不是同步 setState in effect)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const save = useCallback(async () => {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) throw new Error(`PUT /api/config HTTP ${res.status}`)
      const updated = (await res.json()) as AppConfig
      setSaved(updated)
      setDraft(updated)
      toast.success('已保存')
    } catch (e) {
      toast.error('保存失败:' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [draft])

  const dirty = saved !== null && draft !== null && JSON.stringify(saved) !== JSON.stringify(draft)

  return { saved, draft, setDraft, dirty, saving, loading, save, reload }
}
