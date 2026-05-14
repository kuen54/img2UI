'use client'

import { useState } from 'react'
import { Plus, CheckCircle2 } from 'lucide-react'

import type { Element, State } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export type ElementListProps = {
  elements: Element[]
  states: State[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddManual: () => void
}

type FilterTab = 'all' | 'static' | 'code' | 'unreviewed'

export function ElementList({ elements, states, selectedId, onSelect, onAddManual }: ElementListProps) {
  const [tab, setTab] = useState<FilterTab>('all')

  const filtered = elements.filter((el) => {
    if (tab === 'static') return el.type === 'static'
    if (tab === 'code') return el.type === 'code'
    if (tab === 'unreviewed') return !el.reviewed
    return true
  })

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
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">无元素</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((el) => {
              const isSelected = el.id === selectedId
              return (
                <li
                  key={el.id}
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
                    <p className="text-sm font-medium truncate">{el.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          el.type === 'static' ? 'border-blue-500 text-blue-700 dark:text-blue-300' : 'border-orange-500 text-orange-700 dark:text-orange-300',
                        )}
                      >
                        {el.type}
                      </Badge>
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
          {states.length > 1 && `当前 page 有 ${states.length} 个状态。同 entity 跨状态共享 id。`}
        </p>
      </div>
    </div>
  )
}
