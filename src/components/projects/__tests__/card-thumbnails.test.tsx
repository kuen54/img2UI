// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

import { ProjectCard } from '@/components/projects/project-card'
import { PageCard } from '@/components/projects/page-card'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import type { Project, Page } from '@/lib/types'

afterEach(cleanup)

const baseProject: Project = {
  id: 'proj_a',
  name: 'My Project',
  created_at: '2026-05-14T00:00:00Z',
  updated_at: '2026-05-14T00:00:00Z',
}

const basePage: Page = {
  id: 'page_x',
  project_id: 'proj_a',
  name: 'home',
  canonical_state_id: 'state_y',
  created_at: '2026-05-14T00:00:00Z',
  updated_at: '2026-05-14T00:00:00Z',
}

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <ConfirmProvider>{children}</ConfirmProvider>
)

describe('ProjectCard thumbnail', () => {
  it('renders <img> with sample_thumbnail_url when present', () => {
    render(
      <ProjectCard
        project={{ ...baseProject, sample_thumbnail_url: '/api/thumbs/page_x' }}
        onDeleted={() => {}}
      />,
      { wrapper: Wrapper },
    )
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('/api/thumbs/page_x')
    expect(img.alt).toBe('My Project')
  })

  it('does not render <img> when sample_thumbnail_url is missing', () => {
    render(<ProjectCard project={baseProject} onDeleted={() => {}} />, { wrapper: Wrapper })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('falls back to icon when img onError fires', () => {
    render(
      <ProjectCard
        project={{ ...baseProject, sample_thumbnail_url: '/api/thumbs/missing' }}
        onDeleted={() => {}}
      />,
      { wrapper: Wrapper },
    )
    const img = screen.getByRole('img') as HTMLImageElement
    fireEvent.error(img)
    // img should be removed; icon (Folder) should now be visible via aria-label or testid
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByTestId('project-thumbnail-fallback')).toBeInTheDocument()
  })
})

describe('PageCard thumbnail', () => {
  it('renders <img> with thumbnail_url when present', () => {
    render(
      <PageCard
        page={{ ...basePage, thumbnail_url: '/api/thumbs/page_x' }}
        projectId="proj_a"
        onDeleted={() => {}}
      />,
      { wrapper: Wrapper },
    )
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('/api/thumbs/page_x')
    expect(img.alt).toBe('home')
  })

  it('does not render <img> when thumbnail_url is missing', () => {
    render(<PageCard page={basePage} projectId="proj_a" onDeleted={() => {}} />, {
      wrapper: Wrapper,
    })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('falls back to icon when img onError fires', () => {
    render(
      <PageCard
        page={{ ...basePage, thumbnail_url: '/api/thumbs/missing' }}
        projectId="proj_a"
        onDeleted={() => {}}
      />,
      { wrapper: Wrapper },
    )
    const img = screen.getByRole('img') as HTMLImageElement
    fireEvent.error(img)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByTestId('page-thumbnail-fallback')).toBeInTheDocument()
  })
})
