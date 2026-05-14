'use client'

import { Check, Loader2, Circle } from 'lucide-react'

import type { State } from '@/lib/types'
import { cn } from '@/lib/utils'

export type StepStatus = 'idle' | 'running' | 'done' | 'failed'

const STEPS = [
  { key: 'pass1', label: '布局分析' },
  { key: 'review_elements', label: '元素 Review' },
  { key: 'pass2', label: '资产提取' },
  { key: 'review_assets', label: '资产 Review' },
  { key: 'cdn', label: 'CDN 上传' },
  { key: 'export', label: 'Export' },
] as const

export type PipelineStepperProps = {
  states: State[]
}

// Phase 3 只推断 step 1(布局分析);其他步全是 idle,Phase 4+ 接业务
function inferStep1Status(states: State[]): StepStatus {
  if (states.length === 0) return 'idle'
  if (states.some((s) => s.pipeline_status === 'pass1_running')) return 'running'
  if (states.some((s) => s.pipeline_status === 'pass1_failed')) return 'failed'
  if (states.every((s) => ['pass1_done', 'pass2_running', 'pass2_done', 'validating', 'validated'].includes(s.pipeline_status))) {
    return 'done'
  }
  return 'idle'
}

export function PipelineStepper({ states }: PipelineStepperProps) {
  const step1 = inferStep1Status(states)

  return (
    <div className="flex items-stretch gap-1">
      {STEPS.map((step, idx) => {
        const status = idx === 0 ? step1 : 'idle'
        return (
          <div
            key={step.key}
            className={cn(
              'flex-1 border rounded-md px-3 py-2 flex items-center gap-2 text-sm',
              status === 'done' && 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-100',
              status === 'running' && 'bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-100',
              status === 'failed' && 'bg-red-50 border-red-300 text-red-900 dark:bg-red-950/30 dark:border-red-800 dark:text-red-100',
              status === 'idle' && 'text-muted-foreground',
            )}
          >
            <StepIcon status={status} />
            <span className="text-xs">
              <span className="text-muted-foreground mr-1">{idx + 1}.</span>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'done':
      return <Check className="size-4 shrink-0" />
    case 'running':
      return <Loader2 className="size-4 shrink-0 animate-spin" />
    case 'failed':
      return <Circle className="size-4 shrink-0 fill-red-500 text-red-500" />
    default:
      return <Circle className="size-4 shrink-0 stroke-1" />
  }
}
