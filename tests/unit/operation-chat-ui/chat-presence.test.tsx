// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => undefined),
  useMutation: () => vi.fn(async () => ({})),
}))

import { ChatTranscript } from '@/components/ae/operation-chat/ChatTranscript'
import { OperationHistory } from '@/components/ae/operation-chat/OperationHistory'
import { SharedOperationChat } from '@/components/ae/operation-chat/SharedOperationChat'
import { chatHistory } from '@/lib/public/chat-ia'
import { useQuery } from 'convex/react'

const mockedUseQuery = vi.mocked(useQuery)

afterEach(() => {
  cleanup()
  mockedUseQuery.mockReset()
  mockedUseQuery.mockImplementation(() => undefined)
})

const threads: readonly { threadId: string; title: string; busy: boolean }[] = [
  { threadId: 'thread-1', title: 'Weather operations', busy: false },
]

describe('OperationHistory first-load gate', () => {
  it('shows placeholder rows before anything is cached, without empty copy', () => {
    render(
      <OperationHistory
        idPrefix="test"
        activeThreadId={null}
        threads={[]}
        search=""
        busy={false}
        historyPending
        onSearch={() => undefined}
        onOpen={() => undefined}
        onRename={async () => true}
        onDelete={async () => true}
        onNewChat={() => undefined}
      />,
    )

    expect(screen.getByLabelText('Conversations')).toBeTruthy()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('shows the canonical empty state once the list is resolved-empty', () => {
    render(
      <OperationHistory
        idPrefix="test"
        activeThreadId={null}
        threads={[]}
        search=""
        busy={false}
        onSearch={() => undefined}
        onOpen={() => undefined}
        onRename={async () => true}
        onDelete={async () => true}
        onNewChat={() => undefined}
      />,
    )

    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()
    expect(screen.getByText(chatHistory.empty)).toBeTruthy()
  })

  it('renders resolved conversations without pending or empty-state UI', () => {
    render(
      <OperationHistory
        idPrefix="test"
        activeThreadId="thread-1"
        threads={threads}
        search=""
        busy={false}
        onSearch={() => undefined}
        onOpen={() => undefined}
        onRename={async () => true}
        onDelete={async () => true}
        onNewChat={() => undefined}
      />,
    )

    expect(screen.getByText('Weather operations')).toBeTruthy()
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()
    expect(screen.queryByText(chatHistory.empty)).toBeNull()
  })
})

describe('ChatTranscript first-page gate', () => {
  it('renders message placeholders for an uncached thread instead of suggestions', () => {
    const { container } = render(<ChatTranscript messages={[]} pending />)

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps suggestions for a resolved-empty transcript and ignores pending with rows', () => {
    const resolved = render(
      <ChatTranscript messages={[]} />,
    )
    resolved.unmount()
    expect(resolved.container.querySelector('[aria-busy="true"]')).toBeNull()
  })
})

describe('SharedOperationChat shared-thread gate', () => {
  it('shows message placeholders until the share query has cached a page', () => {
    render(<SharedOperationChat shareToken="token-1" />)

    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull()
  })

  it('distinguishes resolved-empty shares from pending ones', () => {
    mockedUseQuery.mockImplementation(() => ({
      title: 'Shared thread',
      page: [],
      isDone: true,
      continueCursor: '',
    }) as never)
    render(<SharedOperationChat shareToken="token-1" />)

    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()
  })
})
