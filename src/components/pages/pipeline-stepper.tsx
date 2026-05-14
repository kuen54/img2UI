'use client'

import { Check, Loader2, Circle } from 'lucide-react'

import type { Asset, Element, State } from '@/lib/types'
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
  elements?: Element[]
  assets?: Asset[]
}

function inferStep1Status(states: State[]): StepStatus {
  if (states.length === 0) return 'idle'
  if (states.some((s) => s.pipeline_status === 'pass1_running')) return 'running'
  if (states.some((s) => s.pipeline_status === 'pass1_failed')) return 'failed'
  if (states.every((s) => ['pass1_done', 'pass2_running', 'pass2_done', 'validating', 'validated'].includes(s.pipeline_status))) {
    return 'done'
  }
  return 'idle'
}

function inferStep3Status(states: State[]): StepStatus {
  if (states.length === 0) return 'idle'
  if (states.some((s) => s.pipeline_status === 'pass2_running')) return 'running'
  if (states.some((s) => s.pipeline_status === 'pass2_failed')) return 'failed'
  if (states.some((s) => ['pass2_done', 'validating', 'validated'].includes(s.pipeline_status))) {
    return 'done'
  }
  return 'idle'
}

function inferCdnStatus(elements: Element[], assets: Asset[]): StepStatus {
  const staticEls = elements.filter((e) => e.type === 'static')
  if (staticEls.length === 0) {
    // 没 static element → 无 asset 可传,直接 done
    return assets.length === 0 ? 'idle' : 'done'
  }
  if (assets.length === 0) return 'idle'
  const uploaded = assets.filter((a) => a.status === 'uploaded')
  if (assets.some((a) => a.status === 'failed')) return 'failed'
  if (uploaded.length === 0) return 'idle'
  if (uploaded.length === assets.length) return 'done'
  return 'running'
}

export function PipelineStepper({ states, elements = [], assets = [] }: PipelineStepperProps) {
  const step1 = inferStep1Status(states)
  // step 2(元素 Review)用 element.reviewed 启发式
  const reviewedAll = elements.length > 0 && elements.every((e) => e.reviewed)
  const step2: StepStatus = elements.length === 0 ? 'idle' : reviewedAll ? 'done' : 'idle'
  const step3 = inferStep3Status(states)
  // step 4(资产 Review)启发式:assets 全部 status !== 'extracted'(进入 validated/uploaded)→ done
  const step4: StepStatus =
    assets.length === 0
      ? 'idle'
      : assets.every((a) => a.status === 'validated' || a.status === 'uploaded')
        ? 'done'
        : assets.some((a) => a.status === 'failed')
          ? 'failed'
          : 'idle'
  const step5 = inferCdnStatus(elements, assets)
  // step 6(Export)无持久化 run,默认 idle
  const step6: StepStatus = 'idle'
  const statuses: StepStatus[] = [step1, step2, step3, step4, step5, step6]

  return (
    <div className="flex items-stretch gap-1">
      {STEPS.map((step, idx) => {
        const status = statuses[idx] ?? 'idle'
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
