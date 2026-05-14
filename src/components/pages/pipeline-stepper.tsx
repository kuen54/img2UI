'use client'

import Link from 'next/link'
import { Check, Loader2, Circle } from 'lucide-react'

import type { Asset, Element, State } from '@/lib/types'
import { cn } from '@/lib/utils'

export type StepStatus = 'idle' | 'running' | 'done' | 'failed'
type HintTone = 'info' | 'running' | 'success' | 'failed'

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
  /** 用于生成 step 跳转 link */
  projectId?: string
  pageId?: string
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
    return assets.length === 0 ? 'idle' : 'done'
  }
  if (assets.length === 0) return 'idle'
  const uploaded = assets.filter((a) => a.status === 'uploaded')
  if (assets.some((a) => a.status === 'failed')) return 'failed'
  if (uploaded.length === 0) return 'idle'
  if (uploaded.length === assets.length) return 'done'
  return 'running'
}

/**
 * 根据 6 step 的状态推断「当前最该看的一行 hint」+ tone
 * 优先级:failed > running > 紧邻已完成步骤后的 idle(下一步引导)
 */
function inferActiveHint(
  states: State[],
  elements: Element[],
  assets: Asset[],
  statuses: StepStatus[],
): { text: string; tone: HintTone } | null {
  // 0 张设计稿 — 让上方 empty state 自己说话
  if (states.length === 0) return null

  const [step1, step2, step3, step4, step5] = statuses

  // failed 优先(任何一步失败都顶上来)
  if (step1 === 'failed') return { text: '布局分析失败 — 在下方卡片上点「重试」', tone: 'failed' }
  if (step3 === 'failed') return { text: '资产提取失败 — 在下方卡片上点「重试」', tone: 'failed' }
  if (step4 === 'failed') return { text: '部分资产校验失败 — 去「资产 Review」检查并重抠', tone: 'failed' }
  if (step5 === 'failed') return { text: 'CDN 上传出错 — 去「资产 Review」重传', tone: 'failed' }

  // running 次之
  const runningCount = states.filter((s) => s.pipeline_status === 'pass1_running').length
  if (step1 === 'running') {
    return {
      text: `布局分析中… ${runningCount} 张设计稿正在跑 Pass 1,通常 30-60 秒,稍候`,
      tone: 'running',
    }
  }
  const pass2Running = states.filter((s) => s.pipeline_status === 'pass2_running').length
  if (step3 === 'running') {
    return {
      text: `资产提取中… ${pass2Running} 张设计稿正在跑 Pass 2(image-edit + 绿幕抠像),通常 60-120 秒`,
      tone: 'running',
    }
  }
  if (step5 === 'running') {
    const uploaded = assets.filter((a) => a.status === 'uploaded').length
    return { text: `CDN 上传中… ${uploaded}/${assets.length} 已完成`, tone: 'running' }
  }

  // 引导下一步
  if (step1 === 'done' && elements.length > 0 && step2 !== 'done') {
    const reviewed = elements.filter((e) => e.reviewed).length
    return {
      text: `布局已分析(${elements.length} 个元素)— 去「元素 Review」检查框选,${reviewed}/${elements.length} 已确认`,
      tone: 'info',
    }
  }
  if (step2 === 'done' && step3 === 'idle') {
    return { text: '元素已确认 — 去「资产 Review」触发 Pass 2 提取资产', tone: 'info' }
  }
  if (step3 === 'done' && step4 !== 'done') {
    return { text: '资产已提取 — 去「资产 Review」检查抠图质量并校验', tone: 'info' }
  }
  if (step4 === 'done' && step5 === 'idle') {
    const staticEls = elements.filter((e) => e.type === 'static').length
    if (staticEls > 0) {
      return { text: '资产已校验 — 可在「资产 Review」批量上传 CDN', tone: 'info' }
    }
    return { text: '资产已校验 — 可执行 Export 导出素材包', tone: 'success' }
  }
  if (step5 === 'done') {
    return { text: '全部就绪 — 可执行 Export 导出素材包', tone: 'success' }
  }

  return null
}

