// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

import { ToolSearchStatus } from './ToolSearchStatus'

describe('ToolSearchStatus', () => {
  it('renders alert recovery actions for alert errors', () => {
    const onRetry = vi.fn()
    const onQueryChange = vi.fn()
    render(
      <ToolSearchStatus
        status={{
          kind: 'error',
          query: 'alpha',
          tone: 'alert',
          message: 'The catalog is temporarily unavailable. Try again.',
        }}
        query="alpha"
        recentCount={0}
        onQueryChange={onQueryChange}
        onRetry={onRetry}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('temporarily unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('omits alert role for recovery-tone errors', () => {
    render(
      <ToolSearchStatus
        status={{
          kind: 'error',
          query: 'alpha',
          tone: 'recovery',
          message: 'This search could not run. Try different wording or browse the current catalogue.',
        }}
        query="alpha"
        recentCount={0}
        onQueryChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/could not run/)).toBeTruthy()
  })
})
