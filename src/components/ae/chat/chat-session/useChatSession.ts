import { useAuth } from '@clerk/tanstack-react-start'
import { useUIMessages } from '@convex-dev/agent/react'
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from 'ai'
import { useServerFn } from '@tanstack/react-start'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { createElement, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { enableOwnerChatSpendingServer } from '@/modules/agent-access/agent-access.functions'
import {
  findOwnerActiveMarketDemand,
  getOwnerMarketDemandStatus,
  recordOwnerMarketDemand,
  withdrawOwnerMarketDemand,
} from '@/modules/market-demand/market-demand.functions'
import type { ChatNeedActions } from '@/modules/chat/tool-card'
import type { RegistryNextAction } from '@/modules/registry/tool-choice-contracts'

import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

import type { ChatProps, ChatSessionModel } from './chat-session.contracts'
import { ChatHistoryPanelContainer } from './ChatHistoryPanelContainer'
import {
  anonymousSessionStorage, assistantTurnStarted, boundPrompt, clearAnonymousSession, messageId,
  readAnonymousSession, saveAnonymousSession, toTransportMessages, unicodeLength,
} from './anonymous-session'
import {
  anonymousRequestSize,
  clearAnonymousChatHandoff,
  fetchAnonymousChat,
  friendlyChatError,
  projectChatFailure,
  projectAnonymousTranscript,
  readAnonymousChatHandoff,
  rememberAnonymousChatHandoff,
  textFromParts,
  type ChatStatus,
  type TranscriptMessage,
} from '../presentation'

export function useChatNeedActions(): ChatNeedActions {
  const { isSignedIn } = useAuth()
  const find = useServerFn(findOwnerActiveMarketDemand)
  const record = useServerFn(recordOwnerMarketDemand)
  const status = useServerFn(getOwnerMarketDemandStatus)
  const withdraw = useServerFn(withdrawOwnerMarketDemand)
  return {
    authenticated: isSignedIn === true,
    onFind: async (input) => await find({ data: input }),
    onSave: async (input) => await record({ data: input }),
    onStatus: async (requestRef) => await status({ data: { requestRef } }),
    onWithdraw: async (requestRef) => await withdraw({ data: { requestRef } }),
  }
}

const MAX_PROMPT_CHARACTERS = 2_000
const MAX_ANONYMOUS_MESSAGES = 12
const MAX_ANONYMOUS_BYTES = 16 * 1024
const PAGE_SIZE = 20
type SearchContinuation = Extract<RegistryNextAction, { action: 'next-page' }>['args']

export function useChatSession({
  threadId,
  initialPrompt = '',
  onThreadCreated,
  onNewChat,
  onOpenThread = onThreadCreated,
}: ChatProps): ChatSessionModel {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const [prompt, setPrompt] = useState(() => boundPrompt(initialPrompt))
  const [initialHandoff] = useState(() => {
    if (threadId === null) return { threadId: null, messages: [] as TranscriptMessage[] }
    const handoff = readAnonymousChatHandoff(threadId)
    return {
      threadId: handoff.length > 0 ? threadId : null,
      messages: handoff.map((message) => ({ ...message, parts: [...message.parts] })),
    }
  })
  const [anonymousMessages, setAnonymousMessages] = useState<TranscriptMessage[]>(initialHandoff.messages)
  const [anonymousSessionLoaded, setAnonymousSessionLoaded] = useState(false)
  const anonymousSessionIdRef = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [errorReference, setErrorReference] = useState<string | undefined>()
  const [browseMarketOnError, setBrowseMarketOnError] = useState(false)
  const [status, setStatus] = useState<ChatStatus>('')

  const [sharePath, setSharePath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const [enableProblem, setEnableProblem] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const operationInFlightRef = useRef(false)
  const mountedRef = useRef(false)
  const handoffStoredRef = useRef(false)
  const initialSubmitPendingRef = useRef(initialPrompt.trim().length > 0)

  const durable = useUIMessages(
    api.chatMessages.listMessages,
    isAuthenticated && threadId !== null ? { threadId } : 'skip',
    { initialNumItems: PAGE_SIZE, stream: true },
  )
  const activeThread = useQuery(
    api.chatThreads.getThread,
    isAuthenticated && threadId !== null ? { threadId, now } : 'skip',
  )

  const startTurn = useMutation(api.chatTurns.startTurn)

  const enableOwnerChat = useServerFn(enableOwnerChatSpendingServer)

  const renameThread = useMutation(api.chatThreads.renameThread)
  const deleteThread = useMutation(api.chatThreads.deleteThread)
  const issueShare = useMutation(api.chatShares.issueShare)
  const revokeShare = useMutation(api.chatShares.revokeShare)


  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (initialHandoff.threadId !== null) clearAnonymousChatHandoff(initialHandoff.threadId)
  }, [initialHandoff])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])
  useEffect(() => {
    if (isAuthenticated) abortRef.current?.abort()
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading || anonymousSessionLoaded) return
    if (!isAuthenticated && threadId === null) {
      const session = readAnonymousSession(anonymousSessionStorage())
      anonymousSessionIdRef.current = session.id
      setAnonymousMessages(session.messages)
      if (session.messages.some(message => message.role === 'user'
        && projectAnonymousTranscript([message])[0]?.content === initialPrompt.trim())) {
        initialSubmitPendingRef.current = false
      }
    }
    setAnonymousSessionLoaded(true)
  }, [authLoading, anonymousSessionLoaded, isAuthenticated, threadId, initialPrompt])
  useEffect(() => {
    if (!anonymousSessionLoaded || anonymousSessionIdRef.current === null || isAuthenticated) return
    saveAnonymousSession(anonymousSessionStorage(), {
      id: anonymousSessionIdRef.current,
      messages: anonymousMessages,
    })
  }, [anonymousSessionLoaded, anonymousMessages, isAuthenticated])
  const durableMessages: TranscriptMessage[] = durable.results.flatMap((message) =>
    message.role === 'user' || message.role === 'assistant'
      ? [{ id: message.id, role: message.role, parts: message.parts }]
      : [],
  )
  const visibleMessages = isAuthenticated
    ? [...anonymousMessages, ...durableMessages]
    : anonymousMessages
  const savedTitle = activeThread?.title
  const firstUserMessage = savedTitle ? undefined : visibleMessages.find((message) => message.role === 'user')
  const threadTitle = savedTitle ?? (firstUserMessage === undefined ? null : textFromParts(firstUserMessage.parts).trim())
  const transcriptPending = isAuthenticated
    && threadId !== null
    && durable.status === 'LoadingFirstPage'
    && durable.results.length === 0
  const anonymousMessageLimitReached = !isAuthenticated
    && anonymousMessages.length + 2 > MAX_ANONYMOUS_MESSAGES
  const composerDisabled = busy || authLoading || anonymousMessageLimitReached

  async function sendAnonymous(nextPrompt: string, continuation?: SearchContinuation): Promise<void> {
    const userMessage: TranscriptMessage = {
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
    const transport = new DefaultChatTransport<UIMessage>({
      api: '/api/chat/anonymous',
      fetch: fetchAnonymousChat,
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          messages: projectAnonymousTranscript(messages.map((message) => ({
            id: message.id,
            role: message.role === 'assistant' ? 'assistant' : 'user',
            parts: message.parts,
          }))),
          ...(continuation === undefined ? {} : {
            continuation: { kind: 'search_next_page' as const, ...continuation },
          }),
        },
      }),
    })
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

  async function submit(forceNewThread = false, rawPrompt = prompt, continuation?: SearchContinuation, preserveDraft = false): Promise<boolean> {
    const nextPrompt = rawPrompt.trim()
    if (nextPrompt.length === 0) {
      setError('Enter a message before sending.')
      return false
    }
    if (unicodeLength(nextPrompt) > MAX_PROMPT_CHARACTERS) {
      setError('Messages can be at most 2,000 characters.')
      return false
    }
    if (threadId !== null && !isAuthenticated) {
      setError('Reconnect to your account before sending to this conversation.')
      return false
    }
    if (continuation !== undefined && isAuthenticated && threadId === null) {
      setError('Open the conversation before loading more results.')
      return false
    }
    if (operationInFlightRef.current) return false
    operationInFlightRef.current = true
    setBusy(true)
    setSending(true)
    setError('')
    setErrorReference(undefined)
    setBrowseMarketOnError(false)
    setStatus(isAuthenticated ? 'Sending message…' : 'Getting a response…')
    try {
      if (isAuthenticated) {
        const result = await startTurn({
          principal: { kind: 'clerk' }, prompt: nextPrompt,
          clientTurnId: globalThis.crypto.randomUUID(),
          ...(threadId === null || forceNewThread ? {} : { threadId }),
          ...(continuation === undefined ? {} : {
            continuation: { kind: 'search_next_page' as const, ...continuation },
          }),
        })
        if (!preserveDraft) setPrompt('')
        setStatus('Message sent.')
        if (result.threadId !== threadId) {
          if (!handoffStoredRef.current && anonymousMessages.length > 0) {
            handoffStoredRef.current = true
            rememberAnonymousChatHandoff(result.threadId, anonymousMessages)
          }
          onThreadCreated(result.threadId)
        }
      } else {
        await sendAnonymous(nextPrompt, continuation)
        if (!preserveDraft) setPrompt('')
        setStatus('Response complete.')
      }
      return true
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return false
      if (String(caught).includes('anonymous_message_limit')) {
        setError('This browser conversation has reached its 12-message limit. Sign in or start a new chat.')
      } else if (String(caught).includes('anonymous_size_limit')) {
        setError('This browser conversation is full. Sign in or start a new chat.')
      } else {
        const failure = projectChatFailure(caught)
        setError(failure.message)
        setErrorReference(failure.reference)
        setBrowseMarketOnError(failure.browseMarket)
      }
      setStatus('')
      return false
    } finally {
      operationInFlightRef.current = false
      setBusy(false)
      setSending(false)
    }
  }

  const autoSubmit = useEffectEvent(() => void submit(true))

  useEffect(() => {
    if (authLoading || !anonymousSessionLoaded || !initialSubmitPendingRef.current) return
    initialSubmitPendingRef.current = false
    queueMicrotask(() => {
      if (mountedRef.current) autoSubmit()
    })
  }, [authLoading, anonymousSessionLoaded])

  async function mutateWithError(work: () => Promise<void>, success: ChatStatus): Promise<boolean> {
    if (operationInFlightRef.current) return false
    operationInFlightRef.current = true
    setBusy(true)
    setError('')
    setErrorReference(undefined)
    setBrowseMarketOnError(false)
    try {
      await work()
      setStatus(success)
      return true
    } catch (caught) {
      setError(friendlyChatError(caught))
      return false
    } finally {
      operationInFlightRef.current = false
      setBusy(false)
    }
  }

  function startNewChat(): void {
    abortRef.current?.abort()
    if (anonymousSessionIdRef.current !== null) {
      clearAnonymousSession(anonymousSessionStorage(), anonymousSessionIdRef.current)
      anonymousSessionIdRef.current = crypto.randomUUID()
    }
    setAnonymousMessages([])
    setPrompt('')
    setError('')
    setErrorReference(undefined)
    setBrowseMarketOnError(false)
    setStatus('New chat ready.')
    setSharePath(null)
    setCopied(false)
    onNewChat()
  }

  function copyShare(): void {
    if (sharePath === null) return
    if (navigator.clipboard === undefined) {
      setError('Copy failed. Select the link and copy it manually.')
      setErrorReference(undefined)
      setBrowseMarketOnError(false)
      return
    }
    void navigator.clipboard.writeText(sharePath).then(() => {
      setCopied(true)
      setStatus('Share link copied.')
    }).catch(() => {
      setError('Copy failed. Select the link and copy it manually.')
      setErrorReference(undefined)
      setBrowseMarketOnError(false)
    })
  }

  function createHistoryPanel(idPrefix: string, onNavigate?: () => void): ReactNode {
    return createElement(ChatHistoryPanelContainer, {
      idPrefix,
      activeThreadId: threadId,
      now,
      busy,
      onOpen: (targetThreadId: string) => { onOpenThread(targetThreadId); onNavigate?.() },
      onNewChat: () => { startNewChat(); onNavigate?.() },
      onRename: async (targetThreadId: string, title: string) => await mutateWithError(async () => {
        await renameThread({ threadId: targetThreadId, title })
      }, 'Conversation renamed.'),
      onDelete: async (targetThreadId: string) => await mutateWithError(async () => {
        await deleteThread({ threadId: targetThreadId })
        if (targetThreadId === threadId) onNewChat()
      }, 'Conversation deleted.'),
    })
  }



  return {
    showHistoryRail: isAuthenticated,
    createHistoryPanel,
    header: {
      authenticated: isAuthenticated,
      threadTitle,
      threadId,
      busy,

      enableProblem,
      onEnableSpending: () => {
        if (busy) return
        setBusy(true)
        setEnableProblem('')
        void enableOwnerChat().then(result => {
          if (result.kind === 'enabled') {
            setStatus('Approval-only chat spending enabled. Start a new conversation to use it.')
            onNewChat()
          } else {
            setEnableProblem(result.code === 'mfa_reverification_required'
              ? 'Verify it is you in Account security before enabling chat spending.'
              : `Could not enable approval-only chat: ${result.code}.`)
          }
        }).catch((cause: unknown) => {
          captureClientExceptionOnClient(cause)
          setEnableProblem('Could not enable chat spending. Try again after checking your session.')
        })
          .finally(() => setBusy(false))
      },
      sharePath,
      copied,
      onNewChat: startNewChat,
      onIssueShare: () => void mutateWithError(async () => {
        if (threadId === null) return
        const result = await issueShare({ threadId })
        setSharePath(new URL(`/s/${result.shareToken}`, window.location.origin).toString())
      }, 'Read-only share link ready.'),
      onRevokeShare: () => void mutateWithError(async () => {
        if (threadId === null) return
        await revokeShare({ threadId })
        setSharePath(null)
      }, 'Share link revoked.'),
      onCopyShare: copyShare,
    },
    composer: {
      prompt,
      busy,
      disabled: composerDisabled,
      error,
      ...(errorReference === undefined ? {} : { errorReference }),
      browseMarketOnError,
      status,
      ...(isAuthenticated ? {} : { anonymousMessageCount: anonymousMessages.length }),
      anonymousMessageLimitReached,
      ...(isAuthenticated ? {} : { onStop: () => { abortRef.current?.abort() } }),
      onPromptChange: (value) => {
        setPrompt(boundPrompt(value))
        if (error.length > 0) {
          setError('')
          setErrorReference(undefined)
          setBrowseMarketOnError(false)
        }
      },
      onSubmit: () => void submit(),
    },
    transcript: {
      messages: visibleMessages,
      ...(isAuthenticated && threadId !== null ? { ownerChatThreadId: threadId, ownerChatNow: now } : {}),
      onFreshQuote: (toolName, inputSummary) => {
        setPrompt(boundPrompt(`Get a fresh Quote for ${toolName} with input ${inputSummary}`))
        document.getElementById('tool-chat-prompt')?.focus()
      },
      thinking: (sending || activeThread?.busy === true) && !assistantTurnStarted(visibleMessages),
      generating: activeThread?.busy === true,
      clarifyDisabled: composerDisabled,
      onClarifyAnswer: (answer) => { void submit(false, answer) },
      onContinueSearch: (next) => {
        void submit(false, `Show more results for ${next.args.query}`, next.args, true)
      },
      onRepeatSearch: (query) => {
        void submit(false, `Search again for ${query}`, undefined, true)
      },
      onQuoteTool: (toolRef, input) =>
        submit(false, `Get a fresh Quote for Tool ${toolRef} with this exact JSON input: ${JSON.stringify(input)}. Use tool.quote and show the terms for my approval. Do not Call the Tool.`, undefined, true),
      ...(transcriptPending ? { pending: true } : {}),
      ...(isAuthenticated && anonymousMessages.length > 0
        ? { handoffAfter: anonymousMessages.length }
        : {}),
      onCopyAnswer: (answer) => {
        void navigator.clipboard.writeText(answer)
          .then(() => setStatus('Answer copied.'), () => setError('Copy failed. Select the answer and copy it manually.'))
      },
      ...(composerDisabled ? {} : {
        onSuggest: (nextPrompt) => { setPrompt(boundPrompt(nextPrompt)); document.getElementById('tool-chat-prompt')?.focus() },
        onStarter: (nextPrompt) => { void submit(false, nextPrompt) },
        onRefine: (nextPrompt) => { void submit(false, nextPrompt) },
        onCompareRequest: (nextPrompt) => { void submit(false, nextPrompt) },
        onEditQuestion: (previousPrompt) => {
          setPrompt(boundPrompt(previousPrompt))
          document.getElementById('tool-chat-prompt')?.focus()
        },
      }),
    },
    pageBusy: busy,
  }
}
