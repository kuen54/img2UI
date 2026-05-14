'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// =============================================================================
// TestConnectionButton:点击 → POST /api/config/test → 显示 Badge ok/fail
//
// 注意:测试的是磁盘上 saved 版本的 provider,不是 draft。
// 如果有未保存改动,UI 应在父组件提示「请先保存」(本组件只负责发请求)
// =============================================================================

export type TestConnectionButtonProps = {
  providerId: string
  /** 父组件 dirty 时建议禁用,提示先保存 */
  disabled?: boolean
}

type Result =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; latency_ms: number }
  | { state: 'fail'; error: string }

export function TestConnectionButton({ providerId, disabled }: TestConnectionButtonProps) {
  const [result, setResult] = useState<Result>({ state: 'idle' })

  const run = async () => {
    setResult({ state: 'testing' })
    try {
      const res = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId }),
      })
      const json = (await res.json()) as
        | { ok: true; latency_ms: number }
        | { ok: false; error: string }
      if (json.ok) setResult({ state: 'ok', latency_ms: json.latency_ms })
      else setResult({ state: 'fail', error: json.error })
    } catch (e) {
      setResult({ state: 'fail', error: (e as Error).message })
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void run()}
        disabled={disabled || result.state === 'testing'}
      >
        {result.state === 'testing' ? (
          <>
            <Loader2 className="size-3 animate-spin mr-1" /> 测试中…
          </>
        ) : (
          'Test Connection 测试连通'
        )}
      </Button>
      {result.state === 'ok' && (
        <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3" /> {result.latency_ms} ms
        </Badge>
      )}
      {result.state === 'fail' && (
        <Badge variant="secondary" className="gap-1 text-red-700 dark:text-red-400 max-w-md">
          <XCircle className="size-3 shrink-0" />
          <span className="truncate" title={result.error}>{result.error.slice(0, 80)}</span>
        </Badge>
      )}
    </div>
  )
}
