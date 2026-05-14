import { Folder } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'

export default function ProjectsPage() {
  return (
    <EmptyState
      icon={Folder}
      title="暂无项目"
      description="Phase 3 完成后这里会显示项目列表与「+ 新建项目」按钮"
    />
  )
}
