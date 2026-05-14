'use client'

import { useEffect, useState } from 'react'
import { Plus, Folder } from 'lucide-react'
import { toast } from 'sonner'

import type { Project } from '@/lib/types'
import { listProjectsApi } from '@/lib/api/projects-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard } from '@/components/projects/project-card'
import { NewProjectDialog } from '@/components/projects/new-project-dialog'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = async () => {
    try {
      const list = await listProjectsApi()
      setProjects(list)
    } catch (e) {
      toast.error('加载失败:' + (e as Error).message)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [])

  if (projects === null) {
    return <p className="p-6 text-sm text-muted-foreground">加载中…</p>
  }

  return (
    <div className="p-6 h-full">
      {projects.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="暂无项目"
          description="创建一个项目来开始把 AI 生图设计稿转成可消费素材包"
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4 mr-1" />
              新建项目
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold">项目</h1>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4 mr-1" />
              新建项目
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onDeleted={(id) => setProjects(projects.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        </>
      )}
      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(project) => setProjects([project, ...(projects ?? [])])}
      />
    </div>
  )
}
