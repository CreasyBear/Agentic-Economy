// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  sendMessagesMock,
  readUIMessageStreamMock,
  rememberHandoffMock,
  clearHandoffMock,
  readHandoffMock,
  sendMessageMutationMock,
  authStateRef,
  useQueryCallsRef,
} = vi.hoisted(() => ({
  sendMessagesMock: vi.fn(),
  readUIMessageStreamMock: vi.fn(),
  rememberHandoffMock: vi.fn(),
  clearHandoffMock: vi.fn(),
  readHandoffMock: vi.fn((_threadId: string) => [] as readonly {
    id: string
    role: 'user' | 'assistant'
    parts: { type: string; text?: string }[]
  }[]),
  sendMessageMutationMock: vi.fn(async () => ({ threadId: 'thread-created' })),
  authStateRef: { current: { isAuthenticated: false, isLoading: false } },
  useQueryCallsRef: { current: [] as unknown[][] },
}))

vi.mock('@convex-dev/agent/react', () => ({
  useUIMessages: () => ({ results: [], status: 'Exhausted' }),
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => authStateRef.current,
  useQuery: (...args: unknown[]) => {
    useQueryCallsRef.current.push(args)
    return undefined
  },
  usePaginatedQuery: (...args: unknown[]) => {
    useQueryCallsRef.current.push(args)
    return { results: [], status: 'Exhausted', loadMore: vi.fn() }
  },
  useMutation: () => sendMessageMutationMock,
}))

vi.mock('ai', () => ({
  DefaultChatTransport: vi.fn().mockImplementation(function DefaultChatTransportMock() {
    return { sendMessages: sendMessagesMock }
  }),
  readUIMessageStream: (...args: unknown[]) => readUIMessageStreamMock(...args),
}))

vi.mock('../presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../presentation')>()
  return {
    ...actual,
    readAnonymousChatHandoff: (threadId: string) => readHandoffMock(threadId),
    rememberAnonymousChatHandoff: (...args: Parameters<typeof rememberHandoffMock>) => rememberHandoffMock(...args),
    clearAnonymousChatHandoff: (...args: Parameters<typeof clearHandoffMock>) => clearHandoffMock(...args),
  }
})

import { useChatSession } from './useChatSession'
import { readAnonymousSession, saveAnonymousSession } from './anonymous-session'

const baseProps = {
  threadId: null as string | null,
  onThreadCreated: vi.fn(),
  onNewChat: vi.fn(),
}


async function* threeChunkStream() {
  yield { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'alpha' }] }
  yield { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'alpha beta' }] }
  yield { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'alpha beta gamma' }] }
}

async function* singleAssistantStream(text: string) {
  yield { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text }] }
}

