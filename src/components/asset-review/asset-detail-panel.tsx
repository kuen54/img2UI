'use client'

import { useState } from 'react'
import { RefreshCw, Loader2, UploadCloud, ExternalLink, CheckCircle2, Circle, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

import type { Asset, Element } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { reExtractElementApi, uploadAssetApi, updateAssetApi } from '@/lib/api/assets-client'
import { SlicePickerDialog } from './slice-picker-dialog'

export type AssetDetailPanelProps = {
  asset: Asset
  element: Element | null
  /** canonical state id,用于「换切图」从切片库选 */
  canonicalStateId?: string
  onReExtracted: () => void
}

export function AssetDetailPanel({ asset, element, canonicalStateId, onReExtracted }: AssetDetailPanelProps) {
  const [reExtracting, setReExtracting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const isReviewed = asset.status === 'validated' || asset.status === 'uploaded'
  const canToggle = asset.status === 'extracted' || asset.status === 'validated'

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

  const handleUpload = async () => {
    setUploading(true)
    try {
      await uploadAssetApi(asset.id)
      toast.success('已上传到 CDN')
      onReExtracted()
    } catch (e) {
      toast.error('上传失败:' + (e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const handleToggleReviewed = async () => {
    setToggling(true)
    try {
      const next = isReviewed ? 'extracted' : 'validated'
      await updateAssetApi(asset.id, { status: next })
      toast.success(isReviewed ? '已取消 reviewed' : '已标记 reviewed')
      onReExtracted()
    } catch (e) {
      toast.error('更新状态失败:' + (e as Error).message)
    } finally {
      setToggling(false)
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
        {canToggle && (
          <Button
            onClick={() => void handleToggleReviewed()}
            disabled={toggling || reExtracting || uploading}
            size="sm"
            variant={isReviewed ? 'outline' : 'default'}
          >
            {toggling ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : isReviewed ? (
              <Circle className="size-3.5 mr-1" />
            ) : (
              <CheckCircle2 className="size-3.5 mr-1" />
            )}
            {isReviewed ? '取消 reviewed' : '标记已 reviewed'}
          </Button>
        )}
        <Button onClick={() => void handleReExtract()} disabled={reExtracting || uploading} size="sm" variant="outline">
          {reExtracting ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <RefreshCw className="size-3.5 mr-1" />}
          {reExtracting ? '重抠中…(60-180s)' : '重抠该元素'}
        </Button>
        {canonicalStateId && element?.visual_category && (
          <Button
            onClick={() => setPickerOpen(true)}
            disabled={reExtracting || uploading || toggling}
            size="sm"
            variant="outline"
          >
            <ImageIcon className="size-3.5 mr-1" />
            换切图
          </Button>
        )}
        <Button
          onClick={() => void handleUpload()}
          disabled={reExtracting || uploading}
          size="sm"
          variant="outline"
        >
          {uploading ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <UploadCloud className="size-3.5 mr-1" />}
          {asset.cdn_url ? '重传 CDN' : '上传 CDN'}
        </Button>
        {asset.cdn_url && (
          <a
            href={asset.cdn_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground self-center"
          >
            <ExternalLink className="size-3" />
            查看 CDN 链接
          </a>
        )}
      </div>

      {canonicalStateId && element && (
        <SlicePickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          elementId={element.id}
          pageId={asset.page_id}
          stateId={canonicalStateId}
          category={element.visual_category}
          onAssigned={onReExtracted}
        />
      )}
    </div>
  )
}
