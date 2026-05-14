import { type VisualCategory, visualCategoryCn } from '@/lib/visual-category'
import { cn } from '@/lib/utils'

const COLOR: Record<VisualCategory, string> = {
  subject: 'bg-rose-100 text-rose-700 border-rose-200',
  button: 'bg-amber-100 text-amber-700 border-amber-200',
  container: 'bg-blue-100 text-blue-700 border-blue-200',
  background: 'bg-slate-100 text-slate-700 border-slate-200',
  decoration: 'bg-violet-100 text-violet-700 border-violet-200',
  other: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

export function VisualCategoryBadge({
  category,
  className,
}: {
  category: VisualCategory
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border',
        COLOR[category],
        className,
      )}
    >
      {visualCategoryCn(category)}
    </span>
  )
}
