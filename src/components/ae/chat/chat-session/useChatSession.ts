import { useAuth } from '@clerk/tanstack-react-start'
import { useUIMessages } from '@convex-dev/agent/react'
import { useServerFn } from '@tanstack/react-start'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { createElement, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { enableOwnerChatSpendingServer } from '@/modules/agent-access/agent-access.functions'
import { startOwnerChatTurnServer } from '@/lib/server/chat-turn.functions'
import {
  findOwnerActiveMarketDemand,
  getOwnerMarketDemandStatus,
  recordOwnerMarketDemand,
  withdrawOwnerMarketDemand,
} from '@/modules/market-demand/market-demand.functions'
import type { ChatNeedActions } from '@/modules/chat/tool-card'
import { formatRunRequest, parseDetailRequest, parseRunRequest, type RunIntent } from '@/modules/chat/run-request'
import type { RegistryNextAction } from '@/modules/registry/tool-choice-contracts'

import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

import type { ChatProps, ChatRunResult, ChatSessionModel } from './chat-session.contracts'
import { sendAnonymousChatTurn } from './anonymous-chat-send'
import { ChatHistoryPanelContainer } from './ChatHistoryPanelContainer'
import {
  MAX_PROMPT_CHARACTERS,
  anonymousSessionStorage, assistantTurnStarted, clearAnonymousSession,
  promptLimitMessage, readAnonymousSession, readChatDraft, saveAnonymousSession, saveChatDraft,
  unicodeLength,
} from './anonymous-session'
import {
  clearAnonymousChatHandoff,
  friendlyChatError,
  projectChatFailure,
  projectAnonymousTranscript,
  readAnonymousChatHandoff,
  rememberAnonymousChatHandoff,
  textFromParts,
  type ChatStatus,
  type TranscriptMessage,
} from '../presentation'
import type { ChatRecoveryReason } from '../recovery/recovery.contracts'

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
  const [prompt, setPrompt] = useState(initialPrompt)
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
  const [error, setError] = useState(() => promptLimitMessage(initialPrompt))
  const [errorReference, setErrorReference] = useState<string | undefined>()
  const [browseMarketOnError, setBrowseMarketOnError] = useState(false)
  const [recovery, setRecovery] = useState<ChatRecoveryReason | 'unknown'>()
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
  const retryableClientTurnRef = useRef<Readonly<{ prompt: string; clientTurnId?: string }> | null>(null)
  const [retryableClientTurn, setRetryableClientTurn] = useState<Readonly<{ prompt: string; clientTurnId?: string }> | null>(null)
  const uncertainRunKeysRef = useRef(new Set<string>())
  const turnInFlightRef = useRef(false)
  const requestGenerationRef = useRef(0)
  function updateRetryableClientTurn(value: Readonly<{ prompt: string; clientTurnId?: string }> | null): void {
    retryableClientTurnRef.current = value
    setRetryableClientTurn(value)
  }

  const durable = useUIMessages(
    api.chatMessages.listMessages,
    isAuthenticated && threadId !== null ? { threadId } : 'skip',
    { initialNumItems: PAGE_SIZE, stream: true },
  )
  const activeThread = useQuery(
    api.chatThreads.getThread,
    isAuthenticated && threadId !== null ? { threadId, now } : 'skip',
  )

  const startTurn = useServerFn(startOwnerChatTurnServer)

  const enableOwnerChat = useServerFn(enableOwnerChatSpendingServer)

  const renameThread = useMutation(api.chatThreads.renameThread)
  const deleteThread = useMutation(api.chatThreads.deleteThread)
  const issueShare = useMutation(api.chatShares.issueShare)
  const revokeShare = useMutation(api.chatShares.revokeShare)


  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestGenerationRef.current += 1
      abortRef.current?.abort()
    }
  }, [])
  useEffect(() => {
    requestGenerationRef.current += 1
    abortRef.current?.abort()
    if (turnInFlightRef.current) {
      turnInFlightRef.current = false
      operationInFlightRef.current = false
      setBusy(false)
      setSending(false)
    }
    retryableClientTurnRef.current = null
    setRetryableClientTurn(null)
    uncertainRunKeysRef.current.clear()
    setRecovery(undefined)
  }, [threadId])
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
    if (threadId === null && initialPrompt.length === 0) {
      const draft = readChatDraft(anonymousSessionStorage())
      if (draft.length > 0) {
        setPrompt(draft)
        setError(promptLimitMessage(draft))
      }
    }
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
    if (!anonymousSessionLoaded || threadId !== null) return
    saveChatDraft(anonymousSessionStorage(), prompt)
  }, [anonymousSessionLoaded, prompt, threadId])
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
  const transcriptPending = threadId !== null && (
    authLoading || (isAuthenticated && durable.status === 'LoadingFirstPage' && durable.results.length === 0)
  )
  const privateThreadLocked = threadId !== null && !authLoading && !isAuthenticated
  const anonymousMessageLimitReached = !isAuthenticated
    && anonymousMessages.length + 2 > MAX_ANONYMOUS_MESSAGES
  const promptTooLong = unicodeLength(prompt.trim()) > MAX_PROMPT_CHARACTERS
  const composerDisabled = busy || authLoading || anonymousMessageLimitReached || privateThreadLocked

  async function sendAnonymous(
    nextPrompt: string,
    requestGeneration: number,
    continuation?: SearchContinuation,
  ): Promise<void> {
    await sendAnonymousChatTurn({
      nextPrompt, anonymousMessages,
      setAnonymousMessages: messages => {
        if (requestGenerationRef.current === requestGeneration) setAnonymousMessages(messages)
      },
      ...(continuation === undefined ? {} : { continuation }),
      abortPrevious: () => { abortRef.current?.abort() },
      adoptController: (controller) => { abortRef.current = controller },
      maxMessages: MAX_ANONYMOUS_MESSAGES, maxBytes: MAX_ANONYMOUS_BYTES,
    })
  }

  async function submit(
    forceNewThread = false,
    rawPrompt = prompt,
    continuation?: SearchContinuation,
    preserveDraft = false,
    retryClientTurnId?: string,
  ): Promise<ChatRunResult> {
    const nextPrompt = rawPrompt.trim()
    if (nextPrompt.length === 0) {
      setError('Enter a message before sending.')
      setRecovery('input_invalid')
      return { kind: 'not_submitted', reason: 'input_invalid' }
    }
    if (unicodeLength(nextPrompt) > MAX_PROMPT_CHARACTERS) {
      setError('Messages can be at most 2,000 characters.')
      setRecovery('input_invalid')
      return { kind: 'not_submitted', reason: 'input_invalid' }
    }
    if (threadId !== null && !isAuthenticated) {
      setError('Reconnect to your account before sending to this conversation.')
      setRecovery('private_thread_locked')
      return { kind: 'not_submitted', reason: 'private_thread_locked' }
    }
    if (continuation !== undefined && isAuthenticated && threadId === null) {
      setError('Open the conversation before loading more results.')
      setRecovery('chat_unavailable')
      return { kind: 'not_submitted', reason: 'chat_unavailable' }
    }
    if (operationInFlightRef.current) {
      setRecovery('thread_busy')
      return { kind: 'not_submitted', reason: 'thread_busy' }
    }
    if (retryClientTurnId !== undefined) {
      const retryable = retryableClientTurnRef.current
      if (retryable?.prompt !== nextPrompt || retryable.clientTurnId !== retryClientTurnId) {
        return { kind: 'not_submitted', reason: 'input_invalid' }
      }
    } else {
      updateRetryableClientTurn(null)
    }
    const requestGeneration = requestGenerationRef.current
    operationInFlightRef.current = true
    turnInFlightRef.current = true
    setBusy(true)
    setSending(true)
    setError('')
    setErrorReference(undefined)
    setBrowseMarketOnError(false)
    setRecovery(undefined)
    setStatus(isAuthenticated ? 'Sending message…' : 'Getting a response…')
    let clientTurnId: string | undefined
    try {
      if (isAuthenticated) {
        clientTurnId = retryClientTurnId ?? globalThis.crypto.randomUUID()
        const result = await startTurn({
          data: {
            prompt: nextPrompt, clientTurnId,
            ...(threadId === null || forceNewThread ? {} : { threadId }),
            ...(continuation === undefined ? {} : {
              continuation: { kind: 'search_next_page' as const, ...continuation },
            }),
          },
        })
        if (!mountedRef.current || requestGenerationRef.current !== requestGeneration) return { kind: 'submitted' }
        if ('kind' in result) {
          const unavailable = result.code === 'source_unavailable'
          setError(unavailable
            ? 'Chat purchases are temporarily unavailable. Your message was not sent; try again after setup is restored.'
            : 'Your sign-in expired. Sign in again before sending this message.')
          setRecovery(unavailable ? 'source_unavailable' : 'chat_unavailable')
          setStatus('')
          updateRetryableClientTurn(null)
          return { kind: 'not_submitted', reason: unavailable ? 'source_unavailable' : 'chat_unavailable' }
        }
        updateRetryableClientTurn(null)
        if (!preserveDraft) setPrompt('')
        setRecovery(undefined)
        setStatus('Message sent.')
        if (result.threadId !== threadId) {
          if (!handoffStoredRef.current && anonymousMessages.length > 0) {
            handoffStoredRef.current = true
            rememberAnonymousChatHandoff(result.threadId, anonymousMessages)
          }
          onThreadCreated(result.threadId)
        }
      } else {
        await sendAnonymous(nextPrompt, requestGeneration, continuation)
        if (!mountedRef.current || requestGenerationRef.current !== requestGeneration) return { kind: 'submitted' }
        updateRetryableClientTurn(null)
        if (!preserveDraft) setPrompt('')
        setRecovery(undefined)
        setStatus('Response complete.')
      }
      return { kind: 'submitted' }
    } catch (caught) {
      const isRunRequest = parseRunRequest(nextPrompt) !== null
      if (!mountedRef.current || requestGenerationRef.current !== requestGeneration) {
        return isRunRequest
          ? { kind: 'outcome_unknown' }
          : { kind: 'not_submitted', reason: 'turn_stopped' }
      }
      if (caught instanceof Error && caught.name === 'AbortError') {
        setStatus('')
        if (isRunRequest) {
          setError('We could not confirm whether the Run started. Check the conversation before trying again.')
          setRecovery('outcome_unknown')
          updateRetryableClientTurn(null)
          return { kind: 'outcome_unknown' }
        }
        setRecovery('turn_stopped')
        return { kind: 'not_submitted', reason: 'turn_stopped' }
      }
      const failure = projectChatFailure(caught)
      setErrorReference(failure.reference)
      setBrowseMarketOnError(failure.browseMarket)
      setStatus('')
      if (isRunRequest && failure.reason !== 'rate_limited') {
        setError('We could not confirm whether the Run started. Check the conversation before trying again.')
        setRecovery('outcome_unknown')
        updateRetryableClientTurn(null)
        return { kind: 'outcome_unknown' }
      }
      setError(failure.message)
      setRecovery(failure.reason)
      // Guest turns only browse. Restore a starter/action draft and permit an
      // explicit retry; signed-in uncertain effects keep their existing fence.
      const retryableGuest = !isAuthenticated && !isRunRequest
        && failure.reason !== 'anonymous_message_limit' && failure.reason !== 'anonymous_size_limit'
      if (retryableGuest && !preserveDraft) setPrompt(nextPrompt)
      if (failure.reason === 'rate_limited' || retryableGuest) {
        updateRetryableClientTurn({
          prompt: nextPrompt,
          ...(clientTurnId === undefined ? {} : { clientTurnId }),
        })
        return { kind: 'not_submitted', reason: failure.reason }
      }
      updateRetryableClientTurn(null)
      return { kind: 'outcome_unknown' }
    } finally {
      if (mountedRef.current && requestGenerationRef.current === requestGeneration) {
        operationInFlightRef.current = false
        turnInFlightRef.current = false
        setBusy(false)
        setSending(false)
      }
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
    requestGenerationRef.current += 1
    abortRef.current?.abort()
    if (turnInFlightRef.current) {
      turnInFlightRef.current = false
      operationInFlightRef.current = false
      setBusy(false)
      setSending(false)
    }
    updateRetryableClientTurn(null)
    uncertainRunKeysRef.current.clear()
    setRecovery(undefined)
    if (anonymousSessionIdRef.current !== null) {
      clearAnonymousSession(anonymousSessionStorage(), anonymousSessionIdRef.current)
      anonymousSessionIdRef.current = crypto.randomUUID()
    }
    setAnonymousMessages([])
    setPrompt('')
    saveChatDraft(anonymousSessionStorage(), '')
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



  const unansweredText = !busy && !sending && !privateThreadLocked
    && visibleMessages.at(-1)?.role === 'user'
    ? textFromParts(visibleMessages.at(-1)?.parts ?? []).trim()
    : ''
  const unansweredQuestion = unansweredText !== ''
    && retryableClientTurn?.prompt === unansweredText
    && parseRunRequest(unansweredText) === null ? unansweredText : ''
  function stopAnonymousSend() {
    abortRef.current?.abort()
  }
  function focusPrompt(value: string) {
    setPrompt(value)
    setRecovery(undefined)
    if (retryableClientTurnRef.current?.prompt !== value) updateRetryableClientTurn(null)
    setError(promptLimitMessage(value))
    document.getElementById('tool-chat-prompt')?.focus()
  }
  function lastUserText(): string | undefined {
    const text = textFromParts(visibleMessages.findLast(message => message.role === 'user')?.parts ?? []).trim()
    return text || undefined
  }
  function submitText(text: string, newThread = false): void {
    void submit(newThread, text)
  }
  async function runTool(toolRef: string, input: RunIntent['input']): Promise<ChatRunResult> {
    let runRequest: string
    try {
      runRequest = formatRunRequest(toolRef, input)
    } catch {
      setRecovery('operation_ref_invalid')
      return { kind: 'not_submitted', reason: 'operation_ref_invalid' }
    }
    const requestKey = JSON.stringify([threadId, toolRef, input])
    if (uncertainRunKeysRef.current.has(requestKey)) {
      setRecovery('outcome_unknown')
      return { kind: 'outcome_unknown' }
    }
    const result = await submit(false, runRequest, undefined, true)
    if (result.kind === 'outcome_unknown') uncertainRunKeysRef.current.add(requestKey)
    return result
  }
  function retryLastRequest(): void {
    const lastRequest = lastUserText()
    const retryable = retryableClientTurnRef.current
    if (lastRequest === undefined || retryable?.prompt !== lastRequest || parseRunRequest(lastRequest) !== null) return
    void submit(false, retryable.prompt, undefined, true, retryable.clientTurnId)
  }
  function retryComposerRequest(): void {
    const retryable = retryableClientTurnRef.current
    if ((isAuthenticated && recovery !== 'rate_limited') || retryable === null || retryable.prompt !== prompt
      || parseRunRequest(retryable.prompt) !== null) return
    void submit(false, retryable.prompt, undefined, false, retryable.clientTurnId)
  }
  return {
    showHistoryRail: isAuthenticated,
    ...(privateThreadLocked ? { signInToThread: { href: `/sign-in?redirect=${encodeURIComponent(`/t/${threadId}`)}` } } : {}),
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
            onNewChat()
            setStatus('Paying is on.')
          } else {
            setEnableProblem(result.code === 'payments_paused'
              ? 'Paid Tool purchases are temporarily paused. You can keep searching and comparing Tools.'
              : result.code === 'payments_not_ready'
                ? 'Paid Tool purchases are temporarily unavailable. You can keep searching and comparing Tools.'
              : result.code === 'payments_admins_only'
                ? 'Paid Tool purchases are currently available to Admins only. You can keep searching and comparing Tools.'
                : 'Could not enable chat spending. Check your session and try again.')
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
      ...(recovery === undefined ? {} : { recovery }),
      ...((recovery === 'rate_limited' || !isAuthenticated) && retryableClientTurn?.prompt === prompt
        && parseRunRequest(prompt) === null ? { onRetry: retryComposerRequest } : {}),
      ...(parseDetailRequest(lastUserText() ?? prompt) === null
        ? { onEditLast: () => focusPrompt(lastUserText() ?? prompt) } : {}),
      onNewChat: startNewChat,
      ...(isAuthenticated ? {} : { onStop: stopAnonymousSend }),
      onPromptChange: (value) => {
        setPrompt(value)
        if (retryableClientTurnRef.current?.prompt !== value) updateRetryableClientTurn(null)
        setRecovery(undefined)
        const limit = promptLimitMessage(value)
        if (limit.length > 0) {
          setError(limit)
          setErrorReference(undefined)
          setBrowseMarketOnError(false)
        } else if (error.length > 0) {
          setError('')
          setErrorReference(undefined)
          setBrowseMarketOnError(false)
        }
      },
      onSubmit: () => void submit(),
    },
    transcript: {
      ...(isAuthenticated && threadId !== null ? {
        loadEarlier: {
          hasMore: durable.status === 'CanLoadMore' || durable.status === 'LoadingMore',
          loading: durable.status === 'LoadingMore',
          onLoad: () => durable.loadMore(PAGE_SIZE),
        },
      } : {}),
      messages: visibleMessages,
      onNewChat: startNewChat,
      ...(isAuthenticated && threadId !== null ? { ownerChatThreadId: threadId, ownerChatNow: now } : {}),
      onFreshQuote: (toolName, inputSummary) => focusPrompt(`Get a fresh Quote for ${toolName} with input ${inputSummary}`),
      thinking: (sending || activeThread?.busy === true) && !assistantTurnStarted(visibleMessages),
      generating: activeThread?.busy === true,
      clarifyDisabled: composerDisabled,
      onClarifyAnswer: (answer) => { void submit(false, answer) },
      onContinueSearch: (next) => { void submit(false, `Show more results for ${next.args.query}`, next.args, true) },
      onRepeatSearch: (query) => { void submit(false, `Search again for ${query}`, undefined, true) },
      onRunTool: runTool,
      ...(transcriptPending ? { pending: true } : {}),
      ...(isAuthenticated && anonymousMessages.length > 0 ? { handoffAfter: anonymousMessages.length } : {}),
      onCopyAnswer: (answer) => {
        void navigator.clipboard.writeText(answer)
          .then(() => setStatus('Answer copied.'), () => setError('Copy failed. Select the answer and copy it manually.'))
      },
      ...(composerDisabled || promptTooLong ? {} : {
        onSuggest: (nextPrompt) => {
          if (parseDetailRequest(nextPrompt) !== null) void submit(false, nextPrompt, undefined, true)
          else focusPrompt(nextPrompt)
        },
        onStarter: (nextPrompt) => { void submit(false, nextPrompt) },
        onRefine: (nextPrompt) => { void submit(false, nextPrompt) },
        onEditQuestion: (previousPrompt) => {
          if (parseDetailRequest(previousPrompt) === null) focusPrompt(previousPrompt)
        },
        ...(unansweredQuestion.length === 0 ? {} : { onRetryQuestion: () => retryLastRequest() }),
      }),
    },
    pageBusy: busy,
    lastUserText,
    submitText,
    onRunTool: runTool,
    retryLastRequest,
  }
}
