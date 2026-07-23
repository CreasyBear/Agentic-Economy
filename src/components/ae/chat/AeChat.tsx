import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PanelLeftIcon, XIcon } from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@astryxdesign/core/Button'
import { Dialog } from '@astryxdesign/core/Dialog'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Text } from '@astryxdesign/core/Text'
import { captureClientProductEventOnClient } from '@/lib/observability/capture-client-events'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'
import {
  emitWave1JourneyEvent,
  getOrCreatePseudonymousJourneyId,
  markJourneyViewedAfterReopenWindow,
} from '@/lib/ui/journey-events'
import {
  DEFAULT_AE_SEARCH_CONTEXT,
  aeSearchContextLocationLabel,
  type AeSearchContext,
  type NeedTiming,
} from '@/modules/answer/search-context'
import {
  classifyFollowUpIntent,
  type AnswerThreadRecord,
  type FollowUpIntent,
  type PublicThreadProjection,
  type PublicThreadTurn,
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
import { settledShortlistFromArtifacts } from './shortlist-projection'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'
import {
  buildChatCompleteFunnelEvents,
  buildChatSubmitFunnelEvents,
  type ChatFunnelEvent,
} from './chat-funnel'
import { buildFollowUpComposerCopy } from './composer-copy'
import { writeThreadProjectionHandoff } from './thread-projection-handoff'

export type AeChatProps = {
  threadId?: string | null
  initialQuery?: string | null
  initialProjection?: PublicThreadProjection | null
  initialProjectionIsTransient?: boolean
}

type LiveTurn = {
  query: string
  generation: number
  searchContext: AeSearchContext
  intent: FollowUpIntent
  turnId?: string
  turnSeq?: number
}

type ProjectionFetchState = {
  threadId: string
  projection: PublicThreadProjection | null
  unavailable: boolean
}

type OptimisticTurnRecord = {
  threadId: string
  stableKey: string
  turn: PublicThreadTurn
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

export function AeChat({
  threadId = null,
  initialQuery = null,
  initialProjection,
  initialProjectionIsTransient = false,
}: AeChatProps) {
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
  const [optimisticTurns, setOptimisticTurns] = useState<readonly OptimisticTurnRecord[]>([])
  const searchContext = DEFAULT_AE_SEARCH_CONTEXT
  const [sidebarManuallyOpen, setSidebarManuallyOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [refinementComposerOpen, setRefinementComposerOpen] = useState(false)
  const pendingThreadIdRef = useRef<string | null>(null)
  const settledProjectionHandoffRef = useRef<PublicThreadProjection | null>(null)
  const mobileSidebarReturnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setRefinementComposerOpen(false)
  }, [routeThreadId])
  useLayoutEffect(() => {
    threadsRef.current = threads
  }, [threads])

  const setThreadRecords = useCallback((updater: ThreadRecordsUpdater) => {
    const nextThreads = typeof updater === 'function' ? updater(threadsRef.current) : updater
    writeStoredThreadRecords(nextThreads)
  }, [])

  const initialRouteProjection =
    routeThreadId !== null && initialProjection?.threadId === routeThreadId ? initialProjection : null
  const fetchedRouteProjection = fetchedProjection?.threadId === routeThreadId ? fetchedProjection : null
  const serverProjection =
    routeThreadId === null
      ? null
      : fetchedRouteProjection === null
        ? initialRouteProjection
        : fetchedRouteProjection.projection
  const projectionUnavailable =
    routeThreadId !== null &&
    (initialProjection === null || fetchedRouteProjection?.unavailable === true)
  const streamingThreadId = routeThreadId ?? sessionThreadId
  const activeLiveTurnId = liveTurn?.turnId ?? null
  const projection = useMemo(
    () =>
      mergeProjectionWithOptimisticTurns({
        serverProjection,
        streamingThreadId,
        optimisticTurns,
        omitTurnId: activeLiveTurnId,
      }),
    [serverProjection, streamingThreadId, optimisticTurns, activeLiveTurnId],
  )
  const sessionProjection = useMemo(
    () =>
      mergeProjectionWithOptimisticTurns({
        serverProjection,
        streamingThreadId,
        optimisticTurns,
      }),
    [serverProjection, streamingThreadId, optimisticTurns],
  )
  const turnRenderKeys = useMemo(() => {
    const keys: Record<string, string> = {}
    for (const record of optimisticTurns) {
      if (record.threadId === streamingThreadId) {
        keys[record.turn.turnId] = record.stableKey
      }
    }
    return keys
  }, [streamingThreadId, optimisticTurns])
  const showWelcome = routeThreadId === null && liveTurn === null && (projection?.turns.length ?? 0) === 0
  const showThreadUnavailable = routeThreadId !== null && projection === null && liveTurn === null && projectionUnavailable
  const completedTurns = sessionProjection?.turns.filter((turn) => turn.status === 'complete') ?? []
  const completedTurnCount = completedTurns.length
  const latestProjectedTurn = sessionProjection?.turns.at(-1)
  const terminalShortlist = liveTurn === null && latestProjectedTurn?.status === 'complete'
    ? settledShortlistFromArtifacts(latestProjectedTurn.artifacts, latestProjectedTurn.timing)
    : null
  const composerTiming = latestProjectedTurn?.timing ?? liveTurn?.searchContext.timing ?? 'flexible'
  const composerTimingDate = latestProjectedTurn?.timingDate ?? liveTurn?.searchContext.timingDate
  useEffect(() => {
    if (routeThreadId === null || terminalShortlist === null) {
      return
    }

    const pseudonymousJourneyId = getOrCreatePseudonymousJourneyId('J2', routeThreadId)
    if (markJourneyViewedAfterReopenWindow('J2', routeThreadId)) {
      emitWave1JourneyEvent({
        event: 'shortlist_reopened',
        eventVersion: 1,
        journey: 'J2',
        pseudonymousJourneyId,
      })
    }
  }, [routeThreadId, terminalShortlist])


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
    if (initialProjection?.threadId === routeThreadId && !initialProjectionIsTransient) {
      return
    }
    void refreshProjection(routeThreadId)
  }, [routeThreadId, initialProjection, initialProjectionIsTransient, refreshProjection])


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

  function openMobileSidebar() {
    const activeElement = document.activeElement
    mobileSidebarReturnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null
    setMobileSidebarOpen(true)
  }

  function closeMobileSidebar() {
    const returnFocusElement = mobileSidebarReturnFocusRef.current
    setMobileSidebarOpen(false)
    window.requestAnimationFrame(() => {
      if (returnFocusElement?.isConnected) {
        returnFocusElement.focus()
      }
      mobileSidebarReturnFocusRef.current = null
    })
  }

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

  function handleSubmit(query: string, timing: NeedTiming = 'flexible', timingDate?: string) {
    setRefinementComposerOpen(false)
    const turnSearchContext = { ...searchContext, timing, ...(timingDate === undefined ? {} : { timingDate }) }
    const intent = classifyFollowUpIntent(query, completedTurnCount)
    captureClientProductEventOnClient('query_submitted', {
      query_length: query.length,
      search_mode: turnSearchContext.mode,
      search_location: aeSearchContextLocationLabel(turnSearchContext) ?? 'none',
    })
    emitChatFunnelEvents(buildChatSubmitFunnelEvents({ query, completedTurnCount }))
    startTurn(query, turnSearchContext, intent)
  }

  function handleThreadCreated(id: string, turnMeta?: { turnId: string; turnSeq: number }) {
    pendingThreadIdRef.current = id
    setSessionThreadId(id)
    if (turnMeta !== undefined) {
      setLiveTurn((current) => {
        if (current === null || current.turnId === turnMeta.turnId) {
          return current
        }
        return { ...current, turnId: turnMeta.turnId, turnSeq: turnMeta.turnSeq }
      })
    }
    setThreadRecords((current) => upsertOptimisticThread(current, {
      threadId: id,
      title: liveTurn?.query.trim() ?? 'New question',
    }))
    emitWave1JourneyEvent({
      event: 'shortlist_started',
      eventVersion: 1,
      journey: 'J2',
      pseudonymousJourneyId: getOrCreatePseudonymousJourneyId('J2', id),
    })
  }

  function handleSettledTurn(turn: PublicThreadTurn, generation: number) {
    const threadIdForTurn = routeThreadId ?? sessionThreadId ?? pendingThreadIdRef.current
    if (threadIdForTurn === null) {
      return
    }
    settledProjectionHandoffRef.current = {
      threadId: threadIdForTurn,
      title: threadsRef.current.find((thread) => thread.threadId === threadIdForTurn)?.title ?? turn.query,
      turns: [turn],
    }
    setOptimisticTurns((current) => {
      const nextRecord = {
        threadId: threadIdForTurn,
        stableKey: `live-${generation}`,
        turn,
      } satisfies OptimisticTurnRecord
      return [
        ...current.filter((record) => record.threadId !== threadIdForTurn || record.turn.turnId !== turn.turnId),
        nextRecord,
      ]
    })
    if (settledShortlistFromArtifacts(turn.artifacts, turn.timing) !== null) {
      emitWave1JourneyEvent({
        event: 'shortlist_ready',
        eventVersion: 1,
        journey: 'J2',
        pseudonymousJourneyId: getOrCreatePseudonymousJourneyId('J2', threadIdForTurn),
      })
    }
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
      const handoff = settledProjectionHandoffRef.current?.threadId === pendingId
        ? settledProjectionHandoffRef.current
        : undefined
      if (handoff !== undefined) {
        writeThreadProjectionHandoff(handoff)
      }
      void Promise.resolve(navigate({
        to: '/t/$threadId',
        params: { threadId: pendingId },
        replace: true,
      })).finally(() => {
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
    handleSubmit(query, composerTiming, composerTimingDate)
  }

  function handleChangeCriteria() {
    setRefinementComposerOpen(true)
  }

  function handleRetry(query: string) {
    const retryIntent = liveTurn?.query === query ? liveTurn.intent : classifyFollowUpIntent(query, completedTurnCount)
    const retryContext = { ...searchContext, timing: composerTiming, ...(composerTimingDate === undefined ? {} : { timingDate: composerTimingDate }) }
    startTurn(query, retryContext, retryIntent)
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
  const showThreadChrome = routeThreadId !== null && projection !== null
  // Session-level orientation (inquiry path + saved context) is premature during
  // the very first streaming reveal - there is no settled context to orient yet,
  // and stacking it on the live turn is the info dump we are removing. Show it
  // once at least one turn has completed, so the first prompt streams cleanly.
  const showSessionChrome = completedTurnCount >= 1

  // Keep scroller mounted while a turn streams - sessionThreadId updates mid-stream must not remount.
  const scrollerKey = routeThreadId ?? (liveTurn !== null ? 'live' : sessionThreadId) ?? 'home'
  const defaultScrollPosition =
    completedTurnCount > 0 && liveTurn === null ? ('last-anchor' as const) : ('end' as const)
  const settleMessageId =
    liveTurn === null && completedTurns.length > 0 ? (completedTurns[completedTurns.length - 1]?.turnId ?? null) : null
  const followUpComposerCopy = buildFollowUpComposerCopy(completedTurns, liveTurn?.intent ?? null)

  // Both large-screen column states are explicit so the content column resizes
  // smoothly and the sidebar slides in from a 0-width track instead of the
  // layout hard-jumping when it mounts/toggles.
  const sidebarGridCols = sidebarVisible
    ? 'lg:grid-cols-[clamp(13.5rem,16vw,16.25rem)_minmax(0,1fr)]'
    : 'lg:grid-cols-[0rem_minmax(0,1fr)]'
  const shell = (
    <div className={`grid h-full min-h-0 w-full bg-body motion-safe:transition-[grid-template-columns] motion-safe:duration-base motion-safe:ease-standard ${sidebarGridCols}`}>
      <Dialog
        id="ae-thread-mobile-sidebar"
        isOpen={mobileSidebarOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeMobileSidebar()
          }
        }}
        variant="fullscreen"
        purpose="info"
        padding={0}
        role="dialog"
        aria-labelledby="ae-thread-mobile-sidebar-title"
        className="lg:hidden"
      >
        <div className="relative h-dvh w-dvw overflow-hidden">
          <button
            type="button"
            className="absolute inset-0 bg-primary/20"
            aria-label="Close recent questions panel"
            tabIndex={-1}
            onClick={closeMobileSidebar}
          />
        <div className="absolute inset-y-0 left-0 flex w-80 max-w-full flex-col border-r border-border bg-body shadow-low">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
              <h2 id="ae-thread-mobile-sidebar-title" className="font-heading text-base font-semibold text-primary">
                Recent questions
              </h2>
              <Button
                label="Close recent questions"
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11"
                icon={<XIcon aria-hidden="true" />}
                isIconOnly
                data-autofocus=""
                onClick={closeMobileSidebar}
              />
            </div>
            <AeThreadSidebar
              threads={threads}
              activeThreadId={routeThreadId}
              visible
              layout="mobile"
              onDelete={handleDeleteThread}
              onNavigate={closeMobileSidebar}
            />
          </div>
        </div>
      </Dialog>
      <AeThreadSidebar threads={threads} activeThreadId={routeThreadId} visible={sidebarVisible} onDelete={handleDeleteThread} />
      <div className="flex h-full min-h-0 w-full flex-col bg-body lg:col-start-2">
        {showSidebarToggle ? (
          <div className={`flex min-h-10 items-center px-4 pt-2 md:px-6${showThreadChrome ? ' hidden lg:flex' : ''}`}>
            <IconButton
              label="Open recent questions"
              variant="ghost"
              size="sm"
              className="min-h-11 text-secondary lg:hidden"
              icon={<PanelLeftIcon aria-hidden="true" />}
              onClick={openMobileSidebar}
              aria-controls="ae-thread-mobile-sidebar"
              aria-expanded={mobileSidebarOpen}
            />
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
        {showThreadChrome ? (
          <AeThreadHeader
            title={projection.title}
            threadId={projection.threadId}
            showSidebarButton={showSidebarToggle}
            onOpenSidebar={openMobileSidebar}
            sidebarOpen={mobileSidebarOpen}
          />
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
            {showSessionChrome ? (
              <>
                <AeSessionJourney projection={sessionProjection} liveTurn={liveTurn} />
                <AeSessionContextPanel projection={sessionProjection} liveTurn={liveTurn} />
              </>
            ) : null}
            <AeThreadTranscript
              threadId={streamingThreadId}
              projection={projection}
              liveTurn={liveTurn}
              turnRenderKeys={turnRenderKeys}
              onThreadCreated={handleThreadCreated}
              onStreamEnd={handleStreamEnd}
              onSettledTurn={handleSettledTurn}
              {...(routeThreadId === null ? {} : { onFollowUp: handleFollowUp })}
              {...(routeThreadId === null ? {} : { onChangeCriteria: handleChangeCriteria })}
              onRetry={handleRetry}
            />
            {showThreadChrome ? (
              <div className="mx-auto w-full max-w-[56rem] px-4 pb-4 md:px-6" role="note" aria-label="Thread access and retention">
                <Text type="supporting" color="secondary" display="block">
                  This thread has no automatic expiry. Anyone with its link can open it; the creating browser can delete it from Recent questions.
                </Text>
              </div>
            ) : null}
          </AeThreadScroller>
          {!showWelcome && (terminalShortlist === null || refinementComposerOpen) ? (
            <div className="mx-auto w-full max-w-[56rem] flex-none bg-body px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
              <AeQueryPanel
                onSubmit={handleSubmit}
                busy={streamingBusy}
                searchContext={searchContext}
                showExamples={false}
                defaultValue={refinementComposerOpen ? (latestProjectedTurn?.query ?? '') : ''}
                focusOnMount={refinementComposerOpen}
                initialTiming={composerTiming}
                {...(composerTimingDate === undefined ? {} : { initialTimingDate: composerTimingDate })}
                {...(followUpComposerCopy === null ? {} : { placeholder: followUpComposerCopy.placeholder })}
                {...(followUpComposerCopy === null ? {} : { loopHint: followUpComposerCopy.loopHint })}
              />
            </div>
          ) : null}
          {landingMode ? (
            <div
              className={`absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-body px-4 py-12 md:px-6 motion-safe:transition-opacity motion-safe:duration-base motion-safe:ease-standard${!showWelcome ? ' pointer-events-none invisible opacity-0' : ''}`}
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

function mergeProjectionWithOptimisticTurns(input: {
  serverProjection: PublicThreadProjection | null
  streamingThreadId: string | null
  optimisticTurns: readonly OptimisticTurnRecord[]
  omitTurnId?: string | null
}): PublicThreadProjection | null {
  if (input.streamingThreadId === null) {
    return input.serverProjection
  }

  const scopedOptimisticTurns: PublicThreadProjection['turns'][number][] = []
  for (const record of input.optimisticTurns) {
    if (record.threadId === input.streamingThreadId && record.turn.turnId !== input.omitTurnId) {
      scopedOptimisticTurns.push(record.turn)
    }
  }

  if (scopedOptimisticTurns.length === 0) {
    return input.serverProjection
  }

  if (input.serverProjection === null) {
    return {
      threadId: input.streamingThreadId,
      title: scopedOptimisticTurns[0]?.query ?? 'New question',
      turns: scopedOptimisticTurns,
    } satisfies PublicThreadProjection
  }

  const serverTurnIds = new Set(input.serverProjection.turns.map((turn) => turn.turnId))
  const pendingTurns = scopedOptimisticTurns.filter((turn) => !serverTurnIds.has(turn.turnId))
  if (pendingTurns.length === 0) {
    return input.serverProjection
  }

  return {
    ...input.serverProjection,
    turns: [...input.serverProjection.turns, ...pendingTurns].sort((left, right) => left.seq - right.seq),
  } satisfies PublicThreadProjection
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
  const optimistic = current.flatMap((thread) => {
    const sanitized = sanitizeThreadRecord(thread)
    return incomingIds.has(sanitized.threadId) ? [] : [sanitized]
  })
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
