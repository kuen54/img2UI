'use client'

import { useState } from 'react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type BatchView = 'keyed' | 'pass2'

export type BatchPngViewerProps = {
  stateId: string
}

export function BatchPngViewer({ stateId }: BatchPngViewerProps) {
  const [view, setView] = useState<BatchView>('keyed')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Pass 2 输出</h3>
        <Tabs value={view} onValueChange={(v) => setView(v as BatchView)}>
          <TabsList>
            <TabsTrigger value="keyed">透明(chroma key 后)</TabsTrigger>
            <TabsTrigger value="pass2">绿幕原图</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div
        className="border rounded-md p-2 max-h-[40vh] flex items-center justify-center bg-[length:20px_20px] bg-[position:0_0,10px_10px]"
        style={{
          backgroundImage:
            view === 'keyed'
              ? 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)'
              : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={view === 'keyed' ? `/api/states/${stateId}/keyed` : `/api/states/${stateId}/pass2-raw`}
          alt={view === 'keyed' ? 'chroma key 后透明 PNG' : 'Pass 2 绿幕原图'}
          className="max-h-[36vh] object-contain"
          onError={(e) => {
            const target = e.currentTarget
            target.style.display = 'none'
            const sibling = target.nextElementSibling as HTMLElement | null
            if (sibling) sibling.style.display = 'block'
          }}
        />
        <p className="hidden text-sm text-muted-foreground p-4 text-center">
          {view === 'keyed' ? '尚未跑过 Pass 2,点下方「Run Pass 2」开始' : '绿幕原图尚未生成'}
        </p>
      </div>
    </div>
  )
}
