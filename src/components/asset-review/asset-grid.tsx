'use client'

import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react'

import type { Asset, Element } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type AssetGridProps = {
  assets: Asset[]
  elements: Element[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function statusFor(asset: Asset): { icon: typeof CheckCircle2; tone: string; label: string } {
  if (asset.status === 'failed') return { icon: XCircle, tone: 'text-red-600', label: '失败' }
  const q = asset.alpha_quality
  if (q >= 0.5) return { icon: CheckCircle2, tone: 'text-emerald-600', label: '良好' }
  if (q >= 0.2) return { icon: AlertCircle, tone: 'text-amber-600', label: '偏小' }
  return { icon: AlertCircle, tone: 'text-amber-600', label: '弱信号' }
}

export function AssetGrid({ assets, elements, selectedId, onSelect }: AssetGridProps) {
  if (assets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-md">
        尚未提取资产。点上方「Run Pass 2」开始。
      </p>
    )
  }
  const elById = new Map(elements.map((e) => [e.id, e]))
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {assets.map((asset) => {
        const el = elById.get(asset.element_id)
        const isSelected = asset.id === selectedId
        const status = statusFor(asset)
        const Icon = status.icon
        return (
          <Card
            key={asset.id}
            className={cn(
              'cursor-pointer overflow-hidden p-0 hover:shadow-md transition-shadow',
              isSelected && 'ring-2 ring-primary',
            )}
            onClick={() => onSelect(asset.id)}
          >
            <div
              className="aspect-square bg-[length:14px_14px] bg-[position:0_0,7px_7px]"
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/assets/${asset.id}/raw`}
                alt={el?.name ?? asset.id}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="p-2 space-y-1">
              <p className="text-xs font-medium truncate">{el?.name ?? '(unknown)'}</p>
              <div className="flex items-center justify-between gap-1">
                <Badge variant="secondary" className={cn('gap-1 text-xs', status.tone)}>
                  <Icon className="size-3" />
                  {status.label}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {asset.width}×{asset.height}
                </span>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
