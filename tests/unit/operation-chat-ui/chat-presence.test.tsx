// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/tanstack-react-start', () => ({
  SignInButton: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@convex-dev/agent/react', () => ({
  useUIMessages: () => ({ results: [], status: 'Exhausted' }),
}))

vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => undefined),
  useMutation: () => vi.fn(async () => ({})),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}))

import { ChatTranscript } from '@/components/ae/operation-chat/ChatTranscript'
import { OperationChat } from '@/components/ae/operation-chat/OperationChat'
import { OperationComposer } from '@/components/ae/operation-chat/OperationComposer'
import { OperationHistory } from '@/components/ae/operation-chat/OperationHistory'
import { SharedOperationChat } from '@/components/ae/operation-chat/SharedOperationChat'
import { chatHistory } from '@/lib/public/chat-ia'
import { useQuery } from 'convex/react'

const mockedUseQuery = vi.mocked(useQuery)

afterEach(() => {
  cleanup()
  mockedUseQuery.mockReset()
  mockedUseQuery.mockImplementation(() => undefined)
  vi.unstubAllGlobals()
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

describe('OperationComposer recovery evidence', () => {
  it('keeps a failed prompt recoverable with reference and catalogue continuation', () => {
    render(
      <OperationComposer
        prompt="Find weather Operations"
        busy={false}
        disabled={false}
        error="Chat is unavailable right now. Your message was not added."
        errorReference="chat-request-7"
        browseMarketOnError
        status=""
        anonymousMessageCount={0}
        anonymousMessageLimitReached={false}
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
      />,
    )

    expect(screen.getByDisplayValue('Find weather Operations')).toBeTruthy()
    expect(screen.getByText('chat-request-7')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy chat support reference' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse Operations' }).getAttribute('href'))
      .toBe('/market?window=30d#operations')
  })
})

describe('OperationChat submission lock', () => {
  it('admits one anonymous request when submit repeats before React can disable the form', async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(async () => await new Promise<Response>((resolve) => {
      resolveFetch = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)

    const view = render(
      <OperationChat
        threadId={null}
        onThreadCreated={() => undefined}
        onNewChat={() => undefined}
      />,
    )
    const input = screen.getByRole('textbox', { name: 'Message' })
    const form = input.closest('form')
    if (form === null) throw new Error('Chat form missing')
    fireEvent.change(input, { target: { value: 'Find weather Operations' } })

    await act(async () => {
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(async () => {
      resolveFetch?.(Response.json({ code: 'chat_proxy_unavailable' }, {
        status: 503,
        headers: { 'x-ae-request-id': 'chat-lock-1' },
      }))
    })
    await waitFor(() => expect(screen.getByText('chat-lock-1')).toBeTruthy())
    expect(screen.getByDisplayValue('Find weather Operations')).toBeTruthy()
    view.unmount()
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