describe('useChatSession', () => {
  beforeEach(() => {
    authStateRef.current = { isAuthenticated: false, isLoading: false }
    useQueryCallsRef.current = []
    sendMessagesMock.mockReset()
    readUIMessageStreamMock.mockReset()
    rememberHandoffMock.mockReset()
    clearHandoffMock.mockReset()
    readHandoffMock.mockReturnValue([])
    sendMessageMutationMock.mockReset()
    sendMessageMutationMock.mockResolvedValue({ threadId: 'thread-created' })
    readUIMessageStreamMock.mockImplementation(() => threeChunkStream())
    sendMessagesMock.mockResolvedValue({ stream: 'mock' })
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fills and focuses suggestions and prior questions without sending them', async () => {
    const input = document.createElement('textarea')
    input.id = 'tool-chat-prompt'
    document.body.append(input)
    try {
      const { result } = renderHook(() => useChatSession(baseProps))
      act(() => result.current.transcript.onSuggest?.('Compare weather tools'))
      expect(result.current.composer.prompt).toBe('Compare weather tools')
      expect(document.activeElement).toBe(input)
      expect(sendMessagesMock).not.toHaveBeenCalled()
      readUIMessageStreamMock.mockImplementation(() => singleAssistantStream('done'))
      await act(async () => result.current.transcript.onEditQuestion?.('Find Sydney weather'))
      expect(sendMessagesMock).not.toHaveBeenCalled()
      expect(sendMessageMutationMock).not.toHaveBeenCalled()
      expect(result.current.composer.prompt).toBe('Find Sydney weather')
      expect(document.activeElement).toBe(input)
    } finally {
      input.remove()
    }
  })

  it('does not start an authenticated turn when editing a prior question', () => {
    authStateRef.current = { isAuthenticated: true, isLoading: false }
    const { result } = renderHook(() => useChatSession(baseProps))
    act(() => result.current.transcript.onEditQuestion?.('Find Sydney weather'))
    expect(result.current.composer.prompt).toBe('Find Sydney weather')
    expect(sendMessageMutationMock).not.toHaveBeenCalled()
  })

  it('loads the signed next page in the same thread without exposing its cursor or clearing a draft', async () => {
    authStateRef.current = { isAuthenticated: true, isLoading: false }
    const { result } = renderHook(() => useChatSession({ ...baseProps, threadId: 'thread-owned' }))
    act(() => result.current.composer.onPromptChange('A draft for another question'))
    act(() => result.current.transcript.onContinueSearch?.({
      action: 'next-page', authority: 'public', args: { query: 'weather', cursor: 'sc1.private-cursor' },
    }))
    await waitFor(() => expect(sendMessageMutationMock).toHaveBeenCalledOnce())
    expect(sendMessageMutationMock).toHaveBeenCalledWith(expect.objectContaining({
      threadId: 'thread-owned',
      prompt: 'Show more results for weather',
      continuation: { kind: 'search_next_page', query: 'weather', cursor: 'sc1.private-cursor' },
    }))
    expect(result.current.composer.prompt).toBe('A draft for another question')
  })

  it('preserves exact Quote input when the signed turn fails before acceptance', async () => {
    authStateRef.current = { isAuthenticated: true, isLoading: false }
    sendMessageMutationMock.mockRejectedValueOnce(new Error('chat_transport_unavailable'))
    const { result } = renderHook(() => useChatSession({ ...baseProps, threadId: 'thread-owned' }))
    let accepted: boolean | undefined
    await act(async () => {
      accepted = await result.current.transcript.onQuoteTool?.(
        `operation:v1:${'a'.repeat(64)}`, { city: 'Sydney' },
      )
    })
    expect(accepted).toBe(false)
    expect(result.current.composer.error).not.toBe('')
    expect(sendMessageMutationMock).toHaveBeenCalledWith(expect.objectContaining({
      threadId: 'thread-owned',
      prompt: expect.stringContaining('\"city\":\"Sydney\"'),
    }))
  })

  it('never reroutes a private thread message into an anonymous session during auth reconnect', async () => {
    const { result } = renderHook(() => useChatSession({ ...baseProps, threadId: 'thread-owned' }))
    act(() => result.current.composer.onPromptChange('Keep this draft private'))
    await act(async () => result.current.composer.onSubmit())
    expect(sendMessagesMock).not.toHaveBeenCalled()
    expect(sendMessageMutationMock).not.toHaveBeenCalled()
    expect(result.current.composer.prompt).toBe('Keep this draft private')
    expect(result.current.composer.error).not.toBe('')
  })

  it('admits one anonymous transport call when submit repeats before busy settles', async () => {
    let resolveSend: (() => void) | undefined
    sendMessagesMock.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        resolveSend = resolve
      })
      return { stream: 'mock' }
    })
    readUIMessageStreamMock.mockImplementation(() => singleAssistantStream('done'))

    const { result } = renderHook(() => useChatSession(baseProps))
    act(() => {
      result.current.composer.onPromptChange('Find weather Operations')
    })
    await act(async () => {
      result.current.composer.onSubmit()
      result.current.composer.onSubmit()
    })

    await waitFor(() => expect(sendMessagesMock).toHaveBeenCalledTimes(1))
    await act(async () => {
      resolveSend?.()
    })
  })

  it('appends three streamed chunks under one assistant message id', async () => {
    const { result } = renderHook(() => useChatSession(baseProps))
    act(() => {
      result.current.composer.onPromptChange('Hello')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    await waitFor(() => {
      expect(result.current.transcript.messages.filter((message) => message.role === 'assistant')).toHaveLength(1)
    })
    const assistantMessages = result.current.transcript.messages.filter((message) => message.role === 'assistant')
    expect(assistantMessages[0]?.parts[0]).toMatchObject({ type: 'text', text: 'alpha beta gamma' })
  })

  it('restores a guest exchange after reload without resending the URL question', async () => {
    readUIMessageStreamMock.mockImplementation(() => singleAssistantStream('The provider says weather forecasts are available. Health is not yet verified.'))
    const props = { ...baseProps, initialPrompt: 'find Sydney weather' }
    const first = renderHook(() => useChatSession(props))
    await waitFor(() => expect(first.result.current.transcript.messages).toHaveLength(2))
    expect(first.result.current.transcript.messages[1]?.parts).toMatchObject([{ type: 'text', text: expect.stringContaining('not yet verified') }])
    expect(sendMessagesMock).toHaveBeenCalledTimes(1)
    first.unmount()

    const reloaded = renderHook(() => useChatSession(props))
    await waitFor(() => expect(reloaded.result.current.transcript.messages).toHaveLength(2))
    expect(reloaded.result.current.transcript.messages[0]?.parts).toMatchObject([{ type: 'text', text: 'find Sydney weather' }])
    expect(sendMessagesMock).toHaveBeenCalledTimes(1)
  })

  it('bounds tab history and excludes raw tool output and credential text', () => {
    const id = '12345678-1234-1234-1234-123456789012'
    saveAnonymousSession(sessionStorage, {
      id,
      messages: Array.from({ length: 20 }, (_, index) => ({
        id: `guest-${index}`,
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        parts: [
          { type: 'text', text: `weather ${index} bearer abc123secret456 api_key=verysecretvalue` },
          { type: 'tool-call', output: { privateKey: 'never-store-this' } },
        ],
      })),
    })
    const stored = sessionStorage.getItem(`ae.chat.anonymous.${id}`)!
    expect(stored).not.toContain('abc123secret456')
    expect(stored).not.toContain('verysecretvalue')
    expect(stored).not.toContain('never-store-this')
    expect(new TextEncoder().encode(stored).byteLength).toBeLessThanOrEqual(16 * 1024)
    expect(readAnonymousSession(sessionStorage).messages).toHaveLength(12)
  })
  it('continues an anonymous conversation when browser storage is denied or full', async () => {
    const storage = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => { throw new DOMException('Storage access denied', 'SecurityError') },
    })
    try {
      const { result } = renderHook(() => useChatSession(baseProps))
      act(() => result.current.composer.onPromptChange('convert time between timezones'))
      await act(async () => result.current.composer.onSubmit())
      expect(result.current.transcript.messages.map(message => message.role)).toEqual(['user', 'assistant'])
    } finally {
      if (storage !== undefined) Object.defineProperty(window, 'sessionStorage', storage)
    }
    const full: Storage = {
      length: 0,
      key: () => null,
      clear: () => { throw new DOMException('Storage access denied', 'SecurityError') },
      getItem: () => null,
      setItem: () => { throw new DOMException('Storage quota exceeded', 'QuotaExceededError') },
      removeItem: () => { throw new DOMException('Storage access denied', 'SecurityError') },
    }
    expect(() => saveAnonymousSession(full, { id: crypto.randomUUID(), messages: [] })).not.toThrow()
  })

  it('keeps optimistic messages when anonymous streaming aborts', async () => {
    readUIMessageStreamMock.mockImplementation(async function* () {
      yield { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'partial' }] }
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    })

    const { result } = renderHook(() => useChatSession(baseProps))
    act(() => {
      result.current.composer.onPromptChange('Hello')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    await waitFor(() => {
      expect(result.current.transcript.messages.some((message) => message.role === 'user')).toBe(true)
      expect(result.current.transcript.messages.some((message) => message.role === 'assistant')).toBe(true)
    })
  })

  it('rolls back anonymous messages on non-abort transport failures', async () => {
    readUIMessageStreamMock.mockImplementation(() => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('chat_unavailable')),
      }),
    }))

    const { result } = renderHook(() => useChatSession(baseProps))
    act(() => {
      result.current.composer.onPromptChange('Hello')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    await waitFor(() => {
      expect(result.current.transcript.messages).toHaveLength(0)
      expect(result.current.composer.error.length).toBeGreaterThan(0)
    })
  })


  it('remembers anonymous handoff exactly once when auth send creates a thread', async () => {
    const { result, rerender } = renderHook(() => useChatSession(baseProps))
    act(() => {
      result.current.composer.onPromptChange('anonymous carry')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    await waitFor(() => {
      expect(result.current.transcript.messages.length).toBeGreaterThan(0)
    })

    authStateRef.current = { isAuthenticated: true, isLoading: false }
    rerender()
    act(() => {
      result.current.composer.onPromptChange('signed in')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    await waitFor(() => expect(rememberHandoffMock).toHaveBeenCalledTimes(1))

    sendMessageMutationMock.mockResolvedValueOnce({ threadId: 'thread-created-2' })
    act(() => {
      result.current.composer.onPromptChange('signed in again')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    await waitFor(() => expect(sendMessageMutationMock).toHaveBeenCalledTimes(2))
    expect(rememberHandoffMock).toHaveBeenCalledTimes(1)
  })

  it('blocks anonymous sends once the browser message limit is reached', async () => {
    readUIMessageStreamMock.mockImplementation(() => singleAssistantStream('ok'))

    const { result } = renderHook(() => useChatSession(baseProps))
    for (let index = 0; index < 6; index += 1) {
      act(() => {
        result.current.composer.onPromptChange(`msg-${index}`)
      })
      await act(async () => {
        result.current.composer.onSubmit()
      })
      await waitFor(() => {
        expect(result.current.transcript.messages.length).toBeGreaterThanOrEqual((index + 1) * 2)
      })
    }

    expect(result.current.composer.anonymousMessageLimitReached).toBe(true)
    sendMessagesMock.mockClear()
    act(() => {
      result.current.composer.onPromptChange('blocked')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    expect(sendMessagesMock).not.toHaveBeenCalled()
  })

  it('aborts anonymous streaming on unmount, new chat, and auth flip', async () => {
    const captured: AbortSignal[] = []
    sendMessagesMock.mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => {
      captured.push(abortSignal)
      return new Promise((_, reject) => {
        const abort = () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        }
        if (abortSignal.aborted) {
          abort()
          return
        }
        abortSignal.addEventListener('abort', abort, { once: true })
      })
    })

    const { result, unmount, rerender } = renderHook(() => useChatSession(baseProps))
    act(() => {
      result.current.composer.onPromptChange('hold')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    await waitFor(() => expect(captured[0]?.aborted).toBe(false))

    act(() => {
      result.current.header.onNewChat()
    })
    expect(captured[0]?.aborted).toBe(true)
    await waitFor(() => expect(result.current.composer.busy).toBe(false))

    act(() => {
      result.current.composer.onPromptChange('again')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    await waitFor(() => expect(captured.at(-1)?.aborted).toBe(false))
    const second = captured.at(-1)

    authStateRef.current = { isAuthenticated: true, isLoading: false }
    rerender()
    expect(second?.aborted).toBe(true)
    await waitFor(() => expect(result.current.composer.busy).toBe(false))

    authStateRef.current = { isAuthenticated: false, isLoading: false }
    rerender()
    act(() => {
      result.current.composer.onPromptChange('third')
    })
    await act(async () => {
      result.current.composer.onSubmit()
    })
    await waitFor(() => expect(captured.at(-1)).toBeDefined())
    const third = captured.at(-1)
    unmount()
    expect(third?.aborted).toBe(true)
  })
})
