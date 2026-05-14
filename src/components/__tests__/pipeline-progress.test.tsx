// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PipelineProgress } from '@/components/pipeline-progress'

afterEach(cleanup)

describe('PipelineProgress', () => {
  it('shows N/N when all routes complete', () => {
    render(<PipelineProgress total={5} succeeded={5} failed={0} pass="pass1" />)
    expect(screen.getByText(/5\/5/)).toBeInTheDocument()
    // 全部完成不显 failed 标签
    expect(screen.queryByText(/failed/)).not.toBeInTheDocument()
  })

  it('shows succeeded + failed split when partial failures', () => {
    render(<PipelineProgress total={5} succeeded={3} failed={2} pass="pass1" />)
    expect(screen.getByText(/3\/5/)).toBeInTheDocument()
    expect(screen.getByText(/2 failed/)).toBeInTheDocument()
  })

  it('shows Pass 1 label', () => {
    render(<PipelineProgress total={5} succeeded={2} failed={0} pass="pass1" />)
    expect(screen.getByText(/Pass 1/)).toBeInTheDocument()
  })

  it('shows Pass 2 label', () => {
    render(<PipelineProgress total={6} succeeded={1} failed={0} pass="pass2" />)
    expect(screen.getByText(/Pass 2/)).toBeInTheDocument()
    expect(screen.getByText(/1\/6/)).toBeInTheDocument()
  })
})
