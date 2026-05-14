import { cn } from '@/lib/utils'

// PipelineProgress: Pass 1/2 多路并行进度条
// 三态:
//  - running: 显示当前 succeeded/total
//  - 全完成: succeeded === total 且 failed === 0
//  - 部分失败: failed > 0 显 (X failed) tag
export function PipelineProgress({
  total,
  succeeded,
  failed,
  pass,
  className,
}: {
  total: number
  succeeded: number
  failed: number
  pass: 'pass1' | 'pass2'
  className?: string
}) {
  const label = pass === 'pass1' ? 'Pass 1' : 'Pass 2'
  const done = succeeded + failed
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)} role="status">
      <span className="font-medium">{label}:</span>
      <span>
        {succeeded}/{total} 完成
      </span>
      {failed > 0 && (
        <span className="text-rose-600 text-xs font-medium">({failed} failed)</span>
      )}
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[60px]">
        <div
          className={cn(
            'h-full transition-[width] duration-300',
            failed > 0 ? 'bg-amber-500' : 'bg-emerald-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
