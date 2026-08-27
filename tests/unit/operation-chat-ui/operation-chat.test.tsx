// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false, isRefreshing: false },
  durableResults: [] as Array<{ id: string; role: 'user' | 'assistant'; parts: unknown[] }>,
  uiMessageCalls: [] as unknown[][],
  queryCalls: [] as Array<{ name: string; args: unknown }>,
  threads: [] as Array<{ threadId: string; title: string; busy: boolean; createdAt: number; updatedAt: number }>,
  activeStartedAt: null as number | null,
  shared: undefined as undefined | { title: string; page: Array<{ id: string; role: 'user' | 'assistant'; parts: unknown[] }>; isDone: boolean; continueCursor: string },
  shareState: 'none' as 'none' | 'active' | 'revoked',
  send: vi.fn(async () => ({ threadId: 'durable-thread', promptMessageId: 'prompt-1' })),
  rename: vi.fn(async () => ({})),
  remove: vi.fn(async () => null),
  issue: vi.fn(async () => ({ threadId: 'thread-1', shareToken: 'share-token-value' })),
  revoke: vi.fn(async () => ({ threadId: 'thread-1', revoked: true })),
  transportConstructed: 0,
  transportCalls: [] as unknown[],
  preparedBodies: [] as unknown[],
  transportError: null as Error | null,
  assistantText: 'I found a useful operation.',
  assistantParts: null as unknown[] | null,
  assistantCounter: 0,
  readCalls: [] as unknown[],
  signInModes: [] as string[],
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  SignInButton: ({ children, mode }: { children: ReactNode; mode: string }) => (
    <span data-clerk-sign-in-mode={mode} onClick={() => state.signInModes.push(mode)}>
      {children}
    </span>
  ),
}))

vi.mock('convex/react', async () => {
  const { getFunctionName } = await vi.importActual<typeof import('convex/server')>('convex/server')
  return {
    useConvexAuth: () => state.auth,
    useMutation: (reference: unknown) => {
      const name = getFunctionName(reference as never)
      return {
        'chatMessages:sendMessage': state.send,
        'chatThreads:renameThread': state.rename,
        'chatThreads:deleteThread': state.remove,
        'chatShares:issueShare': state.issue,
        'chatShares:revokeShare': state.revoke,
      }[name]
    },
    useQuery: (reference: unknown, args: unknown) => {
      const name = getFunctionName(reference as never)
      state.queryCalls.push({ name, args })
      if (args === 'skip') return undefined
      if (name === 'chatThreads:listThreads' || name === 'chatThreads:searchThreads') {
        const now = (args as { now?: number }).now
        const page = state.activeStartedAt === null || now === undefined
          ? state.threads
          : state.threads.map((thread) => ({
              ...thread,
              busy: state.activeStartedAt !== null && state.activeStartedAt > now - 10 * 60 * 1_000,
            }))
        return { page, isDone: true, continueCursor: '' }
      }
      if (name === 'chatShares:getShareState') return { threadId: 'thread-1', state: state.shareState }
      if (name === 'chatShares:listSharedMessages') return state.shared
      return undefined
    },
  }
})

vi.mock('@convex-dev/agent/react', () => ({
  useUIMessages: (...args: unknown[]) => {
    state.uiMessageCalls.push(args)
    return { results: state.durableResults, status: 'Exhausted', loadMore: vi.fn() }
  },
}))

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    private readonly options: Record<string, unknown>

    constructor(options: Record<string, unknown>) {
      this.options = options
      state.transportConstructed += 1
    }

    async sendMessages(args: Record<string, unknown>) {
      state.transportCalls.push(args)
      if (state.transportError !== null) throw state.transportError
      const prepare = this.options.prepareSendMessagesRequest as ((value: Record<string, unknown>) => { body: unknown })
      state.preparedBodies.push(prepare({ ...args, id: args.chatId, api: this.options.api }).body)
      return new ReadableStream()
    }
  },
  readUIMessageStream: (args: unknown) => {
    state.readCalls.push(args)
    return {
      async *[Symbol.asyncIterator]() {
        state.assistantCounter += 1
        yield {
          id: `anonymous-assistant-${state.assistantCounter}`,
          role: 'assistant',
          parts: state.assistantParts ?? [{ type: 'text', text: state.assistantText }],
        }
      },
    }
  },
}))