export function PipelineStepper({
  states,
  elements = [],
  assets = [],
  projectId,
  pageId,
}: PipelineStepperProps) {
  const step1 = inferStep1Status(states)
  const reviewedAll = elements.length > 0 && elements.every((e) => e.reviewed)
  const step2: StepStatus = elements.length === 0 ? 'idle' : reviewedAll ? 'done' : 'idle'
  const step3 = inferStep3Status(states)
  const step4: StepStatus =
    assets.length === 0
      ? 'idle'
      : assets.every((a) => a.status === 'validated' || a.status === 'uploaded')
        ? 'done'
        : assets.some((a) => a.status === 'failed')
          ? 'failed'
          : 'idle'
  const step5 = inferCdnStatus(elements, assets)
  const step6: StepStatus = 'idle'
  const statuses: StepStatus[] = [step1, step2, step3, step4, step5, step6]
  const hint = inferActiveHint(states, elements, assets, statuses)

  // 跳转 link(只有 projectId/pageId 都有 + step 状态允许时)
  const canNavigate = projectId && pageId
  const stepHrefs: (string | null)[] = canNavigate
    ? [
        null,                                              // 1. pass1 — 无独立页(状态在主页 stepper 自身)
        elements.length > 0                                // 2. review_elements
          ? `/projects/${projectId}/pages/${pageId}/elements`
          : null,
        null,                                              // 3. pass2 — 触发按钮在 Asset Review
        assets.length > 0                                  // 4. review_assets
          ? `/projects/${projectId}/pages/${pageId}/assets`
          : null,
        assets.length > 0                                  // 5. cdn — 入口在 Asset Review 顶部「批量上传 CDN」
          ? `/projects/${projectId}/pages/${pageId}/assets`
          : null,
        states.length > 0                                  // 6. export — 任何时候都可访问
          ? `/projects/${projectId}/pages/${pageId}/export`
          : null,
      ]
    : [null, null, null, null, null, null]

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-1">
        {STEPS.map((step, idx) => {
          const status = statuses[idx] ?? 'idle'
          const href = stepHrefs[idx]
          const className = cn(
            'flex-1 border rounded-md px-3 py-2 flex items-center gap-2 text-sm transition-colors',
            status === 'done' && 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-100',
            status === 'running' && 'bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-100',
            status === 'failed' && 'bg-red-50 border-red-300 text-red-900 dark:bg-red-950/30 dark:border-red-800 dark:text-red-100',
            status === 'idle' && 'text-muted-foreground',
            href && 'hover:bg-foreground/5 cursor-pointer',
            !href && 'cursor-default',
          )
          const inner = (
            <>
              <StepIcon status={status} />
              <span className="text-xs">
                <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                {step.label}
              </span>
            </>
          )
          if (href) {
            return (
              <Link key={step.key} href={href} className={className} title={`跳到 ${step.label}`}>
                {inner}
              </Link>
            )
          }
          return (
            <div key={step.key} className={className}>
              {inner}
            </div>
          )
        })}
      </div>
      {hint && <HintLine text={hint.text} tone={hint.tone} />}
    </div>
  )
}

function HintLine({ text, tone }: { text: string; tone: HintTone }) {
  const className = cn(
    'rounded-md border px-3 py-2 text-sm flex items-center gap-2',
    tone === 'running' && 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-100',
    tone === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-100',
    tone === 'failed' && 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/30 dark:border-red-900 dark:text-red-100',
    tone === 'info' && 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-100',
  )
  return (
    <div data-testid="pipeline-active-hint" className={className}>
      {tone === 'running' && <Loader2 className="size-4 shrink-0 animate-spin" />}
      {tone === 'success' && <Check className="size-4 shrink-0" />}
      {tone === 'failed' && <Circle className="size-4 shrink-0 fill-red-500 text-red-500" />}
      {tone === 'info' && <Circle className="size-4 shrink-0" />}
      <span>{text}</span>
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
