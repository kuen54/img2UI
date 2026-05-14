'use client'

import { useState } from 'react'
import { Plus, CheckCircle2 } from 'lucide-react'

import type { Element, State } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  VISUAL_CATEGORIES,
  visualCategoryCn,
  type VisualCategory,
} from '@/lib/visual-category'
import { VisualCategoryBadge } from './visual-category-badge'
import { getBboxWarning } from './bbox-warning'

export type ElementListProps = {
  elements: Element[]
  states: State[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddManual: () => void
}

type FilterTab = 'all' | 'static' | 'code' | 'unreviewed'

// 0.5% 页面面积阈值——over-include 架构下小碎片是噪声主源
const SMALL_AREA_THRESHOLD = 0.005

export function ElementList({ elements, states, selectedId, onSelect, onAddManual }: ElementListProps) {
  const [tab, setTab] = useState<FilterTab>('all')
  const [enabled, setEnabled] = useState<Set<VisualCategory>>(new Set(VISUAL_CATEGORIES))
  const [showOnlyStatic, setShowOnlyStatic] = useState(true)
  const [hideSmallElements, setHideSmallElements] = useState(true)

  const toggleCategory = (cat: VisualCategory, checked: boolean) => {
    const next = new Set(enabled)
    if (checked) next.add(cat)
    else next.delete(cat)
    setEnabled(next)
  }

  const resetAllFilters = () => {
    setShowOnlyStatic(false)
    setHideSmallElements(false)
    setEnabled(new Set(VISUAL_CATEGORIES))
    setTab('all')
  }

  const filtered = elements.filter((el) => {
    if (showOnlyStatic && el.type !== 'static') return false
    if (hideSmallElements) {
      const area = el.bbox[2] * el.bbox[3]
      if (area < SMALL_AREA_THRESHOLD) return false
    }
    if (!enabled.has(el.visual_category)) return false
    if (tab === 'static') return el.type === 'static'
    if (tab === 'code') return el.type === 'code'
    if (tab === 'unreviewed') return !el.reviewed
    return true
  })

  const hasFiltered = filtered.length < elements.length

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-3 py-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">全部({elements.length})</TabsTrigger>
            <TabsTrigger value="static">Static</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="unreviewed">未 review</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="border-b px-3 py-2 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              className="size-3 cursor-pointer"
              checked={showOnlyStatic}
              aria-label="只看静态切图"
              onChange={(e) => setShowOnlyStatic(e.target.checked)}
            />
            <span>只看静态切图</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              className="size-3 cursor-pointer"
              checked={hideSmallElements}
              aria-label="隐藏小碎片"
              onChange={(e) => setHideSmallElements(e.target.checked)}
            />
            <span>隐藏小碎片(&lt;0.5% 面积)</span>
          </label>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground shrink-0">
          <span>显示 {filtered.length} / {elements.length}</span>
          {hasFiltered && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="underline hover:text-foreground"
            >
              显示全部
            </button>
          )}
        </div>
      </div>
      <div className="border-b px-3 py-2 flex flex-wrap gap-x-3 gap-y-1.5">
        {VISUAL_CATEGORIES.map((cat) => {
          const id = `vc-filter-${cat}`
          return (
            <span key={cat} className="flex items-center gap-1 text-xs select-none">
              <input
                id={id}
                type="checkbox"
                className="size-3 cursor-pointer"
                checked={enabled.has(cat)}
                aria-label={visualCategoryCn(cat)}
                onChange={(e) => toggleCategory(cat, e.target.checked)}
              />
              <label htmlFor={id} className="cursor-pointer">
                <VisualCategoryBadge category={cat} />
              </label>
            </span>
          )
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">无元素</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((el) => {
              const isSelected = el.id === selectedId
              const warning = getBboxWarning(el)
              return (
                <li
                  key={el.id}
                  data-testid="element-list-item"
                  className={cn(
                    'px-3 py-2 cursor-pointer flex items-start gap-2 hover:bg-muted/50',
                    isSelected && 'bg-muted',
                  )}
                  onClick={() => onSelect(el.id)}
                >
                  <CheckCircle2
                    className={cn(
                      'size-4 mt-0.5 shrink-0',
                      el.reviewed ? 'text-emerald-600' : 'text-muted-foreground/40',
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-medium truncate">{el.name}</p>
                      {warning.level === 'error' && (
                        <span
                          aria-label={warning.reason}
                          title={warning.reason}
                          className="text-rose-600 shrink-0 leading-none"
                        >
                          ⚠️
                        </span>
                      )}
                      {warning.level === 'warning' && (
                        <span
                          aria-label={warning.reason}
                          title={warning.reason}
                          className="text-amber-600 shrink-0 leading-none"
                        >
                          ℹ️
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          el.type === 'static' ? 'border-blue-500 text-blue-700 dark:text-blue-300' : 'border-orange-500 text-orange-700 dark:text-orange-300',
                        )}
                      >
                        {el.type}
                      </Badge>
                      <VisualCategoryBadge category={el.visual_category} />
                      {el.state_ids.length > 1 && (
                        <Badge variant="secondary" className="text-xs">
                          {el.state_ids.length} states
                        </Badge>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="border-t p-3">
        <Button variant="outline" size="sm" className="w-full" onClick={onAddManual}>
          <Plus className="size-3 mr-1" />
          手动添加元素(在 canvas 空白区拖)
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          {states.length > 1 && `当前 page 有 ${states.length} 张设计稿。同 entity 跨状态共享 id。`}
        </p>
      </div>
    </div>
  )
}
