// 共用 UI 格式化 helper:相对时间 / pass kind 标签 / pipeline_status 标签 /
// PipelineRun 状态推断为 dot kind + label。Home / ProjectDetail / PageDetail
// 都用,本身无 React 依赖,放 lib 共享。
//
// (StatusDot 组件反向 import RunStatusKind 类型,运行时无依赖。)

import type { PipelinePassKind, StatePipelineStatus } from './types'
import { VISUAL_CATEGORY_CN } from './visual-category'

export type RunStatusKind = 'idle' | 'running' | 'completed' | 'failed'

export interface RunSummary {
  at: string
  pass: PipelinePassKind
  status: 'running' | 'completed' | 'failed'
}

export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 60_000) return '刚刚'
  const min = Math.floor(diffMs / 60_000)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}

const PASS_BASE_CN: Record<string, string> = {
  pass1: '布局分析',
  pass2: '素材生成',
  validate: '校验',
  export: '导出',
  re_extract: '单元素重抠',
}

export function formatPassKind(pass: string): string {
  // pass1_subject → 布局分析·主体;pass2 → 素材生成;validate → 校验
  const direct = PASS_BASE_CN[pass]
  if (direct !== undefined) return direct
  const sep = pass.indexOf('_')
  if (sep > 0) {
    const base = PASS_BASE_CN[pass.slice(0, sep)]
    const cat = (VISUAL_CATEGORY_CN as Record<string, string | undefined>)[pass.slice(sep + 1)]
    if (base !== undefined && cat !== undefined) return `${base}·${cat}`
  }
  return pass
}

export function pipelineStatusLabel(status: StatePipelineStatus): string {
  switch (status) {
    case 'idle':
      return '待布局分析'
    case 'pass1_running':
      return '布局分析进行中'
    case 'pass1_done':
      return '布局分析完成'
    case 'pass1_failed':
      return '布局分析失败'
    case 'pass2_running':
      return '素材生成进行中'
    case 'pass2_done':
      return '素材生成完成'
    case 'pass2_failed':
      return '素材生成失败'
    case 'validating':
      return '校验中'
    case 'validated':
      return '已校验'
  }
}

export function describeRunStatus(run: RunSummary | undefined): {
  kind: RunStatusKind
  label: string
} {
  if (!run) {
    return { kind: 'idle', label: '尚未跑' }
  }
  const passLabel = formatPassKind(run.pass)
  const ago = formatRelative(run.at)
  switch (run.status) {
    case 'running':
      return { kind: 'running', label: `运行中 ${passLabel}` }
    case 'completed':
      return { kind: 'completed', label: `${passLabel} · ${ago}` }
    case 'failed':
      return { kind: 'failed', label: `${passLabel} 失败 · ${ago}` }
  }
}
