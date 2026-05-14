'use client'

import { useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { Asset, Element } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { reExtractElementApi } from '@/lib/api/assets-client'

export type AssetDetailPanelProps = {
  asset: Asset
  element: Element | null
  onReExtracted: () => void
}

export function AssetDetailPanel({ asset, element, onReExtracted }: AssetDetailPanelProps) {
  const [reExtracting, setReExtracting] = useState(false)

  const handleReExtract = async () => {
    setReExtracting(true)
    try {
      await reExtractElementApi(asset.element_id)
      toast.success('单元素重抠完成')
      onReExtracted()
    } catch (e) {
      toast.error('重抠失败:' + (e as Error).message)
    } finally {
      setReExtracting(false)
    }
  }

  return (
    <div className="border-t p-4 space-y-4">
      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 w-32 h-32 border rounded-md overflow-hidden"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
            backgroundSize: '14px 14px',
            backgroundPosition: '0 0, 7px 7px',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/assets/${asset.id}/raw`}
            alt={element?.name ?? asset.id}
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <h3 className="font-medium">{element?.name ?? '(unknown element)'}</h3>
            <p className="text-xs text-muted-foreground font-mono">{asset.width}×{asset.height}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="text-xs text-muted-foreground">alpha quality</div>
            <div className="font-mono">{(asset.alpha_quality * 100).toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">status</div>
            <div className="font-mono">{asset.status}</div>
          </div>
          {element?.description && (
            <p className="text-xs text-muted-foreground border-t pt-2">
              {element.description}
            </p>
          )}
          {asset.validation_notes && (
            <p className="text-xs text-amber-600">
              {asset.validation_notes}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void handleReExtract()} disabled={reExtracting} size="sm">
          {reExtracting ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <RefreshCw className="size-3.5 mr-1" />}
          {reExtracting ? '重抠中…(60-180s)' : '重抠该元素'}
        </Button>
        <p className="text-xs text-muted-foreground self-center">
          重抠会用当前 element 的 description 重发 Pass 2,覆盖该 asset
        </p>
      </div>
    </div>
  )
}
