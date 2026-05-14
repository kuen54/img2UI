'use client'

import { Eye, EyeOff, Type, FilterX } from 'lucide-react'

import type { CanvasViewOptions } from '@/components/element-review/canvas'
import type { State } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type CanvasToolbarProps = {
  view: CanvasViewOptions
  onViewChange: (next: CanvasViewOptions) => void
  states: State[]
  currentStateId: string
  onStateChange: (id: string) => void
  canonicalStateId: string
}

export function CanvasToolbar({
  view,
  onViewChange,
  states,
  currentStateId,
  onStateChange,
  canonicalStateId,
}: CanvasToolbarProps) {
  return (
    <div className="border-b px-3 py-2 flex items-center gap-3 flex-wrap text-sm">
      {states.length > 1 && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs">状态</span>
          <Select value={currentStateId} onValueChange={(v) => v && onStateChange(v)}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {states.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.id === canonicalStateId ? ' (canonical)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button
        variant={view.showOutlines ? 'default' : 'outline'}
        size="sm"
        onClick={() => onViewChange({ ...view, showOutlines: !view.showOutlines })}
        title={view.showOutlines ? '隐藏 bbox' : '显示 bbox'}
      >
        {view.showOutlines ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </Button>

      <Button
        variant={view.showLabels ? 'default' : 'outline'}
        size="sm"
        onClick={() => onViewChange({ ...view, showLabels: !view.showLabels })}
        title="切换 label"
      >
        <Type className="size-3.5" />
      </Button>

      <Select value={view.filter} onValueChange={(v) => onViewChange({ ...view, filter: v as CanvasViewOptions['filter'] })}>
        <SelectTrigger className={cn('h-8 w-32')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部元素</SelectItem>
          <SelectItem value="static">仅 static</SelectItem>
          <SelectItem value="code">仅 code</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 flex-1 min-w-32 max-w-60">
        <FilterX className="size-3.5 text-muted-foreground shrink-0" />
        <Slider
          value={[view.imageOpacity]}
          onValueChange={(v) => {
            const num = Array.isArray(v) ? v[0] : v
            if (typeof num === 'number') onViewChange({ ...view, imageOpacity: num })
          }}
          min={0}
          max={1}
          step={0.05}
        />
        <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">
          {Math.round(view.imageOpacity * 100)}%
        </span>
      </div>
    </div>
  )
}
