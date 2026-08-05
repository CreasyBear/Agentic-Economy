import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PanelLeftIcon, XIcon } from 'lucide-react'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { captureClientProductEventOnClient } from '@/lib/observability/capture-client-events'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'
import {
  emitWave1JourneyEvent,
  getOrCreatePseudonymousJourneyId,
  markJourneyViewedAfterReopenWindow,
} from '@/lib/ui/journey-events'
import { cn } from '@/lib/utils'
import { mergeThreadRecords, upsertOptimisticThread, useStoredThreadRecords, writeStoredThreadRecords } from './thread-records-store'
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
  const [optimisticTurns, setOptimisticTurns] = useState<readonly OptimisticTurnRecord[]>([])
  const searchContext = DEFAULT_AE_SEARCH_CONTEXT
  const [sidebarManuallyOpen, setSidebarManuallyOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [refinementComposerOpen, setRefinementComposerOpen] = useState(false)
  const pendingThreadIdRef = useRef<string | null>(null)
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
    routeThreadId === null ? null : (fetchedRouteProjection?.projection ?? initialRouteProjection ?? null)
  const projectionUnavailable =
    routeThreadId !== null &&
    (initialProjection === null || (initialRouteProjection === null && fetchedRouteProjection?.unavailable === true))
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
  const settleMessageId = liveTurn === null ? (completedTurns.at(-1)?.turnId ?? null) : null
  const followUpComposerCopy = buildFollowUpComposerCopy(completedTurns, liveTurn?.intent ?? null)

  // Both large-screen column states are explicit so the content column resizes
  // smoothly and the sidebar slides in from a 0-width track instead of the
  // layout hard-jumping when it mounts/toggles.
  const sidebarGridCols = sidebarVisible
    ? 'lg:grid-cols-[clamp(13.5rem,16vw,16.25rem)_minmax(0,1fr)]'
    : 'lg:grid-cols-[0rem_minmax(0,1fr)]'
  const shell = (
    <div className={cn('grid h-full min-h-0 w-full bg-background motion-safe:transition-[grid-template-columns] motion-safe:duration-base motion-safe:ease-standard', sidebarGridCols)}>
      <Dialog
        open={mobileSidebarOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeMobileSidebar()
          }
        }}
      >
        <DialogContent
          id="ae-thread-mobile-sidebar"
          className="h-dvh w-dvw max-w-none rounded-none border-0 bg-transparent p-0 shadow-none lg:hidden"
          showCloseButton={false}
        >
        <div className="relative h-dvh w-dvw overflow-hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute inset-0 size-auto rounded-none bg-primary/20 hover:bg-primary/20 dark:hover:bg-primary/20"
            aria-label="Close recent questions panel"
            tabIndex={-1}
            onClick={closeMobileSidebar}
          />
        <div className="absolute inset-y-0 left-0 flex w-80 max-w-full flex-col border-r border-border bg-background shadow-low">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
              <DialogTitle className="font-heading text-base font-semibold text-foreground">
                Recent questions
              </DialogTitle>
              <DialogDescription className="sr-only">Choose a recent question to reopen.</DialogDescription>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label="Close recent questions"
                data-autofocus=""
                onClick={closeMobileSidebar}
              >
                <XIcon aria-hidden="true" />
              </Button>
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
        </DialogContent>
      </Dialog>
      <AeThreadSidebar threads={threads} activeThreadId={routeThreadId} visible={sidebarVisible} onDelete={handleDeleteThread} />
      <div className="flex h-full min-h-0 w-full flex-col bg-background lg:col-start-2">
        {showSidebarToggle ? (
          <div className={cn('flex min-h-10 items-center px-4 pt-2 md:px-6', showThreadChrome && 'hidden lg:flex')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 text-muted-foreground lg:hidden"
              aria-label="Open recent questions"
              onClick={openMobileSidebar}
              aria-controls="ae-thread-mobile-sidebar"
              aria-expanded={mobileSidebarOpen}
            >
              <PanelLeftIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 hidden text-muted-foreground lg:inline-flex"
              aria-label={sidebarVisible ? 'Hide recent questions' : 'Show recent questions'}
              onClick={() => setSidebarManuallyOpen((value) => !value)}
              aria-controls="ae-thread-sidebar"
              aria-expanded={sidebarVisible}
            >
              <PanelLeftIcon aria-hidden="true" />
            </Button>
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
                <Empty className="border border-border bg-card p-5">
                  <EmptyHeader>
                    <h1 className="text-lg font-medium tracking-tight">Thread unavailable</h1>
                    <EmptyDescription>This answer thread could not be found or loaded. Start a fresh search to keep going.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button asChild variant="secondary" size="sm">
                      <a href="/">Start a new search</a>
                    </Button>
                  </EmptyContent>
                </Empty>
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
                <p className="block text-sm text-muted-foreground">
                  This thread has no automatic expiry. Anyone with its link can open it; the creating browser can delete it from Recent questions.
                </p>
              </div>
            ) : null}
          </AeThreadScroller>
          {!showWelcome && (terminalShortlist === null || refinementComposerOpen) ? (
            <div className="mx-auto w-full max-w-[56rem] flex-none bg-background px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
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
              className={cn('absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-background px-4 py-12 md:px-6 motion-safe:transition-opacity motion-safe:duration-base motion-safe:ease-standard', !showWelcome && 'pointer-events-none invisible opacity-0')}
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
    turns: [...input.serverProjection.turns, ...pendingTurns].toSorted((left, right) => left.seq - right.seq),
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


