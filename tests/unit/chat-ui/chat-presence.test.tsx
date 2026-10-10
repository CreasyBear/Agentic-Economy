// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sharedQuerySpy, sharedConvexClient } = vi.hoisted(() => {
  const sharedQuerySpy = vi.fn<(...args: unknown[]) => Promise<unknown>>()
  return { sharedQuerySpy, sharedConvexClient: { query: sharedQuerySpy } }
})

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
  useConvex: () => sharedConvexClient,
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}))

import { ChatTranscript } from '@/components/ae/chat/ChatTranscript'
import { ToolCard } from '@/components/ae/chat/ToolCard'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { Chat } from '@/components/ae/chat'
import { ChatComposer } from '@/components/ae/chat/chat-session/components/ChatComposer'
import { ChatHistory } from '@/components/ae/chat/chat-session/components/ChatHistory'
import { SharedChat } from '@/components/ae/chat/SharedChat'
import { chatComposer, chatHistory, chatShared } from '@/lib/public/chat-ia'
import * as degradeModule from '@/lib/observability/degrade'
import { useQuery } from 'convex/react'

const mockedUseQuery = vi.mocked(useQuery)
const mockedDegrade = vi.spyOn(degradeModule, 'degrade')

afterEach(() => {
  cleanup()
  mockedUseQuery.mockReset()
  mockedUseQuery.mockImplementation(() => undefined)
  sharedQuerySpy.mockReset()
  mockedDegrade.mockClear()
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

    const loadingStatus = screen.getByRole('status', { name: 'Loading chat history' })
    expect(loadingStatus.getAttribute('aria-busy')).toBe('true')
    const decorativeFrames = loadingStatus.querySelectorAll('[aria-hidden="true"].h-5')
    expect(Array.from(decorativeFrames, frame => (frame as HTMLElement).style.width))
      .toEqual(['44%', '32%', '28%', '64%', '52%'])
    expect(decorativeFrames).toHaveLength(5)
    expect(Array.from(decorativeFrames).every(frame => frame.querySelector('[role="status"]') !== null)).toBe(true)
    expect(screen.queryByText('Your chats will appear here.')).toBeNull()
    expect(screen.queryByText(chatHistory.empty)).toBeNull()
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

    expect(screen.queryByRole('status', { name: 'Loading chat history' })).toBeNull()
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
    expect(screen.queryByRole('status', { name: 'Loading chat history' })).toBeNull()
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
    expect(screen.getAllByRole('listitem').map(row => row.querySelector('button')?.textContent))
      .toEqual(['Chat 0', 'Chat 1', 'Chat 2', 'Chat 3', 'Chat 4'])
    for (const [index, label] of ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'].entries()) {
      expect(screen.getByText(label).parentElement?.querySelector('ul')?.textContent).toBe('Chat ' + index)
    }
  })
})

