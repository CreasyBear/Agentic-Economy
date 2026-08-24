import { useUIMessages } from '@convex-dev/agent/react'
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from 'ai'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import { api } from '../../../../convex/_generated/api'

import { ChatTranscript } from './ChatTranscript'
import { OperationChatHeader } from './OperationChatHeader'
import { OperationComposer } from './OperationComposer'
import { OperationHistory } from './OperationHistory'
import {
  anonymousRequestSize,
  friendlyChatError,
  projectAnonymousTranscript,
  type TranscriptMessage,
} from './presentation'

const MAX_PROMPT_CHARACTERS = 2_000
const MAX_ANONYMOUS_MESSAGES = 12
const MAX_ANONYMOUS_BYTES = 16 * 1024
const PAGE_SIZE = 20

type AnonymousMessage = TranscriptMessage & { role: 'user' | 'assistant' }

export type OperationChatProps = Readonly<{
  threadId: string | null
  initialPrompt?: string
  onThreadCreated(threadId: string): void
  onNewChat(): void
  onOpenThread?(threadId: string): void
}>

function unicodeLength(value: string): number {
  return Array.from(value).length
}

function boundPrompt(value: string): string {
  return Array.from(value).slice(0, MAX_PROMPT_CHARACTERS).join('')
}

function toTransportMessages(messages: readonly TranscriptMessage[]): UIMessage[] {
  return projectAnonymousTranscript(messages).map((message, index) => ({
    id: `anonymous-transport-${index}`,
    role: message.role,
    parts: [{ type: 'text', text: message.content }],
  }))
}

function messageId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}

