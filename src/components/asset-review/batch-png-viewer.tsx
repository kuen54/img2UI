'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { reKeyViaApiClient } from '@/lib/api/assets-client'

export type BatchView = 'keyed' | 'pass2'

export type BatchPngViewerProps = {
  stateId: string
  // 父组件刷新 asset list 用(API 抠图后 asset 二进制和 metadata 都变了)
  onReKeyed?: () => void
}

export function BatchPngViewer({ stateId, onReKeyed }: BatchPngViewerProps) {
  const [view, setView] = useState<BatchView>('keyed')
  const [reKeying, setReKeying] = useState(false)
  // bust 让 keyed 预览图在 API 抠图后重新 fetch(浏览器默认会缓存 PNG)
  const [bust, setBust] = useState(0)

  const handleReKey = async () => {
    setReKeying(true)
    try {
      const r = await reKeyViaApiClient(stateId)
      setBust((b) => b + 1)
      onReKeyed?.()
      const fail = r.failed_routes.length
      if (fail === 0) {
        toast.success(`API 抠图完成,刷新 ${r.refreshed} 个资产`)
      } else {
        toast.warning(
          `API 抠图部分成功:${r.refreshed} 个资产刷新,${fail} 路失败 — 失败 category 仍保留绿幕抠图结果`,
        )
      }
    } catch (e) {
      toast.error('API 抠图失败:' + (e as Error).message)
    } finally {
      setReKeying(false)
    }
  }

  const baseSrc =
    view === 'keyed' ? `/api/states/${stateId}/keyed` : `/api/states/${stateId}/pass2-raw`
  const src = bust > 0 ? `${baseSrc}?bust=${bust}` : baseSrc

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium text-muted-foreground">Pass 2 输出</h3>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as BatchView)}>
            <TabsList>
              <TabsTrigger value="keyed">透明(chroma key 后)</TabsTrigger>
              <TabsTrigger value="pass2">绿幕原图</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleReKey()}
            disabled={reKeying}
            title="用配置的抠图 API 重抠该 state 全部 category(覆盖 chroma key 结果)"
          >
            {reKeying ? (
              <>
                <Loader2 className="size-3.5 mr-1 animate-spin" />
                抠图中…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 mr-1" />
                用 API 抠图
              </>
            )}
          </Button>
        </div>
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
          key={src}
          src={src}
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