describe('ChatTranscript first-page gate', () => {
  it('renders message placeholders for an uncached thread instead of suggestions', () => {
    const { container } = render(<ChatTranscript messages={[]} pending />)

    const busyRegion = container.querySelector('[aria-busy="true"]')
    expect(busyRegion).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Loading conversation…')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    const decorativeFrames = container.querySelectorAll('[aria-hidden="true"].h-16.w-full.max-w-prose')
    expect(decorativeFrames).toHaveLength(2)
    expect(Array.from(decorativeFrames).every(frame => frame.querySelector('[role="status"]') !== null)).toBe(true)
    expect(Array.from(decorativeFrames).some(frame => frame.classList.contains('ml-auto'))).toBe(true)
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

    expect(document.querySelector('article[aria-label="Assistant"] button[aria-expanded="false"]')).not.toBeNull()
    expect(document.querySelector('[data-tool-card="registry.tools.search"]')).toBeNull()
    expect(screen.queryByText('Thinking…')).toBeNull()
  })

  it('groups answer prose before the work disclosure and copies a fenced block', async () => {
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

    const answer = screen.getByRole('region', { name: 'Answer' })
    const before = screen.getByText('Before the search.')
    const tool = document.querySelector('article[aria-label="Assistant"] button[aria-expanded]')
    const after = screen.getByText('After the search.')
    if (tool === null) throw new Error('Work disclosure missing')
    expect(answer.contains(before)).toBe(true)
    expect(answer.contains(after)).toBe(true)
    expect(answer.compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it('keeps openui prose without exposing empty search cards', () => {
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
  })

  it('renders one Tool through the comparison block with missing facts explicit', () => {
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    render(<ToolCard projection={{
      toolId: 'registry.tools.compare',
      title: 'Compare tools',
      kind: 'choices',
      state: 'complete',
      choices: [{ toolRef, title: 'Lookup A' }],
      toolRefs: [toolRef],
    }} />)
    const comparison = screen.getByRole('table', { name: 'Tool comparison' })
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Lookup A' }).getAttribute('href')).toBe(`/tools/${encodeURIComponent(toolRef)}`)
    for (const fact of ['Provider', 'Price', 'Readiness']) {
      const rowHeader = within(comparison).getByRole('rowheader', { name: fact })
      const row = rowHeader.closest<HTMLElement>('[role="row"]')
      if (row === null) throw new Error(`Missing comparison row for ${fact}`)
      expect(within(row).getByText('Not published', { exact: true })).toBeTruthy()
    }
    expect(within(comparison).queryByRole('rowheader', { name: 'Match' })).toBeNull()
  })

  it('compares Tools in an Arc table and keeps critical facts in differences-only', () => {
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    render(<ToolCard projection={{
      toolId: 'registry.tools.search',
      title: 'Compare tools',
      kind: 'choices',
      state: 'complete',
      surface: 'compare',
      choices: [
        { toolRef, detailHref: '/tools/lookup-a?source=chat', title: 'Lookup A', provider: 'Acme', price: 'A$1.25', sourcePrice: '0.01 USDC', priceValidUntil: Date.UTC(2030, 0, 2, 3, 4), readiness: 'ready', access: 'external_listing', belowMatch: true },
        { toolRef: `${toolRef}:b`, title: 'Lookup B', provider: 'Acme', price: 'A$1.25', sourcePrice: '0.01 USDC', priceValidUntil: Date.UTC(2030, 0, 2, 3, 4), readiness: 'ready', access: 'external_listing', belowMatch: true },
      ],
      toolRefs: [toolRef, `${toolRef}:b`],
    }} />)
    const comparison = screen.getByRole('table', { name: 'Tool comparison' })
    expect(screen.getByRole('link', { name: 'Lookup A' }).getAttribute('href')).toBe('/tools/lookup-a?source=chat')
    expect(screen.getByRole('link', { name: 'Lookup B' }).getAttribute('href')).toBe(`/tools/${encodeURIComponent(`${toolRef}:b`)}`)
    const expectFactForBothTools = (label: string, value: string) => {
      const rowHeader = within(comparison).getByRole('rowheader', { name: label })
      const row = rowHeader.closest<HTMLElement>('[role="row"]')
      if (row === null) throw new Error(`Missing comparison row for ${label}`)
      expect(within(row).getAllByText(value, { exact: true })).toHaveLength(2)
    }
    expectFactForBothTools('Price', 'A$1.25')
    expectFactForBothTools('Source price', '0.01 USDC')
    expectFactForBothTools('Price valid until', '2 Jan 2030, 3:04 am UTC')
    expectFactForBothTools('Readiness', 'Ready to use')
    expectFactForBothTools('Access', 'External listing · not callable through AE')
    expectFactForBothTools('Match', 'Below a match')
    fireEvent.click(screen.getByRole('switch', { name: 'Only differences' }))
    expectFactForBothTools('Price', 'A$1.25')
    expectFactForBothTools('Source price', '0.01 USDC')
    expectFactForBothTools('Price valid until', '2 Jan 2030, 3:04 am UTC')
    expectFactForBothTools('Readiness', 'Ready to use')
    expectFactForBothTools('Access', 'External listing · not callable through AE')
    expectFactForBothTools('Match', 'Below a match')
    expect(document.querySelector('[data-tool-card="registry.tools.search"]')).toBeTruthy()
  })
  it('keeps the conversation visible when its approval query fails', () => {
    mockedUseQuery.mockImplementation(() => { throw new Error('owner approvals query failed') })
    render(<ChatTranscript
      messages={[{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Keep this question visible' }] }]}
      ownerChatThreadId="thread-1" ownerChatNow={Date.now()} onFreshQuote={() => undefined}
    />)

    expect(screen.getByText('Keep this question visible')).toBeTruthy()
    expect(screen.queryByText('Review pending Call')).toBeNull()
  })

  it('offers retry and edit when a question has no answer', () => {
    const onRetryQuestion = vi.fn()
    const onEditQuestion = vi.fn()
    render(<ChatTranscript
      messages={[{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Find current weather' }] }]}
      onRetryQuestion={onRetryQuestion}
      onEditQuestion={onEditQuestion}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit question' }))
    expect(onRetryQuestion).toHaveBeenCalledWith('Find current weather')
    expect(onEditQuestion).toHaveBeenCalledWith('Find current weather')
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

  it('keeps an over-limit draft editable and blocks sending', () => {
    const prompt = `a${'b'.repeat(2_000)}`
    render(
      <ChatComposer
        prompt={prompt}
        busy={false}
        disabled={false}
        error="Messages can be at most 2,000 characters."
        browseMarketOnError={false}
        status=""
        anonymousMessageCount={0}
        anonymousMessageLimitReached={false}
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    const field = screen.getByRole('textbox', { name: chatComposer.promptLabel }) as HTMLTextAreaElement
    expect(field.disabled).toBe(false)
    expect(field.value).toBe(prompt)
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
  beforeEach(() => {
    sharedQuerySpy.mockReset()
    mockedDegrade.mockClear()
  })

  it('shows message placeholders until the share query has cached a page', () => {
    const { container } = render(<SharedChat shareToken="token-1" />)

    const busyRegion = container.querySelector('[aria-busy="true"]')
    expect(busyRegion).not.toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toBe(chatShared.loading)
    const decorativeFrames = busyRegion?.querySelectorAll('div[aria-hidden="true"]') ?? []
    expect(decorativeFrames).toHaveLength(3)
    expect(Array.from(decorativeFrames).every(frame => frame.querySelector('[role="status"]') !== null)).toBe(true)
    expect(busyRegion?.querySelector('button')).toBeNull()
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

  it('keeps a shared answer descriptive without selection or comparison actions', () => {
    mockedUseQuery.mockImplementation(() => ({
      title: 'Shared thread',
      page: [{
        id: 'assistant-1',
        role: 'assistant' as const,
        parts: [
          {
            type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
            state: 'output-available',
            output: {
              kind: 'match',
              results: [{
                toolRef: `operation:v1:${'a'.repeat(64)}`,
                title: 'Shared Weather',
                price: { kind: 'indicative', label: 'USD 0.005' },
              }],
            },
          },
          { type: 'text' as const, text: 'Shared Weather is a Tool to inspect.' },
        ],
      }],
      isDone: true,
      continueCursor: '',
    }) as never)

    render(<SharedChat shareToken="token-1" />)

    expect(screen.getByRole('link', { name: 'Shared Weather' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull()
  })

  it('admits one exact page query for two synchronous continuation clicks', async () => {
    const response = deferred<SharedPageFixture>()
    sharedQuerySpy.mockReturnValue(response.promise)
    setSharedInitial(sharedPage('Shared thread', [['newest', 'Newest confirmed message']], 'cursor-opaque-2'))
    render(<SharedChat shareToken="token-exact" />)

    const button = screen.getByRole('button', { name: chatShared.loadMore })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })

    expect(sharedQuerySpy).toHaveBeenCalledTimes(1)
    expect(sharedQuerySpy.mock.calls[0]?.[1]).toEqual({
      shareToken: 'token-exact',
      paginationOpts: { cursor: 'cursor-opaque-2', numItems: 20 },
    })
    await resolveDeferred(response, sharedPage('Shared thread', [['older', 'Older confirmed message']], ''))
  })

  it('prepends older pages chronologically, advances the exact cursor, then hides continuation', async () => {
    const firstResponse = deferred<SharedPageFixture>()
    const terminalResponse = deferred<SharedPageFixture>()
    sharedQuerySpy.mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(terminalResponse.promise)
    setSharedInitial(sharedPage('Shared thread', [
      ['newer-2', 'Newest message'],
      ['newer-1', 'Earlier recent message'],
    ], 'cursor-opaque-2'))
    render(<SharedChat shareToken="token-order" />)

    fireEvent.click(screen.getByRole('button', { name: chatShared.loadMore }))
    expect(sharedQuerySpy.mock.calls[0]?.[1]).toEqual({
      shareToken: 'token-order',
      paginationOpts: { cursor: 'cursor-opaque-2', numItems: 20 },
    })
    await resolveDeferred(firstResponse, sharedPage('Shared thread', [
      ['older-2', 'Later older message'],
      ['older-1', 'Oldest message'],
    ], 'cursor-opaque-3'))

    expectTextOrder(['Oldest message', 'Later older message', 'Earlier recent message', 'Newest message'])
    fireEvent.click(screen.getByRole('button', { name: chatShared.loadMore }))
    expect(sharedQuerySpy.mock.calls[1]?.[1]).toEqual({
      shareToken: 'token-order',
      paginationOpts: { cursor: 'cursor-opaque-3', numItems: 20 },
    })
    await resolveDeferred(terminalResponse, sharedPage('Shared thread', [['older-0', 'Final oldest message']], ''))

    expectTextOrder([
      'Final oldest message',
      'Oldest message',
      'Later older message',
      'Earlier recent message',
      'Newest message',
    ])
    expect(screen.queryByRole('button', { name: chatShared.loadMore })).toBeNull()
  })

  it('keeps only the new share after a previous share request resolves late', async () => {
    const oldResponse = deferred<SharedPageFixture>()
    sharedQuerySpy.mockReturnValue(oldResponse.promise)
    let currentInitial = sharedPage('Share A', [['a-current', 'Share A current message']], 'cursor-a-2')
    mockedUseQuery.mockImplementation(() => currentInitial as never)
    const view = render(<SharedChat shareToken="token-a" />)

    fireEvent.click(screen.getByRole('button', { name: chatShared.loadMore }))
    currentInitial = sharedPage('Share B', [['b-current', 'Share B current message']], '')
    view.rerender(<SharedChat shareToken="token-b" />)
    await resolveDeferred(oldResponse, sharedPage('Share A', [['a-old', 'Share A older message']], ''))

    expect(screen.getByText('Share B current message')).toBeTruthy()
    expect(screen.queryByText('Share A current message')).toBeNull()
    expect(screen.queryByText('Share A older message')).toBeNull()
  })

  it('does not let an old share finally clear a newer share loading state', async () => {
    const oldResponse = deferred<SharedPageFixture>()
    const newResponse = deferred<SharedPageFixture>()
    sharedQuerySpy.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise)
    let currentInitial = sharedPage('Share A', [['a-current', 'Share A current message']], 'cursor-a-2')
    mockedUseQuery.mockImplementation(() => currentInitial as never)
    const view = render(<SharedChat shareToken="token-a" />)

    fireEvent.click(screen.getByRole('button', { name: chatShared.loadMore }))
    currentInitial = sharedPage('Share B', [['b-current', 'Share B current message']], 'cursor-b-2')
    view.rerender(<SharedChat shareToken="token-b" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /earlier messages/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /earlier messages/i }))
    expect(sharedQuerySpy).toHaveBeenCalledTimes(2)
    expect(sharedQuerySpy.mock.calls[1]?.[1]).toEqual({
      shareToken: 'token-b',
      paginationOpts: { cursor: 'cursor-b-2', numItems: 20 },
    })
    const busyButton = screen.getByRole('button', { name: /earlier messages/i })
    expect(busyButton.getAttribute('aria-busy')).toBe('true')
    expect(busyButton.hasAttribute('disabled')).toBe(true)

    await resolveDeferred(oldResponse, sharedPage('Share A', [['a-old', 'Share A older message']], ''))

    const stillBusyButton = screen.getByRole('button', { name: /earlier messages/i })
    expect(stillBusyButton.getAttribute('aria-busy')).toBe('true')
    expect(stillBusyButton.hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText('Share A older message')).toBeNull()
    await resolveDeferred(newResponse, sharedPage('Share B', [['b-old', 'Share B older message']], ''))
  })

  it('drops pages loaded for one share when the token changes', async () => {
    const oldResponse = deferred<SharedPageFixture>()
    sharedQuerySpy.mockReturnValue(oldResponse.promise)
    let currentInitial = sharedPage('Share A', [['a-current', 'Share A current message']], 'cursor-a-2')
    mockedUseQuery.mockImplementation(() => currentInitial as never)
    const view = render(<SharedChat shareToken="token-a" />)

    fireEvent.click(screen.getByRole('button', { name: chatShared.loadMore }))
    await resolveDeferred(oldResponse, sharedPage('Share A', [['a-old', 'Share A older message']], ''))
    expect(screen.getByText('Share A older message')).toBeTruthy()

    currentInitial = sharedPage('Share B', [['b-current', 'Share B current message']], '')
    view.rerender(<SharedChat shareToken="token-b" />)

    expect(screen.getByText('Share B current message')).toBeTruthy()
    expect(screen.queryByText('Share A current message')).toBeNull()
    expect(screen.queryByText('Share A older message')).toBeNull()
  })

  it('keeps a late previous-share failure out of the current share warning', async () => {
    const oldResponse = deferred<SharedPageFixture>()
    sharedQuerySpy.mockReturnValue(oldResponse.promise)
    let currentInitial = sharedPage('Share A', [['a-current', 'Share A current message']], 'cursor-a-2')
    mockedUseQuery.mockImplementation(() => currentInitial as never)
    const view = render(<SharedChat shareToken="token-a" />)

    fireEvent.click(screen.getByRole('button', { name: chatShared.loadMore }))
    currentInitial = sharedPage('Share B', [['b-current', 'Share B current message']], 'cursor-b-2')
    view.rerender(<SharedChat shareToken="token-b" />)
    const oldFailure = new Error('Share A continuation unavailable')
    await rejectDeferred(oldResponse, oldFailure)

    expect(screen.getByText('Share B current message')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Earlier messages unavailable' })).toBeNull()
  })

  it('keeps the confirmed page and cursor on failure, then retries that cursor once and clears the warning', async () => {
    const failedResponse = deferred<SharedPageFixture>()
    const retryResponse = deferred<SharedPageFixture>()
    sharedQuerySpy.mockReturnValueOnce(failedResponse.promise).mockReturnValueOnce(retryResponse.promise)
    const current = sharedPage('Shared thread', [['current', 'Confirmed shared message']], 'cursor-opaque-retry')
    setSharedInitial(current)
    render(<SharedChat shareToken="token-retry" />)

    fireEvent.click(screen.getByRole('button', { name: chatShared.loadMore }))
    const queryArgs = {
      shareToken: 'token-retry',
      paginationOpts: { cursor: 'cursor-opaque-retry', numItems: 20 },
    }
    expect(sharedQuerySpy.mock.calls[0]?.[1]).toEqual(queryArgs)
    const failure = new Error('temporary Convex read failure')
    await rejectDeferred(failedResponse, failure)

    expect(screen.getByText('Confirmed shared message')).toBeTruthy()
    const warning = screen.getByRole('status', { name: 'Earlier messages unavailable' })
    expect(warning.textContent).toContain('The messages already shown are still available. Try loading earlier messages again.')
    expect(screen.getAllByRole('status', { name: 'Earlier messages unavailable' })).toHaveLength(1)
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(retry.getAttribute('aria-busy')).toBe('false')
    expect(mockedDegrade).toHaveBeenCalledWith(failure, undefined, {
      site: 'SharedChat.loadMore',
      reason: 'source_unavailable',
    })
    const telemetryContext = mockedDegrade.mock.calls[0]?.[2]
    expect(JSON.stringify(telemetryContext)).not.toContain('token-retry')
    expect(JSON.stringify(telemetryContext)).not.toContain('cursor-opaque-retry')
    expect(JSON.stringify(telemetryContext)).not.toContain('Confirmed shared message')

    fireEvent.click(retry)
    expect(sharedQuerySpy).toHaveBeenCalledTimes(2)
    expect(sharedQuerySpy.mock.calls[1]?.[1]).toEqual(queryArgs)
    await resolveDeferred(retryResponse, sharedPage('Shared thread', [['older', 'Recovered older message']], ''))

    expect(screen.getByText('Confirmed shared message')).toBeTruthy()
    expect(screen.getByText('Recovered older message')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Earlier messages unavailable' })).toBeNull()
    expect(screen.queryByRole('button', { name: chatShared.loadMore })).toBeNull()
  })

  it('ignores an old request that settles after its share unmounts and another instance mounts', async () => {
    const oldResponse = deferred<SharedPageFixture>()
    sharedQuerySpy.mockReturnValue(oldResponse.promise)
    let currentInitial = sharedPage('Share A', [['a-current', 'Share A current message']], 'cursor-a-2')
    mockedUseQuery.mockImplementation(() => currentInitial as never)
    const first = render(<SharedChat shareToken="token-a" />)

    fireEvent.click(screen.getByRole('button', { name: chatShared.loadMore }))
    first.unmount()
    currentInitial = sharedPage('Share B', [['b-current', 'Share B current message']], '')
    render(<SharedChat shareToken="token-b" />)
    await resolveDeferred(oldResponse, sharedPage('Share A', [['a-old', 'Share A older message']], ''))

    expect(screen.getByText('Share B current message')).toBeTruthy()
    expect(screen.queryByText('Share A older message')).toBeNull()
  })
})

type SharedPageFixture = {
  title: string
  page: { id: string; role: 'user' | 'assistant'; parts: { type: 'text'; text: string }[] }[]
  isDone: boolean
  continueCursor: string
}

function sharedPage(
  title: string,
  messages: readonly (readonly [string, string])[],
  continueCursor: string,
): SharedPageFixture {
  return {
    title,
    page: messages.map(([id, text]) => ({ id, role: 'user', parts: [{ type: 'text', text }] })),
    isDone: continueCursor === '',
    continueCursor,
  }
}

function setSharedInitial(page: SharedPageFixture): void {
  mockedUseQuery.mockImplementation(() => page as never)
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = reason => rejectPromise(reason)
  })
  return { promise, resolve, reject }
}

async function resolveDeferred<T>(
  response: ReturnType<typeof deferred<T>>,
  value: T,
): Promise<void> {
  await act(async () => {
    response.resolve(value)
    await response.promise
  })
}

async function rejectDeferred<T>(
  response: ReturnType<typeof deferred<T>>,
  reason: unknown,
): Promise<void> {
  await act(async () => {
    response.reject(reason)
    await expect(response.promise).rejects.toBe(reason)
  })
}

function expectTextOrder(texts: readonly string[]): void {
  const nodes = texts.map(text => screen.getByText(text))
  for (let index = 0; index < nodes.length - 1; index += 1) {
    expect(nodes[index]!.compareDocumentPosition(nodes[index + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  }
}
