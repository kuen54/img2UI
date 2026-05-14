'use client'

import { useEffect, useRef, useState } from 'react'

import type { Element } from '@/lib/types'
import { cn } from '@/lib/utils'

// =============================================================================
// Element Review Canvas
// SVG overlay on top of <img>,坐标用图像 normalized [0,1] 内部转 px
// =============================================================================

export type CanvasViewOptions = {
  showOutlines: boolean
  showLabels: boolean
  imageOpacity: number  // 0-1
  filter: 'all' | 'static' | 'code'
}

export type ElementChange = (next: Element) => void
export type ElementCreateInput = {
  bbox: [number, number, number, number]  // normalized
}

export type CanvasProps = {
  imageSrc: string
  imageDims: { width: number; height: number }
  /** 仅显示 state_ids 包含 currentStateId 的 element bbox(其他元素不渲染) */
  currentStateId: string
  elements: Element[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: ElementChange
  onCreateRequest: (input: ElementCreateInput) => void
  view: CanvasViewOptions
}

type DragMode =
  | { type: 'idle' }
  | { type: 'move'; elementId: string; startMouse: { x: number; y: number }; startBbox: [number, number, number, number] }
  | { type: 'resize'; elementId: string; corner: 'nw' | 'ne' | 'sw' | 'se'; startMouse: { x: number; y: number }; startBbox: [number, number, number, number] }
  | { type: 'create'; startNormalized: { x: number; y: number }; currentNormalized: { x: number; y: number } }

const MIN_BBOX_PX = 10  // 最小拖出 10x10 像素

export function ElementCanvas({
  imageSrc,
  imageDims,
  currentStateId,
  elements,
  selectedId,
  onSelect,
  onChange,
  onCreateRequest,
  view,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragMode>({ type: 'idle' })
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const eventToNormalized = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    if (!svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  }

  const handleGlobalMove = (e: MouseEvent) => {
    const norm = eventToNormalized(e)
    if (!norm) return

    if (drag.type === 'create') {
      setDrag({ ...drag, currentNormalized: norm })
    } else if (drag.type === 'move') {
      const dx = (e.clientX - drag.startMouse.x) / (svgRef.current?.getBoundingClientRect().width ?? 1)
      const dy = (e.clientY - drag.startMouse.y) / (svgRef.current?.getBoundingClientRect().height ?? 1)
      const [x0, y0, w, h] = drag.startBbox
      const newX = clamp(x0 + dx, 0, 1 - w)
      const newY = clamp(y0 + dy, 0, 1 - h)
      const el = elements.find((e2) => e2.id === drag.elementId)
      if (el) {
        onChange({ ...el, bbox: [newX, newY, w, h], updated_at: new Date().toISOString() })
      }
    } else if (drag.type === 'resize') {
      const [sx, sy, sw, sh] = drag.startBbox
      let newX = sx, newY = sy, newW = sw, newH = sh
      const el = elements.find((e2) => e2.id === drag.elementId)
      if (!el) return
      if (drag.corner === 'nw') {
        newX = clamp(norm.x, 0, sx + sw - MIN_BBOX_PX / imageDims.width)
        newY = clamp(norm.y, 0, sy + sh - MIN_BBOX_PX / imageDims.height)
        newW = sx + sw - newX
        newH = sy + sh - newY
      } else if (drag.corner === 'ne') {
        newY = clamp(norm.y, 0, sy + sh - MIN_BBOX_PX / imageDims.height)
        newW = clamp(norm.x - sx, MIN_BBOX_PX / imageDims.width, 1 - sx)
        newH = sy + sh - newY
      } else if (drag.corner === 'sw') {
        newX = clamp(norm.x, 0, sx + sw - MIN_BBOX_PX / imageDims.width)
        newW = sx + sw - newX
        newH = clamp(norm.y - sy, MIN_BBOX_PX / imageDims.height, 1 - sy)
      } else if (drag.corner === 'se') {
        newW = clamp(norm.x - sx, MIN_BBOX_PX / imageDims.width, 1 - sx)
        newH = clamp(norm.y - sy, MIN_BBOX_PX / imageDims.height, 1 - sy)
      }
      onChange({ ...el, bbox: [newX, newY, newW, newH], updated_at: new Date().toISOString() })
    }
  }

  const handleGlobalUp = () => {
    if (drag.type === 'create') {
      const sx = Math.min(drag.startNormalized.x, drag.currentNormalized.x)
      const sy = Math.min(drag.startNormalized.y, drag.currentNormalized.y)
      const ex = Math.max(drag.startNormalized.x, drag.currentNormalized.x)
      const ey = Math.max(drag.startNormalized.y, drag.currentNormalized.y)
      const w = ex - sx
      const h = ey - sy
      // 只在拖出大于 min size 的 box 时触发 create
      if (w * imageDims.width >= MIN_BBOX_PX && h * imageDims.height >= MIN_BBOX_PX) {
        onCreateRequest({ bbox: [sx, sy, w, h] })
      }
    }
    setDrag({ type: 'idle' })
  }

  // 全局 mousemove / mouseup 监听(只在 drag 中绑)
  useEffect(() => {
    if (drag.type === 'idle') return
    const onMove = (e: MouseEvent) => handleGlobalMove(e)
    const onUp = () => handleGlobalUp()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  const startMove = (e: React.MouseEvent, el: Element) => {
    e.stopPropagation()
    onSelect(el.id)
    setDrag({
      type: 'move',
      elementId: el.id,
      startMouse: { x: e.clientX, y: e.clientY },
      startBbox: el.bbox,
    })
  }

  const startResize = (e: React.MouseEvent, el: Element, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation()
    onSelect(el.id)
    setDrag({
      type: 'resize',
      elementId: el.id,
      corner,
      startMouse: { x: e.clientX, y: e.clientY },
      startBbox: el.bbox,
    })
  }

  const startCreate = (e: React.MouseEvent) => {
    if (e.target !== svgRef.current) return  // 只在 svg 空白区
    const norm = eventToNormalized(e)
    if (!norm) return
    onSelect(null)
    setDrag({ type: 'create', startNormalized: norm, currentNormalized: norm })
  }

  // 渲染列表:在当前 state 出现的 + 通过 filter 的
  const visibleElements = elements.filter((el) => {
    if (!el.state_ids.includes(currentStateId)) return false
    if (view.filter !== 'all' && el.type !== view.filter) return false
    return true
  })

  // 创建预览 box
  let previewRect: { x: number; y: number; w: number; h: number } | null = null
  if (drag.type === 'create') {
    const sx = Math.min(drag.startNormalized.x, drag.currentNormalized.x)
    const sy = Math.min(drag.startNormalized.y, drag.currentNormalized.y)
    const ex = Math.max(drag.startNormalized.x, drag.currentNormalized.x)
    const ey = Math.max(drag.startNormalized.y, drag.currentNormalized.y)
    previewRect = { x: sx, y: sy, w: ex - sx, h: ey - sy }
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="px-3 py-2 text-xs bg-amber-50 border-b border-amber-200 text-amber-900 shrink-0">
        <strong>拖动框 = 调整位置坐标</strong>(进 layout.json)且作为 <strong>Pass 2 参考图裁剪</strong>边界。
        改 description / 类别 / 拆合并需要<strong>重跑 Pass 2</strong> 才生效。
      </div>
      <div className="relative w-full flex-1 flex items-center justify-center bg-muted/30 overflow-hidden">
      <div
        className="relative max-w-full max-h-full"
        style={{ aspectRatio: `${imageDims.width} / ${imageDims.height}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt=""
          className="block w-full h-full object-contain pointer-events-none select-none"
          style={{ opacity: view.imageOpacity }}
          draggable={false}
        />
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          viewBox={`0 0 ${imageDims.width} ${imageDims.height}`}
          preserveAspectRatio="none"
          onMouseDown={startCreate}
        >
          {/* 元素 bbox */}
          {view.showOutlines && visibleElements.map((el) => {
            const isSelected = el.id === selectedId
            const [bx, by, bw, bh] = el.bbox
            const x = bx * imageDims.width
            const y = by * imageDims.height
            const w = bw * imageDims.width
            const h = bh * imageDims.height
            const colorClass = el.type === 'static' ? 'stroke-blue-500' : 'stroke-orange-500'
            const isHovered = hoveredId === el.id
            return (
              <g
                key={el.id}
                onMouseEnter={() => setHoveredId(el.id)}
                onMouseLeave={() => setHoveredId((curr) => (curr === el.id ? null : curr))}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  className={cn(
                    'fill-transparent transition-[stroke-width]',
                    colorClass,
                    isSelected ? 'stroke-[4]' : isHovered ? 'stroke-[3]' : 'stroke-2',
                  )}
                  style={{ cursor: 'move' }}
                  onMouseDown={(e) => startMove(e, el)}
                />
                {/* resize handles 仅 selected 时显示 */}
                {isSelected && (
                  <>
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                      const cx = corner.includes('w') ? x : x + w
                      const cy = corner.includes('n') ? y : y + h
                      const cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
                      return (
                        <circle
                          key={corner}
                          cx={cx}
                          cy={cy}
                          r={Math.max(6, Math.min(imageDims.width, imageDims.height) * 0.012)}
                          className="fill-white stroke-foreground stroke-2"
                          style={{ cursor }}
                          onMouseDown={(e) => startResize(e, el, corner)}
                        />
                      )
                    })}
                  </>
                )}
                {/* 标签:全局 toggle 显示 全部,或仅显示 selected/hovered 元素的标签(避免密集场景互相遮挡) */}
                {(view.showLabels || isSelected || isHovered) && (
                  <g pointerEvents="none">
                    {/* 标签底色,提高可读性 */}
                    <rect
                      x={x}
                      y={y - Math.max(14, Math.min(imageDims.width, imageDims.height) * 0.028)}
                      width={Math.min(w, el.name.length * Math.max(8, Math.min(imageDims.width, imageDims.height) * 0.018) + 8)}
                      height={Math.max(14, Math.min(imageDims.width, imageDims.height) * 0.028)}
                      className={cn(
                        el.type === 'static' ? 'fill-blue-500/95' : 'fill-orange-500/95',
                      )}
                      rx={2}
                    />
                    <text
                      x={x + 4}
                      y={y - 4}
                      fontSize={Math.max(10, Math.min(imageDims.width, imageDims.height) * 0.022)}
                      className="font-medium select-none fill-white"
                    >
                      {el.name}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* 拖拽创建预览 */}
          {previewRect && (
            <rect
              x={previewRect.x * imageDims.width}
              y={previewRect.y * imageDims.height}
              width={previewRect.w * imageDims.width}
              height={previewRect.h * imageDims.height}
              className="fill-red-500/20 stroke-red-500 stroke-2"
              strokeDasharray="6 4"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>
      </div>
    </div>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
