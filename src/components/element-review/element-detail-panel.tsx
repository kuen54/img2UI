'use client'

import { Trash2 } from 'lucide-react'

import type { Element, State } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  VISUAL_CATEGORIES,
  visualCategoryCn,
  type VisualCategory,
} from '@/lib/visual-category'

export type ElementDetailPanelProps = {
  element: Element
  states: State[]
  onChange: (next: Element) => void
  onDelete: () => void
}

const DESCRIPTION_LIMIT = 80

export function ElementDetailPanel({ element, states, onChange, onDelete }: ElementDetailPanelProps) {
  const confirm = useConfirm()

  const update = <K extends keyof Element>(key: K, value: Element[K]) => {
    onChange({ ...element, [key]: value, updated_at: new Date().toISOString() })
  }

  const toggleStateId = (stateId: string) => {
    const next = element.state_ids.includes(stateId)
      ? element.state_ids.filter((id) => id !== stateId)
      : [...element.state_ids, stateId]
    update('state_ids', next)
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: `删除元素「${element.name}」?`,
      description: '本次保存后生效。可以撤销改动恢复。',
      confirmText: '删除',
      destructive: true,
    })
    if (ok) onDelete()
  }

  return (
    <div className="border-t p-4 space-y-4 max-h-[40vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Name *</Label>
          <Input
            value={element.name}
            onChange={(e) => update('name', e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <div className="flex gap-1">
            {(['static', 'code'] as const).map((t) => (
              <Button
                key={t}
                variant={element.type === t ? 'default' : 'outline'}
                size="sm"
                onClick={() => update('type', t)}
                className="h-8"
              >
                {t}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">已 review</Label>
          <div className="h-8 flex items-center">
            <Checkbox
              checked={element.reviewed}
              onCheckedChange={(v) => update('reviewed', !!v)}
            />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void handleDelete()} title="删除">
          <Trash2 className="size-4 text-red-500" />
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="visual-category" className="text-xs">视觉类别</Label>
        <select
          id="visual-category"
          aria-label="视觉类别"
          value={element.visual_category}
          onChange={(e) => update('visual_category', e.target.value as VisualCategory)}
          className="h-8 w-full text-sm rounded-md border border-input bg-transparent px-2 py-1 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {VISUAL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {visualCategoryCn(c)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          影响 Pass 2 调度组(同类元素并行)
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Description{element.type === 'static' && ' *'}</Label>
          <span className={`text-xs ${element.description.length > DESCRIPTION_LIMIT ? 'text-red-500' : 'text-muted-foreground'}`}>
            {element.description.length}/{DESCRIPTION_LIMIT}
          </span>
        </div>
        <Textarea
          value={element.description}
          onChange={(e) => update('description', e.target.value)}
          rows={2}
          className="text-sm"
        />
        {element.type === 'static' && (
          <p className="text-xs text-muted-foreground">
            ★ 这段会进 Pass 2 prompt 渲染源,描述越具体抠图效果越好。
          </p>
        )}
      </div>

      {element.type === 'code' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Shape spec</Label>
            <Textarea
              value={element.shape_spec ?? ''}
              onChange={(e) => update('shape_spec', e.target.value)}
              rows={2}
              className="text-xs font-mono"
              placeholder="SVG path / clip-path / 几何描述"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Material spec</Label>
            <Textarea
              value={element.material_spec ?? ''}
              onChange={(e) => update('material_spec', e.target.value)}
              rows={2}
              className="text-xs font-mono"
              placeholder="渐变 / 阴影 / 材质参数"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">出现在状态</Label>
          <div className="flex flex-wrap gap-2">
            {states.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox
                  checked={element.state_ids.includes(s.id)}
                  onCheckedChange={() => toggleStateId(s.id)}
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cross-state notes(可选)</Label>
          <Textarea
            value={element.cross_state_notes ?? ''}
            onChange={(e) => update('cross_state_notes', e.target.value)}
            rows={2}
            className="text-xs"
            placeholder="loading 状态下颜色变灰…"
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground border-t pt-2">
        bbox(只读,改要去 canvas 拖):
        <span className="font-mono ml-1">
          [{element.bbox.map((v) => v.toFixed(3)).join(', ')}]
        </span>
      </div>
    </div>
  )
}