import { api } from '../../../convex/_generated/api'
import { ChatTranscript } from '@/components/ae/operation-chat/ChatTranscript'
import { OperationChat } from '@/components/ae/operation-chat/OperationChat'
import {
  anonymousRequestSize,
  CHAT_TOOL_IDS,
  friendlyChatError,
  projectAnonymousTranscript,
} from '@/components/ae/operation-chat/presentation'
import { SharedOperationChat } from '@/components/ae/operation-chat/SharedOperationChat'
import { providerSafeActionToolName } from '@/modules/actions/tool-contract'

const operationRef = `operation:v1:${'a'.repeat(64)}`

function renderChat(props: Partial<React.ComponentProps<typeof OperationChat>> = {}) {
  return render(
    <OperationChat
      threadId={null}
      onThreadCreated={vi.fn()}
      onNewChat={vi.fn()}
      {...props}
    />,
  )
}

async function sendPrompt(prompt: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: prompt } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Sending message' })).toBeNull())
}

beforeEach(() => {
  state.auth = { isAuthenticated: false, isLoading: false, isRefreshing: false }
  state.durableResults = []
  state.uiMessageCalls = []
  state.queryCalls = []
  state.threads = []
  state.activeStartedAt = null
  state.shared = undefined
  state.shareState = 'none'
  state.transportConstructed = 0
  state.transportCalls = []
  state.preparedBodies = []
  state.transportError = null
  state.assistantText = 'I found a useful operation.'
  state.assistantParts = null
  state.assistantCounter = 0
  state.readCalls = []
  state.signInModes = []
  state.send.mockClear()
  state.rename.mockClear()
  state.remove.mockClear()
  state.issue.mockClear()
  state.revoke.mockClear()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('thin operation chat presentation', () => {
  it('renders exactly the five canonical operation cards and omits unknown or raw parts', () => {
    const parts = CHAT_TOOL_IDS.map((toolId) => ({
      type: `tool-${providerSafeActionToolName(toolId)}`,
      state: 'output-available',
      output: {
        kind: 'ok',
        operationRef,
        name: `${toolId} result`,
        raw: 'TOP_SECRET_RAW_PAYLOAD',
        providerMetadata: 'TOP_SECRET_PROVIDER',
      },
    }))
    render(<ChatTranscript messages={[{
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Here are the operations.' },
        ...parts,
        { type: 'tool-arbitrary_url', state: 'output-available', output: { raw: 'UNKNOWN_SECRET' } },
        { type: 'reasoning', text: 'PRIVATE_REASONING' },
        { type: 'source-url', url: 'https://private.example' },
        { type: 'file', url: 'https://private.example/file' },
      ],
    }]} />)

    expect(document.querySelectorAll('[data-operation-tool]')).toHaveLength(5)
    expect(screen.getByText('Search tools')).toBeTruthy()
    expect(screen.getByText('Tool details')).toBeTruthy()
    expect(screen.getByText('Compare tools')).toBeTruthy()
    expect(screen.getByText('Inspect before a call')).toBeTruthy()
    expect(screen.getByText('Call', { exact: true })).toBeTruthy()
    const transcript = screen.getByRole('log', { name: 'Chat transcript' })
    expect(transcript.getAttribute('aria-live')).toBe('polite')
    expect(transcript.getAttribute('aria-relevant')).toBe('additions text')
    expect(document.body.textContent).not.toContain('TOP_SECRET')
    expect(document.body.textContent).not.toContain('PRIVATE_REASONING')
    expect(document.body.textContent).not.toContain('private.example')
  })

  it('renders search titles as inspect links and never dumps execute output', () => {
    render(<ChatTranscript messages={[{
      id: 'assistant-search',
      role: 'assistant',
      parts: [
        {
          type: `tool-${providerSafeActionToolName('registry.operations.search')}`,
          state: 'output-available',
          output: {
            kind: 'ok',
            matchedCount: 1,
            items: [{
              operationRef,
              title: 'Weather finder',
              supplier: { name: 'Sky Co', slug: 'sky-co' },
              price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } },
              authentication: { kind: 'keyless' },
              availability: { posture: 'routeable' },
            }],
          },
        },
        {
          type: `tool-${providerSafeActionToolName('operation.execute')}`,
          state: 'output-available',
          output: {
            kind: 'ok',
            operationRef,
            name: 'Weather finder',
            output: { forecast: 'TOP_SECRET_RAW_PAYLOAD' },
            evidenceHash: 'TOP_SECRET_EVIDENCE',
          },
        },
      ],
    }]} />)

    const link = screen.getByRole('link', { name: 'Use Weather finder' })
    expect(link.getAttribute('href')).toBe(`/operations/${encodeURIComponent(operationRef)}`)
    expect(screen.getByRole('link', { name: 'View Weather finder' }).getAttribute('href')).toBe(
      `/operations/${encodeURIComponent(operationRef)}`,
    )
    expect(screen.getByText('Sky Co')).toBeTruthy()
    expect(screen.getByText('USD 0.50')).toBeTruthy()
    expect(screen.getByText('Ready now')).toBeTruthy()
    expect(screen.getByText('No provider key')).toBeTruthy()
    expect(screen.queryByText('Inspect operation')).toBeNull()
    expect(document.body.textContent).not.toContain('TOP_SECRET')
  })

  it('renders inspect-plan classes and compare contrasts instead of counts or a search list', () => {
    const rainRef = `operation:v1:${'f'.repeat(64)}`
    render(<ChatTranscript messages={[{
      id: 'assistant-inspect',
      role: 'assistant',
      parts: [
        {
          type: `tool-${providerSafeActionToolName('registry.operations.search')}`,
          state: 'output-available',
          output: {
            kind: 'ok',
            matchedCount: 12,
            items: [{
              operationRef,
              title: 'Weather finder',
              supplier: { name: 'Sky Co' },
              price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } },
              authentication: { kind: 'keyless' },
              availability: { posture: 'routeable' },
            }],
          },
        },
        {
          type: `tool-${providerSafeActionToolName('registry.operations.compare')}`,
          state: 'output-available',
          output: {
            kind: 'ok',
            operations: [
              {
                operationRef,
                offering: { label: 'Weather finder' },
                business: { name: 'Sky Co' },
                commercial: { price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } } },
                authentication: { kind: 'keyless' },
                availability: { posture: 'routeable' },
              },
              {
                operationRef: rainRef,
                offering: { label: 'Rain lookup' },
                business: { name: 'Nimbus' },
                commercial: { price: { kind: 'fixed', amount: { currency: 'USD', units: '75', exponent: 2 } } },
                authentication: { kind: 'x402' },
                availability: { posture: 'integrated' },
              },
            ],
            facts: [{
              field: 'price',
              values: [
                { operationRef, value: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } }, source: 'publication' },
                { operationRef: rainRef, value: { kind: 'fixed', amount: { currency: 'USD', units: '75', exponent: 2 } }, source: 'publication' },
              ],
            }],
          },
        },
        {
          type: `tool-${providerSafeActionToolName('registry.operations.inspectPlan')}`,
          state: 'output-available',
          output: {
            kind: 'ok',
            operationRefs: [operationRef],
            summary: {
              maximumCost: { kind: 'known', amount: { currency: 'USD', units: '199', exponent: 2 } },
              effects: [{ class: 'data_release' }, { class: 'financial_exposure' }],
              dataUse: [{ classification: 'public' }],
            },
          },
        },
      ],
    }]} />)

    expect(screen.getByText('Showing 1 of 12')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse market' }).getAttribute('href')).toBe('/market?window=30d')
    expect(screen.getByText('Weather finder: USD 0.50; Rain lookup: USD 0.75')).toBeTruthy()
    expect(screen.getByText('Data release, Financial exposure')).toBeTruthy()
    expect(screen.getByText('Public')).toBeTruthy()
    expect(screen.queryByText('2 declared')).toBeNull()
    expect(screen.queryByText('Inspect 1')).toBeNull()
    expect(screen.queryByText('Inspect operation')).toBeNull()
  })

  it('uses the required durable Agent query shape and skips it without validated auth', () => {
    state.auth = { isAuthenticated: true, isLoading: false, isRefreshing: false }
    const view = renderChat({ threadId: 'thread-1' })

    expect(state.uiMessageCalls.at(-1)).toEqual([
      api.chatMessages.listMessages,
      { threadId: 'thread-1' },
      { initialNumItems: 20, stream: true },
    ])

    state.auth = { isAuthenticated: false, isLoading: false, isRefreshing: false }
    view.rerender(<OperationChat threadId="thread-1" onThreadCreated={vi.fn()} onNewChat={vi.fn()} />)
    expect(state.uiMessageCalls.at(-1)).toEqual([
      api.chatMessages.listMessages,
      'skip',
      { initialNumItems: 20, stream: true },
    ])
  })

  it('offers modal sign-in only while anonymous and keeps the mounted transcript after auth', async () => {
    const view = renderChat()
    await sendPrompt('Anonymous weather question')

    const signIn = screen.getByRole('button', { name: 'Sign in' })
    expect(signIn.closest('[data-clerk-sign-in-mode]')?.getAttribute('data-clerk-sign-in-mode')).toBe('modal')
    fireEvent.click(signIn)
    expect(state.signInModes).toEqual(['modal'])

    state.auth = { isAuthenticated: true, isLoading: false, isRefreshing: false }
    view.rerender(<OperationChat threadId={null} onThreadCreated={vi.fn()} onNewChat={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(screen.getByText('Anonymous weather question')).toBeTruthy()
    expect(screen.getByText('I found a useful operation.')).toBeTruthy()
    expect(screen.getByText('Signed in — messages from here are saved.')).toBeTruthy()
  })

  it('auto-submits a signed-out initial prompt once through anonymous transport', async () => {
    const view = render(
      <StrictMode>
        <OperationChat
          threadId={null}
          initialPrompt="Homepage weather query"
          onThreadCreated={vi.fn()}
          onNewChat={vi.fn()}
        />
      </StrictMode>,
    )

    await waitFor(() => expect(state.preparedBodies).toEqual([{
      messages: [{ role: 'user', content: 'Homepage weather query' }],
    }]))
    expect((state.transportCalls[0] as { abortSignal: AbortSignal }).abortSignal.aborted).toBe(false)
    view.rerender(
      <StrictMode>
        <OperationChat
          threadId={null}
          initialPrompt="Homepage weather query"
          onThreadCreated={vi.fn()}
          onNewChat={vi.fn()}
        />
      </StrictMode>,
    )
    await waitFor(() => expect(state.transportCalls).toHaveLength(1))
  })

  it('waits for auth and auto-submits a signed-in initial prompt once without a thread', async () => {
    state.auth = { isAuthenticated: false, isLoading: true, isRefreshing: false }
    const onThreadCreated = vi.fn()
    const view = renderChat({
      threadId: 'route-thread-must-not-be-used',
      initialPrompt: 'Homepage durable query',
      onThreadCreated,
    })
    expect(state.send).not.toHaveBeenCalled()

    state.auth = { isAuthenticated: true, isLoading: false, isRefreshing: false }
    view.rerender(
      <OperationChat
        threadId="route-thread-must-not-be-used"
        initialPrompt="Homepage durable query"
        onThreadCreated={onThreadCreated}
        onNewChat={vi.fn()}
      />,
    )
    await waitFor(() => expect(state.send).toHaveBeenCalledWith({ prompt: 'Homepage durable query' }))
    expect(state.send).toHaveBeenCalledTimes(1)
    expect(onThreadCreated).toHaveBeenCalledWith('durable-thread')

    view.rerender(
      <OperationChat
        threadId="route-thread-must-not-be-used"
        initialPrompt="Homepage durable query"
        onThreadCreated={onThreadCreated}
        onNewChat={vi.fn()}
      />,
    )
    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(1))
  })

  it('sends only text roles through the standard anonymous transport and enforces bounds', async () => {
    renderChat()
    await sendPrompt('Find a weather operation')

    expect(state.transportConstructed).toBe(1)
    expect(state.readCalls).toHaveLength(1)
    expect(state.preparedBodies).toEqual([{
      messages: [{ role: 'user', content: 'Find a weather operation' }],
    }])
    expect(screen.getByText('I found a useful operation.')).toBeTruthy()

    const projected = projectAnonymousTranscript([{
      id: 'mixed',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Visible' },
        { type: 'reasoning', text: 'Hidden' },
        { type: 'tool-operation_execute', output: { secret: true } },
      ],
    }])
    expect(projected).toEqual([{ role: 'assistant', content: 'Visible' }])
    expect(anonymousRequestSize([{ id: 'one', role: 'user', parts: [{ type: 'text', text: 'hello' }] }])).toBeLessThan(16 * 1024)

    const textbox = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(textbox, { target: { value: 'x'.repeat(2_001) } })
    expect((textbox as HTMLTextAreaElement).value).toHaveLength(2_000)
    expect(screen.getByText('2000 / 2,000')).toBeTruthy()
    expect(friendlyChatError(new Error('rate_limited'))).toContain('chat limit')
    expect(friendlyChatError(new Error('thread_busy'))).toContain('already responding')
    expect(friendlyChatError(new Error('unexpected'))).toContain('temporarily unavailable')
  })

  it('carries an allowlisted anonymous transcript across the new-thread remount without persisting it', async () => {
    state.assistantParts = [
      { type: 'text', text: 'Anonymous answer' },
      {
        type: `tool-${providerSafeActionToolName('registry.operations.search')}`,
        state: 'output-available',
        output: {
          kind: 'ok',
          operationRef,
          name: 'Weather finder',
          items: [{
            operationRef,
            title: 'Weather finder',
            supplier: { name: 'Sky Co', slug: 'sky-co' },
            price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } },
            authentication: { kind: 'keyless' },
            availability: { posture: 'routeable' },
          }],
          raw: 'HANDOFF_RAW_SECRET',
          provider: 'HANDOFF_PROVIDER_SECRET',
        },
      },
      { type: 'reasoning', text: 'HANDOFF_PRIVATE_REASONING' },
      { type: 'source-url', url: 'https://private.example/source' },
      { type: 'file', url: 'https://private.example/file' },
      { type: 'tool-unknown', state: 'output-available', output: { raw: 'UNKNOWN_HANDOFF_SECRET' } },
    ]
    const onThreadCreated = vi.fn()
    const view = renderChat({ onThreadCreated })
    await sendPrompt('Anonymous question')

    state.auth = { isAuthenticated: true, isLoading: false, isRefreshing: false }
    view.rerender(<OperationChat threadId={null} onThreadCreated={onThreadCreated} onNewChat={vi.fn()} />)

    expect(screen.getByText('Anonymous question')).toBeTruthy()
    expect(screen.getByText('Anonymous answer')).toBeTruthy()
    expect(screen.getByText('Search tools')).toBeTruthy()
    expect(screen.getByText('Signed in — messages from here are saved.')).toBeTruthy()

    await sendPrompt('First saved question')
    expect(state.send).toHaveBeenCalledWith({ prompt: 'First saved question' })
    expect(JSON.stringify(state.send.mock.calls)).not.toContain('Anonymous question')
    expect(onThreadCreated).toHaveBeenCalledWith('durable-thread')

    view.unmount()
    const resumed = renderChat({ threadId: 'durable-thread' })
    expect(screen.getByText('Anonymous question')).toBeTruthy()
    expect(screen.getByText('Anonymous answer')).toBeTruthy()
    expect(screen.getByText('Search tools')).toBeTruthy()
    expect(screen.getByText('Weather finder')).toBeTruthy()
    expect(screen.getByText('Signed in — messages from here are saved.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('HANDOFF_RAW_SECRET')
    expect(document.body.textContent).not.toContain('HANDOFF_PROVIDER_SECRET')
    expect(document.body.textContent).not.toContain('HANDOFF_PRIVATE_REASONING')
    expect(document.body.textContent).not.toContain('UNKNOWN_HANDOFF_SECRET')
    expect(document.body.textContent).not.toContain('private.example')

    resumed.unmount()
    renderChat({ threadId: 'durable-thread' })
    expect(screen.queryByText('Anonymous question')).toBeNull()
    expect(screen.queryByText('Signed in — messages from here are saved.')).toBeNull()
  })

  it('makes the anonymous message ceiling visible and recovers through New chat', async () => {
    const onNewChat = vi.fn()
    renderChat({ onNewChat })
    for (let index = 0; index < 6; index += 1) await sendPrompt(`Question ${index + 1}`)

    expect(screen.getByText(/12 \/ 12 browser messages.*limit reached/)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Message' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Send message' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(onNewChat).toHaveBeenCalledOnce()
    expect(screen.getByText('0 / 12 browser messages')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Message' }).hasAttribute('disabled')).toBe(false)
  })

  it('announces friendly rate, busy, and unavailable recovery errors', async () => {
    state.transportError = new Error('{"code":"rate_limited"}')
    const anonymous = renderChat()
    await sendPrompt('Rate limited request')
    expect(screen.getByRole('alert').textContent).toContain('chat limit')
    expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('Rate limited request')

    anonymous.unmount()
    state.auth = { isAuthenticated: true, isLoading: false, isRefreshing: false }
    state.send.mockRejectedValueOnce(new Error('thread_busy'))
    const durable = renderChat({ threadId: 'thread-1' })
    await sendPrompt('Busy request')
    expect(screen.getByRole('alert').textContent).toContain('already responding')
    expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe('Busy request')

    durable.unmount()
    state.auth = { isAuthenticated: false, isLoading: false, isRefreshing: false }
    state.transportError = new Error('chat_unavailable')
    renderChat()
    await sendPrompt('Unavailable request')
    expect(screen.getByRole('alert').textContent).toContain('temporarily unavailable')
  })

  it('lists, searches, renames, confirms deletion, and issues, copies, and revokes shares', async () => {
    state.auth = { isAuthenticated: true, isLoading: false, isRefreshing: false }
    state.shareState = 'active'
    state.threads = [{
      threadId: 'thread-1',
      title: 'Weather operations',
      busy: false,
      createdAt: 1,
      updatedAt: 2,
    }]
    renderChat({ threadId: 'thread-1', onOpenThread: vi.fn() })

    expect(screen.getByText('Weather operations')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search conversations' }), { target: { value: 'weather' } })
    expect(state.queryCalls.some((call) => call.name === 'chatThreads:searchThreads'
      && (call.args as { query?: string }).query === 'weather')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Rename Weather operations' }))
    const title = screen.getByRole('textbox', { name: 'Conversation title' })
    fireEvent.change(title, { target: { value: 'Weather tools' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.rename).toHaveBeenCalledWith({ threadId: 'thread-1', title: 'Weather tools' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete Weather operations' }))
    expect(screen.getByText('Delete “Weather operations”?')).toBeTruthy()
    expect(state.remove).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByText('Delete “Weather operations”?').parentElement as HTMLElement).getByRole('button', { name: 'Delete conversation' }))
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith({ threadId: 'thread-1' }))

    fireEvent.click(screen.getByRole('button', { name: 'Get share link' }))
    await waitFor(() => expect(state.issue).toHaveBeenCalledWith({ threadId: 'thread-1' }))
    const absoluteShareUrl = new URL('/s/share-token-value', window.location.origin).toString()
    expect(screen.getByDisplayValue(absoluteShareUrl)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(absoluteShareUrl))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke share link' }))
    await waitFor(() => expect(state.revoke).toHaveBeenCalledWith({ threadId: 'thread-1' }))
  })

  it('keeps an absolute share URL selectable when clipboard copy fails', async () => {
    state.auth = { isAuthenticated: true, isLoading: false, isRefreshing: false }
    const writeText = vi.fn(async () => {
      throw new Error('clipboard unavailable')
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderChat({ threadId: 'thread-1' })

    fireEvent.click(screen.getByRole('button', { name: 'Create share link' }))
    const absoluteShareUrl = new URL('/s/share-token-value', window.location.origin).toString()
    const shareInput = await screen.findByDisplayValue(absoluteShareUrl)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(absoluteShareUrl))
    expect(screen.getByRole('alert').textContent).toContain('Select the link and copy it manually.')
    expect((shareInput as HTMLInputElement).value).toBe(absoluteShareUrl)
  })

  it('refreshes stale busy state every 30 seconds so deletion recovers without a remount', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-08-24T00:00:00.000Z').getTime()
    vi.setSystemTime(startedAt)
    state.auth = { isAuthenticated: true, isLoading: false, isRefreshing: false }
    state.activeStartedAt = startedAt
    state.threads = [{
      threadId: 'thread-1',
      title: 'Busy operations',
      busy: true,
      createdAt: 1,
      updatedAt: 2,
    }]
    const view = renderChat({ threadId: 'thread-1' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Busy operations' }))
    const confirmation = within(screen.getByText('Delete “Busy operations”?').parentElement as HTMLElement)
    expect(confirmation.getByRole('button', { name: 'Delete conversation' }).hasAttribute('disabled')).toBe(true)

    // Async stepping lets React flush between interval firings; a fully
    // synchronous advance starves the scheduler once cross-30s UI hooks land.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1_000 + 30_000)
    })
    expect(confirmation.getByRole('button', { name: 'Delete conversation' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(confirmation.getByRole('button', { name: 'Delete conversation' }))
    await act(async () => Promise.resolve())
    expect(state.remove).toHaveBeenCalledWith({ threadId: 'thread-1' })

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('renders descending shared results chronologically without mutating them or exposing raw payloads', () => {
    state.shared = {
      title: 'Shared weather chat',
      isDone: true,
      continueCursor: '',
      page: [
        { id: 'newest', role: 'assistant', parts: [{ type: 'text', text: 'Newest settled answer' }] },
        {
          id: 'middle',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Middle operation result' },
            {
              type: 'operation-card',
              toolId: 'registry.operations.search',
              state: 'complete',
              title: 'ignored title',
              operationRefs: [operationRef],
              summary: '2 operations found',
            },
            { type: 'reasoning', text: 'SHARED_PRIVATE_REASONING' },
          ],
        },
        { id: 'oldest', role: 'user', parts: [{ type: 'text', text: 'Oldest question' }] },
      ],
    }
    const descendingIds = state.shared.page.map((message) => message.id)
    render(<SharedOperationChat shareToken="share-token" />)

    expect(screen.getByRole('heading', { name: 'Shared weather chat' })).toBeTruthy()
    expect(screen.getByText('Read-only')).toBeTruthy()
    const transcript = screen.getByRole('log', { name: 'Chat transcript' })
    expect(transcript.textContent?.indexOf('Oldest question')).toBeLessThan(
      transcript.textContent?.indexOf('Middle operation result') ?? -1,
    )
    expect(transcript.textContent?.indexOf('Middle operation result')).toBeLessThan(
      transcript.textContent?.indexOf('Newest settled answer') ?? -1,
    )
    expect(screen.getByText('Search tools')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull()
    expect(document.body.textContent).not.toContain('SHARED_PRIVATE_REASONING')
    expect(state.shared.page.map((message) => message.id)).toEqual(descendingIds)
    expect(state.queryCalls).toContainEqual({
      name: 'chatShares:listSharedMessages',
      args: { shareToken: 'share-token', paginationOpts: { cursor: null, numItems: 20 } },
    })
  })

  it('supports Enter submit, Shift+Enter newline, labels, live regions, and 44px control contracts', async () => {
    renderChat()
    const textbox = screen.getByRole('textbox', { name: 'Message' })
    const send = screen.getByRole('button', { name: 'Send message' })
    expect(textbox.className).toContain('min-h-touch')
    expect(send.className).toContain('min-h-touch')
    expect(send.className).toContain('min-w-touch')
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.querySelector('[role="status"][aria-live="polite"]')).toBeTruthy()

    fireEvent.change(textbox, { target: { value: 'line one' } })
    fireEvent.keyDown(textbox, { key: 'Enter', shiftKey: true })
    expect(state.transportCalls).toHaveLength(0)

    fireEvent.keyDown(textbox, { key: 'Enter', shiftKey: false })
    await waitFor(() => expect(state.transportCalls).toHaveLength(1))
  })
})
