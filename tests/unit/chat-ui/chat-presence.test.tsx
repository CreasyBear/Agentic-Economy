// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/tanstack-react-start', () => ({
  SignInButton: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isSignedIn: false }),
}))

vi.mock('@convex-dev/agent/react', () => ({
  useUIMessages: () => ({ results: [], status: 'Exhausted' }),
}))

vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => undefined),
  usePaginatedQuery: () => ({ results: [], status: 'Exhausted', loadMore: vi.fn() }),
  useMutation: () => vi.fn(async () => ({})),
  useConvex: () => ({ query: vi.fn() }),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}))

import { ChatTranscript } from '@/components/ae/chat/ChatTranscript'
import { ToolCard } from '@/components/ae/chat/ToolCard'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { Chat } from '@/components/ae/chat'
import { ChatComposer } from '@/components/ae/chat/chat-session/components/ChatComposer'
import { ChatHistory } from '@/components/ae/chat/chat-session/components/ChatHistory'
import { SharedChat } from '@/components/ae/chat/SharedChat'
import { chatHistory } from '@/lib/public/chat-ia'
import { useQuery } from 'convex/react'

const mockedUseQuery = vi.mocked(useQuery)

afterEach(() => {
  cleanup()
  mockedUseQuery.mockReset()
  mockedUseQuery.mockImplementation(() => undefined)
  vi.unstubAllGlobals()
})

const threads: readonly { threadId: string; title: string; createdAt: number; busy: boolean }[] = [
  { threadId: 'thread-1', title: 'Weather operations', createdAt: Date.now(), busy: false },
]

describe('ChatHistory first-load gate', () => {
  it('shows placeholder rows before anything is cached, without empty copy', () => {
    render(
      <ChatHistory
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

    expect(document.querySelector('[aria-busy="true"][aria-label="Conversations"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('shows the canonical empty state once the list is resolved-empty', () => {
    render(
      <ChatHistory
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
    expect(screen.getByText('Your chats will appear here.')).toBeTruthy()
  })

  it('renders resolved conversations without pending or empty-state UI', () => {
    render(
      <ChatHistory
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
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Weather operations' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByText(chatHistory.empty)).toBeNull()
  })

  it('groups saved chats by local calendar day and the older date ranges', () => {
    const today = new Date()
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const day = 86_400_000
    render(<ChatHistory idPrefix="groups" activeThreadId={null} search="" busy={false}
      threads={[midnight + 1, midnight - day / 2, midnight - 4 * day, midnight - 20 * day, midnight - 40 * day]
        .map((createdAt, index) => ({ threadId: `thread-${index}`, title: `Chat ${index}`, createdAt, busy: false }))}
      onSearch={() => undefined} onOpen={() => undefined} onRename={async () => true}
      onDelete={async () => true} onNewChat={() => undefined} />)
    expect(screen.getAllByRole('listitem').map(section => section.textContent))
      .toEqual(['TodayChat 0', 'YesterdayChat 1', 'Previous 7 daysChat 2', 'Previous 30 daysChat 3', 'OlderChat 4'])
  })
})

describe('ChatTranscript first-page gate', () => {
  it('renders message placeholders for an uncached thread instead of suggestions', () => {
    const { container } = render(<ChatTranscript messages={[]} pending />)

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.getByRole('status').textContent).toBe('Loading conversation…')
    expect(screen.queryByText('Search the catalog.')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps suggestions for a resolved-empty transcript and ignores pending with rows', () => {
    const resolved = render(
      <ChatTranscript messages={[]} />,
    )
    resolved.unmount()
    expect(resolved.container.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('shows the greeting heading in a resolved-empty transcript', () => {
    render(<ChatTranscript messages={[]} />)

    expect(screen.getByRole('heading', { name: 'What can I find for you?' })).toBeTruthy()
  })

  it('renders assistant markdown and leaves the user bubble plain', () => {
    render(<ChatTranscript messages={[
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: '**not bold**' }] },
      { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: '- Weather\n- Maps\n\n[Market](https://example.com/market)\n\n[bad](javascript:alert(1))' }] },
    ]} />)

    expect(screen.getByText('**not bold**')).toBeTruthy()
    expect(screen.getByRole('list')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Market' }).getAttribute('href')).toBe('https://example.com/market')
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
  })

  it('names a working tool and shows Thinking only before the first assistant part', () => {
    const waiting = render(<ChatTranscript
      thinking
      messages={[{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Find weather' }] }]}
    />)
    const thinking = screen.getByText('Thinking…')
    expect(thinking.closest('[data-slot="message-scroller-item"]')).not.toBeNull()
    waiting.unmount()

    render(<ChatTranscript
      messages={[{
        id: 'assistant-1',
        role: 'assistant',
        parts: [{
          type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
          state: 'input-available',
        }],
      }]}
    />)

    expect(document.querySelector('article[aria-label="Assistant"] details:not([open]) > summary')).not.toBeNull()
    expect(document.querySelector('[data-tool-card="registry.tools.search"]')).toBeNull()
    expect(screen.queryByText('Thinking…')).toBeNull()
  })

  it('groups answer prose after the work disclosure and copies a fenced block', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<ChatTranscript messages={[{
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: '   ' },
        { type: 'text', text: 'Before the search.' },
        {
          type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
          state: 'input-available',
        },
        { type: 'text', text: 'After the search.\n\n```\ncurl example\n```' },
      ],
    }]} />)

    const before = screen.getByText('Before the search.')
    const tool = document.querySelector('article[aria-label="Assistant"] details > summary')
    const after = screen.getByText('After the search.')
    if (tool === null) throw new Error('Work disclosure missing')
    expect(tool.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('   ')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('curl example')
    })
  })

  it('pins one clarifying question and records the chosen words', () => {
    const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['chat.clarify']}`
    const question = {
      type: toolType,
      state: 'input-available',
      input: { question: 'Which region?', choices: ['Australia', 'Singapore', 'Global'] },
    }
    const onClarifyAnswer = vi.fn()
    const pending = render(<ChatTranscript
      messages={[{ id: 'assistant-1', role: 'assistant', parts: [question] }]}
      onClarifyAnswer={onClarifyAnswer}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Australia' }))
    expect(onClarifyAnswer).toHaveBeenCalledWith('Australia')
    pending.unmount()

    render(<ChatTranscript messages={[
      { id: 'assistant-1', role: 'assistant', parts: [question] },
      { id: 'user-2', role: 'user', parts: [{ type: 'text', text: 'Australia' }] },
    ]} />)
    expect(screen.getByText('Which region?')).toBeTruthy()
    expect(screen.getAllByText('Australia').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Singapore' })).toBeNull()
  })

  it('keeps openui prose without exposing empty search cards and compares Tools in a table', () => {
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    render(<ChatTranscript messages={[{
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: [
          'Two lookups match.',
          '```openui',
          'root = Stack([lead, found])',
          'lead = TextContent("Two lookups match the request.")',
          'found = ToolChoices("registry.tools.search")',
          '```',
        ].join('\n') },
        {
          type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
          state: 'output-available',
          output: { kind: 'no_candidates', items: [], count: 0 },
        },
      ],
    }]} />)

    expect(screen.getByText('Two lookups match the request.')).toBeTruthy()
    expect(document.querySelectorAll('[data-tool-card="registry.tools.search"]')).toHaveLength(0)
    expect(screen.queryByText('```openui')).toBeNull()

    cleanup()
    render(<ToolCard projection={{
      toolId: 'registry.tools.compare',
      title: 'Compare tools',
      kind: 'choices',
      state: 'complete',
      choices: [{ toolRef, title: 'Lookup A', provider: 'Acme', price: 'A$1.25', readiness: 'Ready now' }],
      toolRefs: [toolRef],
    }} />)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Lookup A' }).getAttribute('href')).toBe(`/tools/${encodeURIComponent(toolRef)}`)

    cleanup()
    render(<ToolCard projection={{
      toolId: 'registry.tools.search',
      title: 'Compare tools',
      kind: 'choices',
      state: 'complete',
      surface: 'compare',
      choices: [{ toolRef, title: 'Lookup A', provider: 'Acme', price: 'A$1.25', readiness: 'Ready now', belowMatch: true }],
      toolRefs: [toolRef],
    }} />)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByText('Below a match')).toBeTruthy()
    expect(document.querySelector('[data-tool-card="registry.tools.search"]')).toBeTruthy()
  })
})

