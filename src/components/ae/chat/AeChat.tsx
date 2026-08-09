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
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { mergeThreadRecords, upsertOptimisticThread, useStoredThreadRecords, writeStoredThreadRecords } from './thread-records-store'
import { mergeProjectionWithOptimisticTurns, type OptimisticTurnRecord } from './projection-merge'
import { readAnswerThreadProjection } from './thread-readback'
import { stopAnswerTurnRequest, type StopAnswerTurnResult } from './turn-stop'
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
  clientTurnKey: string
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

type ThreadRecordsUpdater =
  | readonly AnswerThreadRecord[]
  | ((current: readonly AnswerThreadRecord[]) => readonly AnswerThreadRecord[])

const pageClientTurnScope = createClientTurnKey()

export function AeChat({ threadId = null, initialQuery = null, initialProjection }: AeChatProps) {
  const navigate = useNavigate()
  const routeThreadId = threadId
  const [newChatDraft, setNewChatDraft] = useState(false)
  // 'New question' enters a blank-thread draft in place: while a fresh chat is
  // composing/settling we behave as if the route were blank (transcript cleared,
  // composer is the landing), so the new query creates and navigates to its own
  // thread exactly like the true blank-thread path does.
  const effectiveRouteThreadId = newChatDraft ? null : routeThreadId
  const initialRouteQuery = effectiveRouteThreadId === null ? (initialQuery?.trim() ?? '') : ''
  const initialLiveTurn =
    initialRouteQuery.length > 0
      ? ({
          query: initialRouteQuery,
          generation: 1,
          clientTurnKey: canonicalDigest({ pageClientTurnScope, query: initialRouteQuery }),
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
  const [sidebarManuallyOpen, setSidebarManuallyOpen] = useState<boolean | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [refinementComposerOpen, setRefinementComposerOpen] = useState(false)
  const pendingThreadIdRef = useRef<string | null>(null)
  const mobileSidebarOpenerRef = useRef<HTMLElement | null>(null)
  const routeFocusHeadingRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    // A route change (coming back to a thread, or a fresh thread settling) ends
    // any in-place blank-thread draft.
    setNewChatDraft(false)
    setRefinementComposerOpen(false)
  }, [routeThreadId])
  useLayoutEffect(() => {
    threadsRef.current = threads
  }, [threads])

  useLayoutEffect(() => {
    const activeElement = document.activeElement
    const activeControl = activeElement !== null
      && activeElement !== document.body
      && activeElement.matches('a[href], button, input, select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])')
    if (activeControl) {
      return
    }

    const target = routeFocusHeadingRef.current ?? document.getElementById('main-content')
    target?.focus({ preventScroll: true })
  }, [routeThreadId])

  const setThreadRecords = useCallback((updater: ThreadRecordsUpdater) => {
    const nextThreads = typeof updater === 'function' ? updater(threadsRef.current) : updater
    writeStoredThreadRecords(nextThreads)
  }, [])

  const initialRouteProjection =
    effectiveRouteThreadId !== null && initialProjection?.threadId === effectiveRouteThreadId ? initialProjection : null
  const fetchedRouteProjection = fetchedProjection?.threadId === effectiveRouteThreadId ? fetchedProjection : null
  const serverProjection =
    effectiveRouteThreadId === null ? null : (fetchedRouteProjection?.projection ?? initialRouteProjection ?? null)
  const projectionUnavailable =
    effectiveRouteThreadId !== null && fetchedRouteProjection?.unavailable === true
  const streamingThreadId = effectiveRouteThreadId ?? sessionThreadId
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
  const showWelcome = effectiveRouteThreadId === null && liveTurn === null && (projection?.turns.length ?? 0) === 0
  const showThreadUnavailable = effectiveRouteThreadId !== null && projection === null && liveTurn === null && projectionUnavailable
  const completedTurns = sessionProjection?.turns.filter((turn) => turn.status === 'complete') ?? []
  const completedTurnCount = completedTurns.length
  const latestProjectedTurn = sessionProjection?.turns.at(-1)
  const terminalShortlist = liveTurn === null && latestProjectedTurn?.status === 'complete'
    ? settledShortlistFromArtifacts(latestProjectedTurn.artifacts, latestProjectedTurn.timing)
    : null
  const composerTiming = latestProjectedTurn?.timing ?? liveTurn?.searchContext.timing ?? 'flexible'
  const composerTimingDate = latestProjectedTurn?.timingDate ?? liveTurn?.searchContext.timingDate
  const terminalLayoutProfile = liveTurn === null && latestProjectedTurn?.status === 'complete'
    ? latestProjectedTurn.layoutProfile
    : undefined
  const showBusinessComposerControls =
    terminalLayoutProfile === undefined
    || terminalLayoutProfile === 'discovery_full'
    || terminalLayoutProfile === 'clarification'
    || terminalLayoutProfile === 'refinement_compact'
    || terminalLayoutProfile === 'compare_pair'
  const showComposerTiming = showBusinessComposerControls
  useEffect(() => {
    if (effectiveRouteThreadId === null || terminalShortlist === null) {
      return
    }

    const pseudonymousJourneyId = getOrCreatePseudonymousJourneyId('J2', effectiveRouteThreadId)
    if (markJourneyViewedAfterReopenWindow('J2', effectiveRouteThreadId)) {
      emitWave1JourneyEvent({
        event: 'shortlist_reopened',
        eventVersion: 1,
        journey: 'J2',
        pseudonymousJourneyId,
      })
    }
  }, [effectiveRouteThreadId, terminalShortlist])


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
    const result = await readAnswerThreadProjection(id)
    if (result.kind === 'ok') {
      setFetchedProjection({ threadId: id, projection: result.projection, unavailable: false })
      return
    }
    setFetchedProjection({ threadId: id, projection: null, unavailable: true })
  }, [])

  const handleStopPendingTurn = useCallback(async (id: string, turnId: string): Promise<StopAnswerTurnResult> => {
    const result = await stopAnswerTurnRequest({ threadId: id, turnId })
    if (result.kind === 'stopped' || result.kind === 'already_settled') {
      await refreshProjection(id)
    }
    return result
  }, [refreshProjection])


  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  useEffect(() => {
    if (effectiveRouteThreadId === null) {
      return
    }
    if (initialProjection?.threadId === effectiveRouteThreadId) {
      return
    }
    void refreshProjection(effectiveRouteThreadId)
  }, [effectiveRouteThreadId, initialProjection, refreshProjection])


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
    mobileSidebarOpenerRef.current = activeElement instanceof HTMLElement ? activeElement : null
    setMobileSidebarOpen(true)
  }

  function closeMobileSidebar() {
    setMobileSidebarOpen(false)
  }

  function startTurn(
    query: string,
    context: AeSearchContext = searchContext,
    intent: FollowUpIntent = classifyFollowUpIntent(query, completedTurnCount),
  ) {
    setStreamingBusy(true)
    const nextGeneration = generationRef.current + 1
    generationRef.current = nextGeneration
    setLiveTurn({
      query,
      generation: nextGeneration,
      clientTurnKey: createClientTurnKey(),
      searchContext: context,
      intent,
    })
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
    const threadIdForTurn = effectiveRouteThreadId ?? sessionThreadId ?? pendingThreadIdRef.current
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

  function handleStreamEnd(outcome: 'complete' | 'pending' | 'error' | 'stopped') {
    setStreamingBusy(false)
    if (outcome === 'complete' || pendingThreadIdRef.current !== null || effectiveRouteThreadId !== null) {
      handleTurnSettled(outcome)
    }
  }

  function handleTurnSettled(outcome: 'complete' | 'pending' | 'error' | 'stopped') {
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
    if (effectiveRouteThreadId === null && pendingId !== null) {
      pendingThreadIdRef.current = null
      void Promise.resolve(navigate({ to: '/t/$threadId', params: { threadId: pendingId }, replace: true })).finally(() => {
        clearLiveTurnIfSettled(settledGeneration)
        void refreshThreads()
      })
      return
    }

    clearLiveTurnIfSettled(settledGeneration)
    void refreshThreads()

    if (effectiveRouteThreadId !== null) {
      void refreshProjection(effectiveRouteThreadId)
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

  function handleNewQuestion() {
    // Reset to a fresh blank thread in place (client-only): the route stays put,
    // but the transcript, live turn, optimistic turns and composer are cleared so
    // the next submitted query starts a brand-new thread and navigates to it.
    setNewChatDraft(true)
    setStreamingBusy(false)
    generationRef.current = 0
    setLiveTurn(null)
    setSessionThreadId(null)
    pendingThreadIdRef.current = null
    setOptimisticTurns([])
    setRefinementComposerOpen(false)
    setMobileSidebarOpen(false)
  }

  function handleDeleteThread(deletedThreadId: string) {
    setThreadRecords((current) => current.filter((thread) => thread.threadId !== deletedThreadId))
    if (effectiveRouteThreadId === deletedThreadId) {
      void navigate({ to: '/', replace: true })
    }
  }

  const landingMode = showWelcome || leavingWelcome

  const sidebarContextActive = effectiveRouteThreadId !== null || liveTurn !== null
  const showSidebarToggle = sidebarContextActive || threads.length > 0 || sidebarManuallyOpen === true
  const sidebarVisible = sidebarManuallyOpen ?? sidebarContextActive
  const showThreadChrome = effectiveRouteThreadId !== null && projection !== null
  // Session-level business orientation is premature during the first stream and
  // incompatible with terminal data, no-match, refusal, and boundary profiles.
  const showSessionChrome = completedTurnCount >= 1 && showBusinessComposerControls

  // Keep scroller mounted while a turn streams - sessionThreadId updates mid-stream must not remount.
  const scrollerKey = effectiveRouteThreadId ?? (liveTurn !== null ? 'live' : sessionThreadId) ?? 'home'
  const defaultScrollPosition =
    completedTurnCount > 0 && liveTurn === null ? ('last-anchor' as const) : ('end' as const)
  const settleMessageId = liveTurn === null ? (completedTurns.at(-1)?.turnId ?? null) : null
  const followUpComposerCopy =
    showBusinessComposerControls || terminalLayoutProfile === 'data_answer'
      ? buildFollowUpComposerCopy(completedTurns, liveTurn?.intent ?? null)
      : {
          placeholder: terminalLayoutProfile === 'empty_state'
            ? 'Refine your request or ask a different question'
            : 'Ask a different question',
          loopHint: '',
        }

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
          inert={!mobileSidebarOpen}
          aria-hidden={!mobileSidebarOpen}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const opener = mobileSidebarOpenerRef.current
            mobileSidebarOpenerRef.current = null
            if (opener?.isConnected) opener.focus()
          }}
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
              activeThreadId={effectiveRouteThreadId}
              visible
              layout="mobile"
              onDelete={handleDeleteThread}
              onNavigate={closeMobileSidebar}
              onNewQuestion={handleNewQuestion}
            />
          </div>
        </div>
        </DialogContent>
      </Dialog>
      <AeThreadSidebar threads={threads} activeThreadId={effectiveRouteThreadId} visible={sidebarVisible} onDelete={handleDeleteThread} onNewQuestion={handleNewQuestion} />
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
              onClick={() => setSidebarManuallyOpen((value) => !(value ?? sidebarContextActive))}
              aria-controls="ae-thread-sidebar"
              aria-expanded={sidebarVisible}
            >
              <PanelLeftIcon aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {showThreadChrome ? (
          <AeThreadHeader
            key={projection.threadId}
            title={projection.title}
            threadId={projection.threadId}
            showSidebarButton={showSidebarToggle}
            onOpenSidebar={openMobileSidebar}
            sidebarOpen={mobileSidebarOpen}
            onNewQuestion={handleNewQuestion}
          />
        ) : null}
        {effectiveRouteThreadId === null && liveTurn !== null ? (
          <h1 ref={routeFocusHeadingRef} className="sr-only" tabIndex={-1}>
            Answering your question
          </h1>
        ) : null}
        <div className="relative flex min-h-0 flex-1 flex-col max-sm:[&_[role=radio]]:min-h-11 max-sm:[&_input[type=date]]:min-h-11 max-sm:[&_button[type=submit]]:min-h-11 max-sm:[&_button[type=submit]]:min-w-11">
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
              {...(effectiveRouteThreadId === null ? {} : { onFollowUp: handleFollowUp })}
              {...(effectiveRouteThreadId === null || !showBusinessComposerControls ? {} : { onChangeCriteria: handleChangeCriteria })}
              onStopPendingTurn={handleStopPendingTurn}
              onRetry={handleRetry}
            />
            {showThreadChrome ? (
              <div className="mx-auto w-full max-w-[56rem] px-4 pb-4 md:px-6" role="note" aria-label="Thread access and retention">
                <p className="block text-sm text-muted-foreground">
                  Private to this browser by default. Explicit share links are read-only and remain active until revoked or this thread is deleted.
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
                showTiming={showComposerTiming}
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
function createClientTurnKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}