export function OperationChat({
  threadId,
  initialPrompt = '',
  onThreadCreated,
  onNewChat,
  onOpenThread = onThreadCreated,
}: OperationChatProps) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const [prompt, setPrompt] = useState(() => boundPrompt(initialPrompt))
  const [anonymousMessages, setAnonymousMessages] = useState<AnonymousMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [sharePath, setSharePath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now] = useState(() => Date.now())
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)
  const initialSubmitPendingRef = useRef(initialPrompt.trim().length > 0)

  const durable = useUIMessages(
    api.chatMessages.listMessages,
    isAuthenticated && threadId !== null ? { threadId } : 'skip',
    { initialNumItems: PAGE_SIZE, stream: true },
  )
  const listedThreads = useQuery(
    api.chatThreads.listThreads,
    isAuthenticated && historySearch.trim().length === 0
      ? { paginationOpts: { cursor: null, numItems: PAGE_SIZE }, now }
      : 'skip',
  )
  const searchedThreads = useQuery(
    api.chatThreads.searchThreads,
    isAuthenticated && historySearch.trim().length > 0
      ? { query: historySearch, paginationOpts: { cursor: null, numItems: PAGE_SIZE }, now }
      : 'skip',
  )
  const shareState = useQuery(
    api.chatShares.getShareState,
    isAuthenticated && threadId !== null ? { threadId } : 'skip',
  )
  const sendMessage = useMutation(api.chatMessages.sendMessage)
  const renameThread = useMutation(api.chatThreads.renameThread)
  const deleteThread = useMutation(api.chatThreads.deleteThread)
  const issueShare = useMutation(api.chatShares.issueShare)
  const revokeShare = useMutation(api.chatShares.revokeShare)

  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({
    api: '/api/chat/anonymous',
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        messages: projectAnonymousTranscript(messages.map((message) => ({
          id: message.id,
          role: message.role === 'assistant' ? 'assistant' : 'user',
          parts: message.parts,
        }))),
      },
    }),
  }), [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (isAuthenticated) abortRef.current?.abort()
  }, [isAuthenticated])

  const durableMessages: TranscriptMessage[] = durable.results.flatMap((message) =>
    message.role === 'user' || message.role === 'assistant'
      ? [{ id: message.id, role: message.role, parts: message.parts }]
      : [],
  )
  const visibleMessages = isAuthenticated
    ? [...anonymousMessages, ...durableMessages]
    : anonymousMessages
  const threads = (searchedThreads ?? listedThreads)?.page ?? []
  const anonymousMessageLimitReached = !isAuthenticated
    && anonymousMessages.length + 2 > MAX_ANONYMOUS_MESSAGES

  async function sendAnonymous(nextPrompt: string): Promise<void> {
    const userMessage: AnonymousMessage = {
      id: messageId('anonymous-user'),
      role: 'user',
      parts: [{ type: 'text', text: nextPrompt }],
    }
    const requestMessages = [...anonymousMessages, userMessage]
    if (anonymousMessages.length + 2 > MAX_ANONYMOUS_MESSAGES) {
      throw new Error('anonymous_message_limit')
    }
    if (anonymousRequestSize(requestMessages) > MAX_ANONYMOUS_BYTES) {
      throw new Error('anonymous_size_limit')
    }
    setAnonymousMessages(requestMessages)
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    try {
      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'anonymous-browser',
        messageId: undefined,
        messages: toTransportMessages(requestMessages),
        abortSignal: controller.signal,
      })
      let assistant: UIMessage | undefined
      const assistantMessageId = messageId('anonymous-assistant')
      for await (const message of readUIMessageStream({ stream, terminateOnError: true })) {
        assistant = message
        setAnonymousMessages([...requestMessages, {
          id: assistantMessageId,
          role: 'assistant',
          parts: message.parts,
        }])
      }
      if (assistant === undefined) throw new Error('chat_unavailable')
    } catch (caught) {
      if (!(caught instanceof Error) || caught.name !== 'AbortError') {
        setAnonymousMessages(anonymousMessages)
      }
      throw caught
    }
  }

  async function submit(forceNewThread = false): Promise<void> {
    const nextPrompt = prompt.trim()
    if (nextPrompt.length === 0) {
      setError('Enter a message before sending.')
      return
    }
    if (unicodeLength(nextPrompt) > MAX_PROMPT_CHARACTERS) {
      setError('Messages can be at most 2,000 characters.')
      return
    }
    setBusy(true)
    setError('')
    setStatus(isAuthenticated ? 'Sending message…' : 'Getting a response…')
    try {
      if (isAuthenticated) {
        const result = await sendMessage({
          prompt: nextPrompt,
          ...(threadId === null || forceNewThread ? {} : { threadId }),
        })
        setPrompt('')
        setStatus('Message sent.')
        if (result.threadId !== threadId) onThreadCreated(result.threadId)
      } else {
        await sendAnonymous(nextPrompt)
        setPrompt('')
        setStatus('Response complete.')
      }
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return
      if (String(caught).includes('anonymous_message_limit')) {
        setError('This browser conversation has reached its 12-message limit. Sign in or start a new chat.')
      } else if (String(caught).includes('anonymous_size_limit')) {
        setError('This browser conversation is full. Sign in or start a new chat.')
      } else {
        setError(friendlyChatError(caught))
      }
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  const autoSubmit = useEffectEvent(() => void submit(true))

  useEffect(() => {
    if (authLoading || !initialSubmitPendingRef.current) return
    initialSubmitPendingRef.current = false
    queueMicrotask(() => {
      if (mountedRef.current) autoSubmit()
    })
  }, [authLoading])

  async function mutateWithError(work: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      await work()
      setStatus(success)
      return true
    } catch (caught) {
      setError(friendlyChatError(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  function startNewChat(): void {
    abortRef.current?.abort()
    setAnonymousMessages([])
    setPrompt('')
    setError('')
    setStatus('New chat ready.')
    setSharePath(null)
    setCopied(false)
    onNewChat()
  }

  function copyShare(): void {
    if (sharePath === null) return
    if (navigator.clipboard === undefined) {
      setError('Copy failed. Select the link and copy it manually.')
      return
    }
    void navigator.clipboard.writeText(sharePath).then(() => {
      setCopied(true)
      setStatus('Share link copied.')
    }).catch(() => setError('Copy failed. Select the link and copy it manually.'))
  }

  const historyPanel = (idPrefix: string) => (
    <OperationHistory
      idPrefix={idPrefix}
      activeThreadId={threadId}
      threads={threads}
      search={historySearch}
      busy={busy}
      onSearch={setHistorySearch}
      onOpen={onOpenThread}
      onNewChat={startNewChat}
      onRename={async (targetThreadId, title) => await mutateWithError(
        async () => await renameThread({ threadId: targetThreadId, title }),
        'Conversation renamed.',
      )}
      onDelete={async (targetThreadId) => await mutateWithError(async () => {
        await deleteThread({ threadId: targetThreadId })
        if (targetThreadId === threadId) onNewChat()
      }, 'Conversation deleted.')}
    />
  )

  return (
    <section className="grid min-h-[36rem] overflow-hidden rounded-xl bg-background shadow-soft lg:grid-cols-[280px_minmax(0,1fr)]" aria-label="Operation chat">
      {isAuthenticated ? <aside className="hidden min-h-0 border-r border-border lg:block" aria-label="Conversation history">{historyPanel('desktop')}</aside> : null}
      <div className="flex min-h-0 min-w-0 flex-col">
        <OperationChatHeader
          authenticated={isAuthenticated}
          threadId={threadId}
          busy={busy}
          {...shareState === undefined ? {} : { shareState: shareState.state }}
          sharePath={sharePath}
          copied={copied}
          mobileHistory={historyPanel('mobile')}
          onNewChat={startNewChat}
          onIssueShare={() => void mutateWithError(async () => {
            if (threadId === null) return
            const result = await issueShare({ threadId })
            setSharePath(`/s/${result.shareToken}`)
          }, 'Read-only share link ready.')}
          onRevokeShare={() => void mutateWithError(async () => {
            if (threadId === null) return
            await revokeShare({ threadId })
            setSharePath(null)
          }, 'Share link revoked.')}
          onCopyShare={copyShare}
        />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-busy={busy}>
          <ChatTranscript
            messages={visibleMessages}
            {...isAuthenticated && anonymousMessages.length > 0
              ? { handoffAfter: anonymousMessages.length }
              : {}}
          />
        </div>
        <OperationComposer
          prompt={prompt}
          busy={busy}
          disabled={busy || authLoading || anonymousMessageLimitReached}
          error={error}
          status={status}
          {...isAuthenticated ? {} : { anonymousMessageCount: anonymousMessages.length }}
          anonymousMessageLimitReached={anonymousMessageLimitReached}
          onPromptChange={(value) => setPrompt(boundPrompt(value))}
          onSubmit={() => void submit()}
        />
      </div>
    </section>
  )
}
