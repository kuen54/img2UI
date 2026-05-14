'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SliceManifest } from '@/lib/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  elementId: string
  pageId: string
  stateId: string
  category: string
  onAssigned: () => void
}

export function SlicePickerDialog({ open, onOpenChange, elementId, pageId, stateId, category, onAssigned }: Props) {
  const [manifest, setManifest] = useState<SliceManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setManifest(null)
    fetch(`/api/states/${encodeURIComponent(stateId)}/slices?category=${encodeURIComponent(category)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m: SliceManifest | null) => { if (!cancelled) setManifest(m) })
      .catch(() => { if (!cancelled) setManifest(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, stateId, category])

  const handlePick = async (sliceIdx: number) => {
    setAssigning(sliceIdx)
    try {
      const r = await fetch(`/api/elements/${encodeURIComponent(elementId)}/assign-slice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_id: stateId, category, slice_idx: sliceIdx, page_id: pageId }),
      })
      if (!r.ok) throw new Error(await r.text())
      onAssigned()
      onOpenChange(false)
      toast.success(`已指派切片 #${sliceIdx}`)
    } catch (e) {
      toast.error('指派失败:' + (e as Error).message)
    } finally {
      setAssigning(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>选择切图(类别:{category})</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2 mb-3">
          点击切片缩略图把它指派给当前 element。蓝色 = 当前已指派,黄色 = 已指派给其他 element。
        </div>
        {loading && <p className="text-sm text-muted-foreground py-8 text-center">加载中…</p>}
        {!loading && !manifest && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            该路无切片库(可能 Pass 2 还没跑完)
          </p>
        )}
        {manifest && manifest.slices.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">该路无切片</p>
        )}
        {manifest && manifest.slices.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {manifest.slices.map((s) => {
              const isCurrent = s.assigned_element_id === elementId
              const otherAssigned = s.assigned_element_id && s.assigned_element_id !== elementId
              return (
                <button
                  key={s.idx}
                  type="button"
                  disabled={assigning !== null}
                  onClick={() => handlePick(s.idx)}
                  data-testid={`slice-${s.idx}`}
                  className={[
                    'relative aspect-square border-2 rounded overflow-hidden transition',
                    isCurrent
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : otherAssigned
                        ? 'border-amber-300 hover:border-amber-500'
                        : 'border-muted hover:border-foreground',
                    assigning === s.idx ? 'opacity-50' : '',
                  ].join(' ')}
                  title={
                    isCurrent
                      ? '当前指派'
                      : otherAssigned
                        ? `已指派给其他 element(${s.assigned_element_id})`
                        : '未指派'
                  }
                >
                  <div
                    className="w-full h-full bg-[length:14px_14px]"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/slices/${encodeURIComponent(stateId)}/${encodeURIComponent(category)}/${s.idx}`}
                      alt={`slice ${s.idx}`}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <span className="absolute bottom-0 left-0 right-0 text-[10px] bg-black/60 text-white px-1 truncate">
                    #{s.idx} · {Math.round(s.opaque_pct)}% · {s.width}×{s.height}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
