import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PanelLeftIcon } from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { captureClientProductEventOnClient } from '@/lib/observability/capture-client-events'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'
import {
  DEFAULT_AE_SEARCH_CONTEXT,
  aeSearchContextLocationLabel,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import {
  classifyFollowUpIntent,
  type AnswerThreadRecord,
  type FollowUpIntent,
  type PublicThreadProjection,
} from '@/modules/answer-thread/public'
import { AeAnswerModelProvider } from './AeAnswerModelContext'
import { AeChatWelcome } from './AeChatWelcome'
import { AeQueryPanel } from './AeQueryPanel'
import { AeSessionContextPanel } from './AeSessionContextPanel'
import { AeSessionJourney } from './AeSessionJourney'
import { AeThreadHeader } from './AeThreadHeader'
import { AeThreadScroller } from './AeThreadScroller'
import { AeThreadSidebar } from './AeThreadSidebar'
import { AeThreadTranscript } from './AeThreadTranscript'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'
import {
  buildChatCompleteFunnelEvents,
  buildChatSubmitFunnelEvents,
  type ChatFunnelEvent,
} from './chat-funnel'
import {
  activeSelectedProviderForTurns,
  providerHasInquiryPath,
} from './session-provider-context'

export type AeChatProps = {
  threadId?: string | null
  initialQuery?: string | null
  initialProjection?: PublicThreadProjection | null
}

type LiveTurn = {
  query: string
  generation: number
  searchContext: AeSearchContext
  intent: FollowUpIntent
}

type ProjectionFetchState = {
  threadId: string
  projection: PublicThreadProjection | null
  unavailable: boolean
}

type ThreadRecordsUpdater =
  | readonly AnswerThreadRecord[]
  | ((current: readonly AnswerThreadRecord[]) => readonly AnswerThreadRecord[])

const RECENT_THREADS_STORAGE_KEY = 'ae.recentThreads.v1'
const RECENT_THREADS_LIMIT = 20
const EMPTY_THREAD_RECORDS_SNAPSHOT = '[]'
let fallbackThreadRecordsSnapshot = EMPTY_THREAD_RECORDS_SNAPSHOT
let preferFallbackThreadRecordsSnapshot = false
const threadRecordsSubscribers = new Set<() => void>()

export function AeChat({ threadId = null, initialQuery = null, initialProjection }: AeChatProps) {
  const navigate = useNavigate()
  const routeThreadId = threadId
  const initialRouteQuery = routeThreadId === null ? (initialQuery?.trim() ?? '') : ''
  const initialLiveTurn =
    initialRouteQuery.length > 0
      ? ({
          query: initialRouteQuery,
          generation: 1,
          searchContext: DEFAULT_AE_SEARCH_CONTEXT,
          intent: 'refine_search',
        } satisfies LiveTurn)
      : null
  const [fetchedProjection, setFetchedProjection] = useState<ProjectionFetchState | null>(null)
  const threads = useStoredThreadRecords()
  const threadsRef = useRef(threads)
  const [liveTurn, setLiveTurn] = useState<LiveTurn | null>(initialLiveTurn)
  const generationRef = useRef(initialLiveTurn === null ? 0 : 1)
  const [streamingBusy, setStreamingBusy] = useState(initialLiveTurn !== null)
  const [sessionThreadId, setSessionThreadId] = useState<string | null>(null)
  const searchContext = DEFAULT_AE_SEARCH_CONTEXT
  const [sidebarManuallyOpen, setSidebarManuallyOpen] = useState(false)
  const pendingThreadIdRef = useRef<string | null>(null)
  threadsRef.current = threads

  const setThreadRecords = useCallback((updater: ThreadRecordsUpdater) => {
    const nextThreads = typeof updater === 'function' ? updater(threadsRef.current) : updater
    writeStoredThreadRecords(nextThreads)
  }, [])

  const initialRouteProjection =
    routeThreadId !== null && initialProjection?.threadId === routeThreadId ? initialProjection : null
  const fetchedRouteProjection = fetchedProjection?.threadId === routeThreadId ? fetchedProjection : null
  const projection =
    routeThreadId === null ? null : (fetchedRouteProjection?.projection ?? initialRouteProjection ?? null)
  const projectionUnavailable =
    routeThreadId !== null &&
    (initialProjection === null || (initialRouteProjection === null && fetchedRouteProjection?.unavailable === true))
  const streamingThreadId = routeThreadId ?? sessionThreadId
  const showWelcome = routeThreadId === null && liveTurn === null && (projection?.turns.length ?? 0) === 0
  const showThreadUnavailable = routeThreadId !== null && projection === null && liveTurn === null && projectionUnavailable
  const completedTurns = projection?.turns.filter((turn) => turn.status === 'complete') ?? []
  const completedTurnCount = completedTurns.length


  const wasShowingWelcomeRef = useRef(showWelcome)
  const [leavingWelcome, setLeavingWelcome] = useState(showWelcome)

  const refreshThreads = useCallback(async () => {
    try {
      const response = await fetch('/api/answer/threads', { credentials: 'same-origin' })
      if (!response.ok) {
        return
      }
      const body = (await response.json()) as { threads: readonly AnswerThreadRecord[] }
      setThreadRecords((current) => mergeThreadRecords(body.threads, current))
    } catch {
      // Sidebar is optional when persistence is unavailable.
    }
  }, [setThreadRecords])

  const refreshProjection = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/answer/threads/${encodeURIComponent(id)}`, { credentials: 'same-origin' })
      if (!response.ok) {
        setFetchedProjection({ threadId: id, projection: null, unavailable: true })
        return
      }
      const body = (await response.json()) as PublicThreadProjection
      setFetchedProjection({ threadId: id, projection: body, unavailable: false })
    } catch {
      setFetchedProjection({ threadId: id, projection: null, unavailable: true })
    }
  }, [])


  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  useEffect(() => {
    if (routeThreadId === null) {
      return
    }
    if (initialProjection?.threadId === routeThreadId || initialProjection === null) {
      return
    }
    void refreshProjection(routeThreadId)
  }, [routeThreadId, initialProjection, refreshProjection])


  useEffect(() => {
    if (showWelcome) {
      wasShowingWelcomeRef.current = true
      setLeavingWelcome(true)
      return
    }

    if (wasShowingWelcomeRef.current) {
      wasShowingWelcomeRef.current = false
      setLeavingWelcome(true)
      const timer = window.setTimeout(() => setLeavingWelcome(false), 220)
      return () => window.clearTimeout(timer)
    }

    setLeavingWelcome(false)
  }, [showWelcome])

  function startTurn(
    query: string,
    context: AeSearchContext = searchContext,
    intent: FollowUpIntent = classifyFollowUpIntent(query, completedTurnCount),
  ) {
    setStreamingBusy(true)
    const nextGeneration = generationRef.current + 1
    generationRef.current = nextGeneration
    setLiveTurn({ query, generation: nextGeneration, searchContext: context, intent })
  }

  function handleSubmit(query: string) {
    const intent = classifyFollowUpIntent(query, completedTurnCount)
    captureClientProductEventOnClient('query_submitted', {
      query_length: query.length,
      search_mode: searchContext.mode,
      search_location: aeSearchContextLocationLabel(searchContext) ?? 'none',
    })
    emitChatFunnelEvents(buildChatSubmitFunnelEvents({ query, completedTurnCount }))
    startTurn(query, searchContext, intent)
  }

  function handleThreadCreated(id: string) {
    pendingThreadIdRef.current = id
    setSessionThreadId(id)
    setThreadRecords((current) => upsertOptimisticThread(current, {
      threadId: id,
      title: liveTurn?.query.trim() ?? 'New question',
    }))
  }

  function handleStreamEnd(outcome: 'complete' | 'error' | 'stopped' | 'rate_limited') {
    setStreamingBusy(false)
    if (outcome === 'complete' || pendingThreadIdRef.current !== null || routeThreadId !== null) {
      handleTurnSettled(outcome)
    }
  }

  function handleTurnSettled(outcome: 'complete' | 'error' | 'stopped' | 'rate_limited') {
    const settledGeneration = liveTurn?.generation ?? null
    if (outcome === 'complete') {
      captureClientProductEventOnClient('answer_completed', { query_length: liveTurn?.query.length ?? 0 })
      if (liveTurn !== null) {
        emitChatFunnelEvents(
          buildChatCompleteFunnelEvents({
            query: liveTurn.query,
            completedTurnCount,
            outcome,
          }),
        )
      }
    }

    const pendingId = pendingThreadIdRef.current
    if (routeThreadId === null && pendingId !== null) {
      pendingThreadIdRef.current = null
      void Promise.resolve(navigate({ to: '/t/$threadId', params: { threadId: pendingId }, replace: true })).finally(() => {
        clearLiveTurnIfSettled(settledGeneration)
        void refreshThreads()
      })
      return
    }

    clearLiveTurnIfSettled(settledGeneration)
    void refreshThreads()

    if (routeThreadId !== null) {
      void refreshProjection(routeThreadId)
    }
  }

  function clearLiveTurnIfSettled(settledGeneration: number | null) {
    setLiveTurn((current) => {
      if (current === null || current.generation === settledGeneration) {
        return null
      }
      return current
    })
  }

  function handleFollowUp(query: string) {
    handleSubmit(query)
  }

  function handleRetry(query: string) {
    const retryIntent = liveTurn?.query === query ? liveTurn.intent : classifyFollowUpIntent(query, completedTurnCount)
    startTurn(query, searchContext, retryIntent)
  }

  function handleDeleteThread(deletedThreadId: string) {
    setThreadRecords((current) => current.filter((thread) => thread.threadId !== deletedThreadId))
    if (routeThreadId === deletedThreadId) {
      void navigate({ to: '/', replace: true })
    }
  }

  const landingMode = showWelcome || leavingWelcome

  const sidebarContextActive = routeThreadId !== null || liveTurn !== null
  const showSidebarToggle = sidebarContextActive || threads.length > 0 || sidebarManuallyOpen
  const sidebarVisible = sidebarContextActive || sidebarManuallyOpen
  const showThreadChrome = routeThreadId !== null && completedTurnCount > 1

  // Keep scroller mounted while a turn streams - sessionThreadId updates mid-stream must not remount.
  const scrollerKey = routeThreadId ?? (liveTurn !== null ? 'live' : sessionThreadId) ?? 'home'
  const defaultScrollPosition =
    completedTurnCount > 0 && liveTurn === null ? ('last-anchor' as const) : ('end' as const)
  const settleMessageId =
    liveTurn === null && completedTurns.length > 0 ? (completedTurns[completedTurns.length - 1]?.turnId ?? null) : null
  const followUpComposerCopy = buildFollowUpComposerCopy(completedTurns, liveTurn?.intent ?? null)

  const shell = (
    <div className={`grid h-full min-h-0 w-full bg-body${sidebarVisible ? ' lg:grid-cols-[clamp(13.5rem,16vw,16.25rem)_minmax(0,1fr)]' : ''}`}>
      <AeThreadSidebar threads={threads} activeThreadId={routeThreadId} visible={sidebarVisible} onDelete={handleDeleteThread} />
      <div className="flex h-full min-h-0 w-full flex-col bg-body">
        {showSidebarToggle ? (
          <div className="flex min-h-10 items-center px-4 pt-2 md:px-6">
            <IconButton
              label={sidebarVisible ? 'Hide recent questions' : 'Show recent questions'}
              variant="ghost"
              size="sm"
              className="hidden text-secondary lg:inline-flex"
              icon={<PanelLeftIcon aria-hidden="true" />}
              onClick={() => setSidebarManuallyOpen((value) => !value)}
              aria-controls="ae-thread-sidebar"
              aria-expanded={sidebarVisible}
            />
          </div>
        ) : null}
        {showThreadChrome && projection !== null ? (
          <AeThreadHeader title={projection.title} threadId={projection.threadId} />
        ) : null}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <AeThreadScroller
            key={scrollerKey}
            autoScroll={liveTurn !== null}
            defaultScrollPosition={defaultScrollPosition}
            settleMessageId={settleMessageId}
            streaming={streamingBusy}
            showJumpButton={liveTurn !== null}
          >
            {showThreadUnavailable ? (
              <div className="mx-auto my-12 w-full max-w-[36rem]">
                <AeEmptyState
                  title="Thread unavailable"
                  description="This answer thread could not be found or loaded. Start a fresh search to keep going."
                  action={
                    <Button label="Start a new search" href="/" variant="secondary" size="sm" />
                  }
                />
              </div>
            ) : null}
            <AeSessionJourney projection={projection} liveTurn={liveTurn} />
            <AeSessionContextPanel projection={projection} liveTurn={liveTurn} />
            <AeThreadTranscript
              threadId={streamingThreadId}
              projection={projection}
              liveTurn={liveTurn}
              onThreadCreated={handleThreadCreated}
              onStreamEnd={handleStreamEnd}
              {...(routeThreadId === null ? {} : { onFollowUp: handleFollowUp })}
              onRetry={handleRetry}
            />
          </AeThreadScroller>
          {!showWelcome ? (
            <div className="mx-auto w-full max-w-[52rem] flex-none bg-body px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
              <AeQueryPanel
                onSubmit={handleSubmit}
                busy={streamingBusy}
                searchContext={searchContext}
                showExamples={false}
                {...(followUpComposerCopy === null ? {} : { placeholder: followUpComposerCopy.placeholder })}
                {...(followUpComposerCopy === null ? {} : { loopHint: followUpComposerCopy.loopHint })}
              />
            </div>
          ) : null}
          {landingMode ? (
            <div
              className={`absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-body px-4 py-12 md:px-6 motion-safe:transition-opacity motion-safe:duration-200${!showWelcome ? ' pointer-events-none invisible opacity-0' : ''}`}
              aria-hidden={!showWelcome}
            >
              <div className="mx-auto flex w-full min-w-0 max-w-[44rem] flex-col gap-8">
                <AeChatWelcome />
                {showWelcome ? (
                  <AeQueryPanel
                    onSubmit={handleSubmit}
                    busy={streamingBusy}
                    searchContext={searchContext}
                    showExamples
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  return (
    <AePublicShell immersive>
      {isStructuredAnswerModeEnabled() ? <AeAnswerModelProvider>{shell}</AeAnswerModelProvider> : shell}
    </AePublicShell>
  )
}

type FollowUpComposerCopy = {
  placeholder: string
  loopHint: string
}

export function buildFollowUpComposerCopy(
  completedTurns: readonly NonNullable<PublicThreadProjection>['turns'][number][],
  liveIntent: FollowUpIntent | null = null,
): FollowUpComposerCopy | null {
  if (liveIntent !== null) {
    return buildLiveComposerCopy(liveIntent, completedTurns.length)
  }

  if (completedTurns.length === 0) {
    return null
  }

  const state = readComposerContext(completedTurns)
  if (state.selectedProvider !== undefined) {
    return providerHasInquiryPath(state.selectedProvider)
      ? {
          placeholder: 'Ask limits, refine, or continue with the selected business',
          loopHint: 'AE keeps that business in context for qualified inquiry review. The business still confirms timing, quote, and availability.',
        }
      : {
          placeholder: 'Ask limits, refine, or review the selected listing',
          loopHint: 'This business needs a published inquiry path before AE can route contact.',
        }
  }

  if (state.hasInquiryReadyProvider) {
    return {
      placeholder: 'Narrow, compare, or start a qualified inquiry',
      loopHint: 'Continue by narrowing or comparing the listed businesses, then use qualified inquiry when one fits.',
    }
  }

  if (state.hasListedProvider) {
    return {
      placeholder: 'Narrow, compare, or ask for the contact step',
      loopHint: 'These listings need a published inquiry path before AE can route contact.',
    }
  }

  return {
    placeholder: 'Refine the search or ask what AE can safely do',
    loopHint: 'AE needs a listed business before it can compare options or route a qualified inquiry.',
  }
}

function buildLiveComposerCopy(intent: FollowUpIntent, completedTurnCount: number): FollowUpComposerCopy {
  switch (intent) {
    case 'filter_known':
      return {
        placeholder: 'Filtering the listed businesses from this thread',
        loopHint: 'AE is narrowing the known businesses before any contact step.',
      }
    case 'compare_known':
      return {
        placeholder: 'Comparing the listed businesses from this thread',
        loopHint: 'AE is comparing published details from the businesses already found.',
      }
    case 'inquiry_handoff':
      return {
        placeholder: 'Preparing the qualified inquiry next step',
        loopHint: 'AE is carrying the selected business into inquiry review. The business still confirms timing, quote, and availability.',
      }
    case 'explain_boundary':
      return {
        placeholder: "Checking AE's inquiry-only limits",
        loopHint: 'AE will route back to published listings when a request exceeds read, compare, or qualified inquiry.',
      }
    case 'unsupported':
      return {
        placeholder: 'Routing back to published listings',
        loopHint: 'AE can read, compare, and route qualified inquiries, but it does not book, charge, or dispatch.',
      }
    case 'refine_search':
      return {
        placeholder: completedTurnCount > 0 ? 'Searching again with this thread in mind' : 'Checking published business details',
        loopHint: 'AE is checking published business details before any contact step.',
      }
  }
}

function readComposerContext(
  completedTurns: readonly NonNullable<PublicThreadProjection>['turns'][number][],
): {
  hasListedProvider: boolean
  hasInquiryReadyProvider: boolean
  selectedProvider: ReturnType<typeof activeSelectedProviderForTurns>
} {
  let hasListedProvider = false
  let hasInquiryReadyProvider = false
  const selectedProvider = activeSelectedProviderForTurns(completedTurns)

  for (const turn of completedTurns) {
    for (const artifact of turn.artifacts) {
      switch (artifact.kind) {
        case 'selected-provider':
          hasListedProvider = true
          if (hasPublishedInquiryPath(artifact.provider)) {
            hasInquiryReadyProvider = true
          }
          break
        case 'provider-cards':
        case 'provider-compare-table':
          if (artifact.providers.length > 0) {
            hasListedProvider = true
          }
          if (artifact.providers.some(hasPublishedInquiryPath)) {
            hasInquiryReadyProvider = true
          }
          break
        default:
          break
      }
    }
  }

  return { hasListedProvider, hasInquiryReadyProvider, selectedProvider }
}

function hasPublishedInquiryPath(provider: { inquiryUrl?: string }): boolean {
  return provider.inquiryUrl !== undefined && provider.inquiryUrl.length > 0
}

function emitChatFunnelEvents(events: readonly ChatFunnelEvent[]): void {
  for (const event of events) {
    void emitFunnelEvent({
      eventType: event.eventType,
      stage: 'visitor',
      correlationPrefix: event.eventType,
      payload: event.payload,
    })
  }
}

function useStoredThreadRecords(): readonly AnswerThreadRecord[] {
  const snapshot = useSyncExternalStore(
    subscribeThreadRecords,
    getThreadRecordsSnapshot,
    getServerThreadRecordsSnapshot,
  )
  return useMemo(() => readStoredThreadRecordsSnapshot(snapshot), [snapshot])
}

function subscribeThreadRecords(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  threadRecordsSubscribers.add(onStoreChange)
  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea === window.sessionStorage && event.key === RECENT_THREADS_STORAGE_KEY) {
      onStoreChange()
    }
  }
  window.addEventListener('storage', handleStorage)

  return () => {
    threadRecordsSubscribers.delete(onStoreChange)
    window.removeEventListener('storage', handleStorage)
  }
}

function getThreadRecordsSnapshot(): string {
  if (typeof window === 'undefined') {
    return fallbackThreadRecordsSnapshot
  }
  if (preferFallbackThreadRecordsSnapshot) {
    return fallbackThreadRecordsSnapshot
  }
  try {
    return window.sessionStorage.getItem(RECENT_THREADS_STORAGE_KEY) ?? fallbackThreadRecordsSnapshot
  } catch {
    return fallbackThreadRecordsSnapshot
  }
}

function getServerThreadRecordsSnapshot(): string {
  return EMPTY_THREAD_RECORDS_SNAPSHOT
}

function notifyThreadRecordsSubscribers(): void {
  threadRecordsSubscribers.forEach((subscriber) => subscriber())
}

function mergeThreadRecords(
  incoming: readonly AnswerThreadRecord[],
  current: readonly AnswerThreadRecord[],
): AnswerThreadRecord[] {
  const normalizedIncoming = incoming.map(sanitizeThreadRecord)
  const incomingIds = new Set(normalizedIncoming.map((thread) => thread.threadId))
  const optimistic = current.map(sanitizeThreadRecord).filter((thread) => !incomingIds.has(thread.threadId))
  return [...normalizedIncoming, ...optimistic]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, RECENT_THREADS_LIMIT)
}

function upsertOptimisticThread(
  current: readonly AnswerThreadRecord[],
  input: { threadId: string; title: string },
): AnswerThreadRecord[] {
  const now = Date.now()
  const existing = current.find((thread) => thread.threadId === input.threadId)
  const optimistic: AnswerThreadRecord = {
    threadId: input.threadId,
    pseudonymousSessionId: '',
    title: input.title.length > 0 ? input.title : 'New question',
    sharePolicy: existing?.sharePolicy ?? 'public',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  return mergeThreadRecords([optimistic], current.filter((thread) => thread.threadId !== input.threadId))
}

function readStoredThreadRecordsSnapshot(raw: string): AnswerThreadRecord[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.flatMap(readStoredThreadRecord).slice(0, RECENT_THREADS_LIMIT)
  } catch {
    return []
  }
}

function writeStoredThreadRecords(threads: readonly AnswerThreadRecord[]): void {
  fallbackThreadRecordsSnapshot = JSON.stringify(threads.map(sanitizeThreadRecord).slice(0, RECENT_THREADS_LIMIT))
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(RECENT_THREADS_STORAGE_KEY, fallbackThreadRecordsSnapshot)
      preferFallbackThreadRecordsSnapshot = false
    } catch {
      preferFallbackThreadRecordsSnapshot = true
      // Recent questions still work in-memory when storage is unavailable.
    }
  }
  notifyThreadRecordsSubscribers()
}

function readStoredThreadRecord(value: unknown): AnswerThreadRecord[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return []
  }
  const record = value as Partial<AnswerThreadRecord>
  if (
    typeof record.threadId !== 'string' ||
    record.threadId.length === 0 ||
    typeof record.title !== 'string' ||
    record.title.length === 0 ||
    (record.sharePolicy !== 'public' && record.sharePolicy !== 'unlisted') ||
    typeof record.createdAt !== 'number' ||
    typeof record.updatedAt !== 'number'
  ) {
    return []
  }
  return [sanitizeThreadRecord({
    threadId: record.threadId,
    pseudonymousSessionId: '',
    title: record.title,
    sharePolicy: record.sharePolicy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })]
}

function sanitizeThreadRecord(thread: AnswerThreadRecord): AnswerThreadRecord {
  return {
    threadId: thread.threadId,
    pseudonymousSessionId: '',
    title: thread.title.trim().length > 0 ? thread.title.trim() : 'New question',
    sharePolicy: thread.sharePolicy,
    createdAt: finiteTimestamp(thread.createdAt),
    updatedAt: finiteTimestamp(thread.updatedAt),
  }
}

function finiteTimestamp(value: number): number {
  return Number.isFinite(value) ? value : Date.now()
}
