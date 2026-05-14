import { Folder } from 'lucide-react'

export default function ProjectsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <Folder className="size-16 mb-4 opacity-30" />
      <h1 className="text-lg font-medium mb-1 text-foreground">暂无项目</h1>
      <p className="text-sm">Phase 3 完成后这里会显示项目列表与「+ 新建项目」按钮</p>
    </div>
  )
}
