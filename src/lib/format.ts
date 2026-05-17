// 共用 UI 格式化 helper:相对时间 / pass kind 标签 / pipeline_status 标签 /
// PipelineRun 状态推断为 dot kind + label。Home / ProjectDetail / PageDetail
// 都用,本身无 React 依赖,放 lib 共享。
//
// (StatusDot 组件反向 import RunStatusKind 类型,运行时无依赖。)

import type { PipelinePassKind, StatePipelineStatus } from './types'

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

export function formatPassKind(pass: string): string {
  // pass1_subject → pass1·subject;pass2 → pass2;validate → validate
  if (pass.includes('_')) return pass.replace('_', '·')
  return pass
}

export function pipelineStatusLabel(status: StatePipelineStatus): string {
  switch (status) {
    case 'idle':
      return '待 Pass 1'
    case 'pass1_running':
      return 'Pass 1 运行中'
    case 'pass1_done':
      return 'Pass 1 完成'
    case 'pass1_failed':
      return 'Pass 1 失败'
    case 'pass2_running':
      return 'Pass 2 运行中'
    case 'pass2_done':
      return 'Pass 2 完成'
    case 'pass2_failed':
      return 'Pass 2 失败'
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
