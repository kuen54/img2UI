import type { LucideIcon } from 'lucide-react'

// =============================================================================
// EmptyState:统一空态组件
//
// 用法:
//   <EmptyState
//     icon={Folder}
//     title="暂无项目"
//     description="点击「+ 新建项目」开始"
//   />
// =============================================================================

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  /** 在描述下方插入按钮 / 操作 */
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-8 text-center">
      <Icon className="size-16 mb-4 opacity-30" />
      <h1 className="text-lg font-medium mb-1 text-foreground">{title}</h1>
      {description && <p className="text-sm max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
