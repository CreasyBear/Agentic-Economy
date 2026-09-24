import { useUIMessages } from '@convex-dev/agent/react'
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from 'ai'
import { useServerFn } from '@tanstack/react-start'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { createElement, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { enableOwnerChatSpendingServer } from '@/modules/agent-access/agent-access.functions'

import { useStickyRows } from '@/components/ui/data-state'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

import type { ChatProps, ChatHistoryThread, ChatSessionModel } from './chat-session.contracts'
import { projectOwnerChatCards } from './owner-chat-cards'
import { ChatHistory } from './components/ChatHistory'
import {
  assistantTurnStarted, boundPrompt, clearAnonymousSession, messageId,
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

const MAX_PROMPT_CHARACTERS = 2_000
const MAX_ANONYMOUS_MESSAGES = 12
const MAX_ANONYMOUS_BYTES = 16 * 1024
const PAGE_SIZE = 20

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
  const [historySearch, setHistorySearch] = useState('')
  const [sharePath, setSharePath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [approvalProblem, setApprovalProblem] = useState('')
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
  const startTurn = useMutation(api.chatTurns.startTurn)
  const decideApproval = useMutation(api.capabilityCalls.decideCallApproval)
  const enableOwnerChat = useServerFn(enableOwnerChatSpendingServer)
  const grantStatus = useQuery(api.chatTurns.ownerChatGrantStatus, isAuthenticated ? {} : 'skip')
  const serverCards = useQuery(api.chatCall.readOwnerChatCards,
    isAuthenticated && threadId !== null ? { threadId } : 'skip')
  const renameThread = useMutation(api.chatThreads.renameThread)
  const deleteThread = useMutation(api.chatThreads.deleteThread)
  const issueShare = useMutation(api.chatShares.issueShare)
  const revokeShare = useMutation(api.chatShares.revokeShare)

  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({
    api: '/api/chat/anonymous',
    fetch: fetchAnonymousChat,
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
      const session = readAnonymousSession(window.sessionStorage)
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
    saveAnonymousSession(window.sessionStorage, {
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
  const threadRows: readonly ChatHistoryThread[] | undefined = (searchedThreads ?? listedThreads)?.page?.filter((row: unknown): row is ChatHistoryThread =>
    typeof row === 'object' && row !== null
    && 'threadId' in row && typeof row.threadId === 'string'
    && 'title' in row && typeof row.title === 'string'
    && 'busy' in row && typeof row.busy === 'boolean')
  const threadsPage = useStickyRows(threadRows)
  const historyPending = isAuthenticated && !threadsPage.everCached
  const threads = threadsPage.shown
  const savedTitle = activeThread?.title ?? (threadId === null ? null : threads.find((thread) => thread.threadId === threadId)?.title)
  const firstUserMessage = savedTitle ? undefined : visibleMessages.find((message) => message.role === 'user')
  const threadTitle = savedTitle ?? (firstUserMessage === undefined ? null : textFromParts(firstUserMessage.parts).trim())
  const transcriptPending = isAuthenticated
    && threadId !== null
    && durable.status === 'LoadingFirstPage'
    && durable.results.length === 0
  const anonymousMessageLimitReached = !isAuthenticated
    && anonymousMessages.length + 2 > MAX_ANONYMOUS_MESSAGES
  const composerDisabled = busy || authLoading || anonymousMessageLimitReached

  async function sendAnonymous(nextPrompt: string): Promise<void> {
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

  async function submit(forceNewThread = false, rawPrompt = prompt): Promise<void> {
    const nextPrompt = rawPrompt.trim()
    if (nextPrompt.length === 0) {
      setError('Enter a message before sending.')
      return
    }
    if (unicodeLength(nextPrompt) > MAX_PROMPT_CHARACTERS) {
      setError('Messages can be at most 2,000 characters.')
      return
    }
    if (operationInFlightRef.current) return
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
        })
        setPrompt('')
        setStatus('Message sent.')
        if (result.threadId !== threadId) {
          if (!handoffStoredRef.current && anonymousMessages.length > 0) {
            handoffStoredRef.current = true
            rememberAnonymousChatHandoff(result.threadId, anonymousMessages)
          }
          onThreadCreated(result.threadId)
        }
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
        const failure = projectChatFailure(caught)
        setError(failure.message)
        setErrorReference(failure.reference)
        setBrowseMarketOnError(failure.browseMarket)
      }
      setStatus('')
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
      clearAnonymousSession(window.sessionStorage, anonymousSessionIdRef.current)
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

  function createHistoryPanel(idPrefix: string): ReactNode {
    return createElement(ChatHistory, {
      idPrefix,
      activeThreadId: threadId,
      threads,
      search: historySearch,
      busy,
      ...(historyPending ? { historyPending: true } : {}),
      onSearch: setHistorySearch,
      onOpen: onOpenThread,
      onNewChat: startNewChat,
      onRename: async (targetThreadId, title) => await mutateWithError(async () => {
        await renameThread({ threadId: targetThreadId, title })
      }, 'Conversation renamed.'),
      onDelete: async (targetThreadId) => await mutateWithError(async () => {
        await deleteThread({ threadId: targetThreadId })
        if (targetThreadId === threadId) onNewChat()
      }, 'Conversation deleted.'),
    })
  }

  const ownerChatCards = projectOwnerChatCards(serverCards, now, approvalBusy)

  async function decideOwnerCall(callRef: string, decision: 'approve' | 'deny'): Promise<void> {
    if (approvalBusy) return
    setApprovalBusy(true)
    setApprovalProblem('')
    try {
      const result = await decideApproval({ callRef, decision })
      if (result.kind === 'refused') {
        setApprovalProblem(result.code === 'mfa_reverification_required'
          ? 'Verify it is you in Account security, then approve this Call again.'
          : `Call decision refused: ${result.code}. Request a fresh Quote or check Call status.`)
        return
      }
      setStatus(decision === 'approve' ? 'Call approved. Checking its result.' : 'Call declined; it was not dispatched.')
      if (decision === 'deny') document.getElementById('tool-chat-prompt')?.focus()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setApprovalProblem('Could not decide this Call. Check its status before trying again.')
    } finally {
      setApprovalBusy(false)
    }
  }

  return {
    showHistoryRail: isAuthenticated,
    createHistoryPanel,
    header: {
      authenticated: isAuthenticated,
      threadTitle,
      threadId,
      busy,
      ...(shareState === undefined ? {} : { shareState: shareState.state }),
      ownerChatEnabled: grantStatus?.enabled === true,
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
      ownerChatCards,
      approvalProblem,
      onApproveCall: (callRef) => { void decideOwnerCall(callRef, 'approve') },
      onDenyCall: (callRef) => { void decideOwnerCall(callRef, 'deny') },
      onFreshQuote: (callRef) => {
        const card = ownerChatCards.find(value => value.kind === 'pending'
          ? value.view.callRef === callRef : value.kind === 'unavailable' && value.callRef === callRef)
        if (card?.kind === 'pending' || card?.kind === 'unavailable') {
          const toolName = card.kind === 'pending' ? card.view.toolName : card.toolName
          const inputSummary = card.kind === 'pending' ? card.view.inputSummary : card.inputSummary
          setPrompt(boundPrompt(`Get a fresh Quote for ${toolName} with input ${inputSummary}`))
          document.getElementById('tool-chat-prompt')?.focus()
        }
      },
      thinking: (sending || activeThread?.busy === true) && !assistantTurnStarted(visibleMessages),
      generating: activeThread?.busy === true,
      clarifyDisabled: composerDisabled,
      onClarifyAnswer: (answer) => { void submit(false, answer) },
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
        onRetry: (previousPrompt) => { void submit(false, previousPrompt) },
      }),
    },
    pageBusy: busy,
  }
}
