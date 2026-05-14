'use client'

import { Star, Loader2, CheckCircle2, XCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import type { State, StatePipelineStatus } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { deleteStateApi } from '@/lib/api/projects-client'
import { cn } from '@/lib/utils'

export type StateCardProps = {
  state: State
  isCanonical: boolean
  onDeleted: (id: string) => void
}

function statusBadge(status: StatePipelineStatus) {
  switch (status) {
    case 'pass1_running':
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" /> 布局分析中
        </Badge>
      )
    case 'pass1_done':
      return (
        <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3" /> 布局已分析
        </Badge>
      )
    case 'pass1_failed':
      return (
        <Badge variant="secondary" className="gap-1 text-red-700 dark:text-red-400">
          <XCircle className="size-3" /> 布局失败
        </Badge>
      )
    case 'pass2_running':
      return <Badge variant="secondary" className="gap-1"><Loader2 className="size-3 animate-spin" /> 提取中</Badge>
    case 'pass2_done':
      return <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3" /> 资产已提取</Badge>
    case 'validating':
      return <Badge variant="secondary" className="gap-1"><Loader2 className="size-3 animate-spin" /> 校验中</Badge>
    case 'validated':
      return <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3" /> 已校验</Badge>
    default:
      return <Badge variant="outline">未开始</Badge>
  }
}

export function StateCard({ state, isCanonical, onDeleted }: StateCardProps) {
  const confirm = useConfirm()

  const handleDelete = async () => {
    const ok = await confirm({
      title: `删除状态「${state.name}」?`,
      description: isCanonical ? '这是 canonical 状态,删除后页面会失去主参考。' : '不可撤销。',
      confirmText: '删除',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteStateApi(state.id)
      toast.success('已删除')
      onDeleted(state.id)
    } catch (err) {
      toast.error('删除失败:' + (err as Error).message)
    }
  }

  return (
    <Card
      className={cn(
        'overflow-hidden relative group',
        isCanonical && 'ring-2 ring-amber-400 dark:ring-amber-500',
      )}
    >
      <div className="aspect-[3/4] bg-muted/40 relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/states/${state.id}/raw`}
          alt={state.name}
          className="w-full h-full object-contain"
          loading="lazy"
        />
        {isCanonical && (
          <Badge className="absolute top-2 left-2 bg-amber-500 text-white border-amber-600">
            <Star className="size-3 mr-1 fill-current" /> canonical
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80"
          onClick={() => void handleDelete()}
          title="删除"
        >
          <Trash2 className="size-3.5 text-red-500" />
        </Button>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="font-medium text-sm truncate">{state.name}</p>
        <p className="text-xs text-muted-foreground font-mono">
          {state.width}×{state.height}
        </p>
        <div>{statusBadge(state.pipeline_status)}</div>
      </div>
    </Card>
  )
}
