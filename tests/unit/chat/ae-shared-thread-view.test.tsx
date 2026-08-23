// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '/'}>{children}</a>,
}))
vi.mock('@/components/ae/layout/AePublicShell', () => ({
  AePublicShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ae/chat/AeThreadScroller', () => ({
  AeThreadScroller: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ae/chat/AeThreadTranscript', () => ({
  AeThreadTranscript: () => <div data-testid="shared-transcript" />,
}))

import { AeSharedThreadView } from '@/components/ae/chat/AeSharedThreadView'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
afterEach(cleanup)

const projection: PublicThreadProjection = {
  threadId: 'thread:1',
  title: 'Find a plumber',
  turns: [{
    turnId: 'turn:1',
    seq: 0,
    query: 'Find a plumber',
    intent: 'refine_search',
    status: 'complete',
    workLog: [],
    artifacts: [],
    oneLine: 'A plumber can help.',
  }],
}

describe('AeSharedThreadView', () => {
  it('renders a sanitized read-only transcript without owner controls', () => {
    render(<AeSharedThreadView projection={projection} />)

    const note = screen.getByText('Shared read-only search')
    expect(note.getAttribute('role')).toBe('note')
    expect((screen.getByRole('link', { name: 'Start a search' }) as HTMLAnchorElement).getAttribute('href')).toBe('/t/new')
    expect(screen.getByTestId('shared-transcript')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /copy share link|revoke share link|stop/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('keeps an unavailable share link actionable without exposing a transcript', () => {
    render(<AeSharedThreadView projection={null} />)

    expect(screen.getByRole('heading', { name: 'Shared search unavailable' })).toBeTruthy()
    expect(screen.queryByTestId('shared-transcript')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Start a search' })).toHaveLength(2)
  })
})