describe('ChatComposer recovery evidence', () => {
  it('keeps a failed prompt recoverable with reference and catalogue continuation', () => {
    render(
      <ChatComposer
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
    expect(screen.getByRole('link', { name: 'Browse Market' }).getAttribute('href'))
      .toBe('/market')
  })

  it('keeps Send disabled until the message has text', () => {
    render(
      <ChatComposer
        prompt="   "
        busy={false}
        disabled={false}
        error=""
        browseMarketOnError={false}
        status=""
        anonymousMessageCount={0}
        anonymousMessageLimitReached={false}
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('swaps Send for Stop while an anonymous stream can be aborted', () => {
    const onStop = vi.fn()
    render(
      <ChatComposer
        prompt="Find weather"
        busy
        disabled
        error=""
        browseMarketOnError={false}
        status=""
        anonymousMessageCount={1}
        anonymousMessageLimitReached={false}
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        onStop={onStop}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))
    expect(onStop).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Sending message' })).toBeNull()
  })
})

describe('Chat submission lock', () => {
  it('admits one anonymous request when submit repeats before React can disable the form', async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(async () => await new Promise<Response>((resolve) => {
      resolveFetch = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)

    const view = render(
      <Chat
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

describe('SharedChat shared-thread gate', () => {
  it('shows message placeholders until the share query has cached a page', () => {
    render(<SharedChat shareToken="token-1" />)

    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull()
  })

  it('distinguishes resolved-empty shares from pending ones', () => {
    mockedUseQuery.mockImplementation(() => ({
      title: 'Shared thread',
      page: [],
      isDone: true,
      continueCursor: '',
    }) as never)
    render(<SharedChat shareToken="token-1" />)

    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()
  })

  it('shows a load-more cue when the first page of 20 is not the end', () => {
    mockedUseQuery.mockImplementation(() => ({
      title: 'Shared thread',
      page: [{
        id: 'msg-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Hello' }],
      }],
      isDone: false,
      continueCursor: 'cursor-2',
    }) as never)
    render(<SharedChat shareToken="token-1" />)

    expect(screen.getByRole('button', { name: 'Load earlier messages' })).toBeTruthy()
  })
})
