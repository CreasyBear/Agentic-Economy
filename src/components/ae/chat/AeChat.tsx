import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { XIcon } from 'lucide-react'
import { z } from 'zod'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { captureClientProductEventOnClient } from '@/lib/observability/capture-client-events'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'
import {
  emitWave1JourneyEvent,
  getOrCreatePseudonymousJourneyId,
  markJourneyViewedAfterReopenWindow,
} from '@/lib/ui/journey-events'
import { cn } from '@/lib/utils'
import { ANSWER_OPERATION_INPUT_MAX_BYTES } from '@/modules/answer/public'
import { mergeThreadRecords, upsertOptimisticThread, useStoredThreadRecords, writeStoredThreadRecords } from './thread-records-store'
import { mergeProjectionWithOptimisticTurns, type OptimisticTurnRecord } from './projection-merge'
import { readAnswerThreadProjection } from './thread-readback'
import { stopAnswerTurnRequest, type StopAnswerTurnResult } from './turn-stop'
import {
  DEFAULT_AE_SEARCH_CONTEXT,
  AeSearchContextSchema,
  aeSearchContextLocationLabel,
  stableAeSearchContextKey,
  type AeSearchContext,
  type NeedTiming,
} from '@/modules/answer/search-context'
import { QUERY_MAX_LENGTH } from '@/lib/query-length'
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

export type PendingAnswerTurnDraft = Readonly<{
  version: 1
  query: string
  clientTurnKey: string
  searchContext?: AeSearchContext
  threadId?: string
}>

export type PendingAnswerTurnDraftStorageError = Readonly<{
  kind: 'storage_error'
  operation: 'read' | 'write' | 'clear'
  code: 'unavailable' | 'too_large'
}>

type DraftReadResult =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'ok'; draft: PendingAnswerTurnDraft }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'storage_error'; error: PendingAnswerTurnDraftStorageError }>

type DraftWriteResult =
  | Readonly<{ kind: 'stored' }>
  | Readonly<{ kind: 'storage_error'; error: PendingAnswerTurnDraftStorageError }>

type InitialDraftResolution =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'ready'; draft: PendingAnswerTurnDraft }>
  | Readonly<{ kind: 'storage_error'; error: PendingAnswerTurnDraftStorageError }>

const PENDING_ANSWER_TURN_DRAFT_STORAGE_KEY = 'ae.answer.initial-turn-key.v1'
const PENDING_ANSWER_TURN_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1_000
const PENDING_ANSWER_TURN_DRAFT_MAX_BYTES = 8_192
const CLIENT_TURN_KEY_PATTERN = /^[a-z0-9-]{8,128}$/iu
const THREAD_ID_MAX_LENGTH = 160
const pendingAnswerTurnDraftSchema = z.strictObject({
  version: z.literal(1),
  query: z.string().refine((query) => query.trim() === query && answerTurnQueryWithinLimit(query)),
  clientTurnKey: z.string().regex(CLIENT_TURN_KEY_PATTERN),
  searchContext: AeSearchContextSchema.optional(),
  threadId: z.string()
    .refine((threadId) => threadId.trim() === threadId)
    .min(1)
    .max(THREAD_ID_MAX_LENGTH)
    .optional(),
  savedAt: z.number().refine((savedAt) => {
    const now = Date.now()
    return Number.isFinite(savedAt)
      && savedAt > 0
      && savedAt <= now + 5 * 60 * 1_000
      && now - savedAt <= PENDING_ANSWER_TURN_DRAFT_MAX_AGE_MS
  }),
}).transform(({ savedAt: _savedAt, searchContext, threadId, ...draft }) => ({
  ...draft,
  ...(searchContext === undefined ? {} : { searchContext }),
  ...(threadId === undefined ? {} : { threadId }),
} satisfies PendingAnswerTurnDraft))

export function AeChat({ threadId = null, initialQuery = null, initialProjection }: AeChatProps) {
  const navigate = useNavigate()
  const routeThreadId = threadId
  const effectiveRouteThreadId = routeThreadId
  const initialRouteQuery = effectiveRouteThreadId === null ? (initialQuery?.trim() ?? '') : ''
  const [initialDraftResolution] = useState<InitialDraftResolution>(() =>
    resolveInitialDraft(initialRouteQuery, effectiveRouteThreadId),
  )
  const initialDraft = initialDraftResolution.kind === 'ready' ? initialDraftResolution.draft : null
  const initialLiveTurn =
    initialDraft === null
      ? null
      : ({
          query: initialDraft.query,
          generation: 1,
          clientTurnKey: initialDraft.clientTurnKey,
          searchContext: initialDraft.searchContext ?? DEFAULT_AE_SEARCH_CONTEXT,
          intent: 'refine_search',
        } satisfies LiveTurn)
  const [fetchedProjection, setFetchedProjection] = useState<ProjectionFetchState | null>(null)
  const threads = useStoredThreadRecords()
  const threadsRef = useRef(threads)
  const [liveTurn, setLiveTurn] = useState<LiveTurn | null>(initialLiveTurn)
  const generationRef = useRef(initialLiveTurn === null ? 0 : 1)
  const [streamingBusy, setStreamingBusy] = useState(initialLiveTurn !== null)
  const [activeTurnStop, setActiveTurnStop] = useState<(() => Promise<void>) | null>(null)
  const [sessionThreadId, setSessionThreadId] = useState<string | null>(initialDraft?.threadId ?? null)
  const [optimisticTurns, setOptimisticTurns] = useState<readonly OptimisticTurnRecord[]>([])
  const searchContext = DEFAULT_AE_SEARCH_CONTEXT
  const [draftStorageError, setDraftStorageError] = useState<PendingAnswerTurnDraftStorageError | null>(
    initialDraftResolution.kind === 'storage_error' ? initialDraftResolution.error : null,
  )
  const [sidebarManuallyOpen, setSidebarManuallyOpen] = useState<boolean | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [refinementComposerOpen, setRefinementComposerOpen] = useState(false)
  const pendingThreadIdRef = useRef<string | null>(initialDraft?.threadId ?? null)
  const readbackSupportedTurnIdsRef = useRef(new Set<string>())
  const mobileSidebarOpenerRef = useRef<HTMLElement | null>(null)
  const routeFocusHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const previousRouteThreadIdRef = useRef(routeThreadId)

  useEffect(() => {
    setRefinementComposerOpen(false)
  }, [routeThreadId])
  useLayoutEffect(() => {
    threadsRef.current = threads
  }, [threads])

  useLayoutEffect(() => {
    const routeChanged = previousRouteThreadIdRef.current !== routeThreadId
    previousRouteThreadIdRef.current = routeThreadId
    const activeElement = document.activeElement
    const activeControl = activeElement !== null
      && activeElement !== document.body
      && activeElement.matches('a[href], button, input, select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])')
    if (!routeChanged && activeControl) {
      return
    }

    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [routeThreadId])

  const liveTurnGeneration = liveTurn?.generation
  const previousLiveTurnGenerationRef = useRef<number | undefined>(undefined)
  useLayoutEffect(() => {
    const generationChanged = previousLiveTurnGenerationRef.current !== liveTurnGeneration
    previousLiveTurnGenerationRef.current = liveTurnGeneration
    if (effectiveRouteThreadId !== null || liveTurnGeneration === undefined || !generationChanged) {
      return
    }

    routeFocusHeadingRef.current?.focus({ preventScroll: true })
  }, [effectiveRouteThreadId, liveTurnGeneration])

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
  const hasNonAuthoritativeOptimisticTurn = useMemo(
    () =>
      optimisticTurns.some((record) => {
        if (record.threadId !== streamingThreadId) {
          return false
        }
        const serverSupportsTurn = serverProjection?.turns.some((turn) => turn.turnId === record.turn.turnId) ?? false
        return !serverSupportsTurn && !readbackSupportedTurnIdsRef.current.has(record.turn.turnId)
      }),
    [optimisticTurns, serverProjection, streamingThreadId],
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

  function openMobileSidebar() {
    const activeElement = document.activeElement
    mobileSidebarOpenerRef.current = activeElement instanceof HTMLElement ? activeElement : null
    setMobileSidebarOpen(true)
  }

  function closeMobileSidebar() {
    setMobileSidebarOpen(false)
  }

  function toggleDesktopSidebar() {
    const nextVisible = !sidebarVisible
    setSidebarManuallyOpen(nextVisible)
    if (nextVisible) {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('#ae-thread-sidebar button')?.focus()
      })
    }
  }

  function startTurn(
    query: string,
    context: AeSearchContext = searchContext,
    intent: FollowUpIntent = classifyFollowUpIntent(query, completedTurnCount),
  ): boolean {
    const draftThreadId = effectiveRouteThreadId ?? sessionThreadId ?? undefined
    const stored = readPendingAnswerTurnDraft()
    const reusableDraft =
      stored.kind === 'ok' && draftMatchesTurn(stored.draft, query, context, draftThreadId)
        ? stored.draft
        : undefined
    const draft = reusableDraft ?? {
      version: 1 as const,
      query,
      clientTurnKey: createClientTurnKey(),
      searchContext: context,
      ...(draftThreadId === undefined ? {} : { threadId: draftThreadId }),
    }
    const saved = writePendingAnswerTurnDraft(draft)
    if (saved.kind === 'storage_error') {
      setDraftStorageError(saved.error)
      return false
    }
    setDraftStorageError(null)
    setStreamingBusy(true)
    const nextGeneration = generationRef.current + 1
    generationRef.current = nextGeneration
    setLiveTurn({
      query,
      generation: nextGeneration,
      clientTurnKey: draft.clientTurnKey,
      searchContext: context,
      intent,
    })
    return true
  }

  function handleSubmit(query: string, timing: NeedTiming = 'flexible', timingDate?: string) {
    setRefinementComposerOpen(false)
    const turnSearchContext = { ...searchContext, timing, ...(timingDate === undefined ? {} : { timingDate }) }
    const intent = classifyFollowUpIntent(query, completedTurnCount)
    if (!startTurn(query, turnSearchContext, intent)) {
      return
    }
    captureClientProductEventOnClient('query_submitted', {
      query_length: query.length,
      search_mode: turnSearchContext.mode,
      search_location: aeSearchContextLocationLabel(turnSearchContext) ?? 'none',
    })
    emitChatFunnelEvents(buildChatSubmitFunnelEvents({ query, completedTurnCount }))
  }

  function handleThreadCreated(id: string, turnMeta?: { turnId: string; turnSeq: number }) {
    pendingThreadIdRef.current = id
    setSessionThreadId(id)
    const currentTurn = liveTurn
    if (currentTurn !== null) {
      const saved = writePendingAnswerTurnDraft({
        version: 1,
        query: currentTurn.query,
        clientTurnKey: currentTurn.clientTurnKey,
        searchContext: currentTurn.searchContext,
        threadId: id,
      })
      if (saved.kind === 'storage_error') {
        setDraftStorageError(saved.error)
      } else {
        setDraftStorageError(null)
      }
    }
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
    readbackSupportedTurnIdsRef.current.add(turn.turnId)
    if (turn.status === 'error' && liveTurn?.generation === generation) {
      clearDraftAfterTerminal(liveTurn.clientTurnKey)
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

    const settledClientTurnKey = liveTurn?.clientTurnKey
    const terminalOutcome = outcome === 'complete' || outcome === 'stopped'
    const pendingId = pendingThreadIdRef.current
    if (effectiveRouteThreadId === null && pendingId !== null) {
      pendingThreadIdRef.current = null
      void Promise.resolve(navigate({ to: '/t/$threadId', params: { threadId: pendingId }, replace: true }))
        .then(() => {
          if (terminalOutcome) {
            clearDraftAfterTerminal(settledClientTurnKey)
          }
        })
        .finally(() => {
          clearLiveTurnIfSettled(settledGeneration)
          void refreshThreads()
        })
      return
    }

    if (effectiveRouteThreadId !== null && terminalOutcome) {
      clearDraftAfterTerminal(settledClientTurnKey)
    }

    clearLiveTurnIfSettled(settledGeneration)
    void refreshThreads()

    if (effectiveRouteThreadId !== null) {
      void refreshProjection(effectiveRouteThreadId)
    }
  }

  function clearDraftAfterTerminal(clientTurnKey: string | undefined): void {
    const cleared = clearPendingAnswerTurnDraft(clientTurnKey)
    if (cleared.kind === 'storage_error') {
      setDraftStorageError(cleared.error)
    } else {
      setDraftStorageError(null)
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

  const handleLiveStopChange = useCallback((stop: (() => Promise<void>) | null) => {
    setActiveTurnStop(() => stop)
  }, [])

  function handleChangeCriteria() {
    setRefinementComposerOpen(true)
  }

  function handleRetry(query: string) {
    const retryIntent = liveTurn?.query === query ? liveTurn.intent : classifyFollowUpIntent(query, completedTurnCount)
    const retryContext = {
      ...searchContext,
      timing: composerTiming,
      ...(composerTimingDate === undefined ? {} : { timingDate: composerTimingDate }),
    }
    startTurn(query, retryContext, retryIntent)
  }

  async function handleNewQuestion(): Promise<void> {
    const activeTurn = streamingThreadId === null
      ? null
      : liveTurn?.turnId !== undefined
        ? { threadId: streamingThreadId, turnId: liveTurn.turnId }
        : latestProjectedTurn?.status === 'pending'
          ? { threadId: streamingThreadId, turnId: latestProjectedTurn.turnId }
          : null
    if (activeTurn !== null) {
      const stopped = await handleStopPendingTurn(activeTurn.threadId, activeTurn.turnId)
      if (stopped.kind !== 'stopped' && stopped.kind !== 'already_settled') {
        return
      }
    }

    const cleared = clearPendingAnswerTurnDraft()
    setDraftStorageError(cleared.kind === 'storage_error' ? cleared.error : null)
    setStreamingBusy(false)
    generationRef.current = 0
    setLiveTurn(null)
    setSessionThreadId(null)
    pendingThreadIdRef.current = null
    readbackSupportedTurnIdsRef.current.clear()
    setOptimisticTurns([])
    setRefinementComposerOpen(false)
    setMobileSidebarOpen(false)
    await Promise.resolve(navigate({ to: '/t/new' }))
  }

  function handleDeleteThread(deletedThreadId: string) {
    setThreadRecords((current) => current.filter((thread) => thread.threadId !== deletedThreadId))
    if (effectiveRouteThreadId === deletedThreadId) {
      void navigate({ to: '/', replace: true })
    }
  }


  const sidebarContextActive = effectiveRouteThreadId !== null || liveTurn !== null
  const showSidebarToggle = sidebarContextActive || threads.length > 0 || sidebarManuallyOpen === true
  const sidebarVisible = sidebarManuallyOpen ?? threads.length > 0
  const showThreadChrome = effectiveRouteThreadId !== null && projection !== null
  const showCompactHeader = showThreadChrome || liveTurn !== null || threads.length > 0
  const compactHeaderTitle = showThreadChrome ? projection.title : (liveTurn?.query ?? 'New chat')

  // Keep scroller mounted while a turn streams - sessionThreadId updates mid-stream must not remount.
  const scrollerKey = effectiveRouteThreadId ?? (liveTurn !== null ? 'live' : sessionThreadId) ?? 'home'
  const defaultScrollPosition =
    completedTurnCount > 0 && liveTurn === null ? ('last-anchor' as const) : ('end' as const)
  const followUpComposerCopy =
    showBusinessComposerControls || terminalLayoutProfile === 'data_answer'
      ? buildFollowUpComposerCopy(completedTurns, liveTurn?.intent ?? null)
      : {
          placeholder: terminalLayoutProfile === 'empty_state'
            ? 'Try a different question'
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
    <div className={cn('grid h-full min-h-0 w-full grid-cols-[minmax(0,1fr)] bg-background motion-safe:transition-[grid-template-columns] motion-safe:duration-base motion-safe:ease-standard', sidebarGridCols)}>
      <Sheet
        open={mobileSidebarOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeMobileSidebar()
          }
        }}
      >
        <SheetContent
          id="ae-thread-mobile-sidebar"
          side="left"
          className="h-dvh w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 lg:hidden"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const opener = mobileSidebarOpenerRef.current
            mobileSidebarOpenerRef.current = null
            window.requestAnimationFrame(() => {
              if (opener?.isConnected) opener.focus()
            })
          }}
        >
          <SheetHeader className="border-b border-border">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <SheetTitle className="font-heading text-base">Recent chats</SheetTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label="Close recent chats"
                data-autofocus=""
                onClick={closeMobileSidebar}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
            <SheetDescription className="sr-only">Choose a recent chat to reopen.</SheetDescription>
          </SheetHeader>
          <AeThreadSidebar
            threads={threads}
            activeThreadId={effectiveRouteThreadId}
            visible
            layout="mobile"
            onDelete={handleDeleteThread}
            onNavigate={closeMobileSidebar}
            onNewQuestion={handleNewQuestion}
          />
        </SheetContent>
      </Sheet>
      <AeThreadSidebar threads={threads} activeThreadId={effectiveRouteThreadId} visible={sidebarVisible} onDelete={handleDeleteThread} onNewQuestion={handleNewQuestion} />
      <div className="flex h-full min-h-0 min-w-0 w-full flex-col bg-background lg:col-start-2">
        {showCompactHeader ? (
          <AeThreadHeader
            title={compactHeaderTitle}
            {...(showThreadChrome ? { threadId: projection.threadId } : {})}
            showSidebarButton={showSidebarToggle}
            onOpenMobileSidebar={openMobileSidebar}
            mobileSidebarOpen={mobileSidebarOpen}
            onToggleDesktopSidebar={toggleDesktopSidebar}
            desktopSidebarExpanded={sidebarVisible}
            onNewQuestion={handleNewQuestion}
          />
        ) : null}
        {effectiveRouteThreadId === null && liveTurn !== null ? (
          <h1 ref={routeFocusHeadingRef} className="sr-only" tabIndex={-1}>
            Answering your question
          </h1>
        ) : null}
        <div className={cn('relative flex min-h-0 flex-1 flex-col max-sm:[&_[role=combobox]]:min-h-11 max-sm:[&_[role=radio]]:min-h-11 max-sm:[&_input[type=date]]:min-h-11 max-sm:[&_button[type=submit]]:min-h-11 max-sm:[&_button[type=submit]]:min-w-11', showWelcome && 'gap-5 sm:gap-8')}>
          <AeThreadScroller
            key={scrollerKey}
            autoScroll={liveTurn !== null}
            defaultScrollPosition={defaultScrollPosition}
            streaming={streamingBusy}
            showJumpButton
            {...(showWelcome ? { className: 'mt-auto h-auto flex-none [&_[data-slot=message-scroller-content]]:min-h-0 [&_[data-slot=message-scroller-viewport]]:h-auto' } : {})}
            contentClassName={showWelcome || showThreadUnavailable ? 'justify-center' : '[&>[data-slot=message-scroller-item]:first-of-type]:mt-auto'}
          >
            {showWelcome ? <AeChatWelcome /> : null}
            {showThreadUnavailable ? (
              <Empty className="w-full">
                <EmptyHeader>
                  <h1 className="text-lg font-medium tracking-tight">Chat unavailable</h1>
                  <EmptyDescription>This chat couldn’t be loaded. Start a new chat to continue.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild variant="secondary" size="sm">
                    <a href="/">Start a new chat</a>
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <>
                {hasNonAuthoritativeOptimisticTurn ? (
                  <p className="w-full pb-2 text-sm text-muted-foreground" role="status">
                    Local answer preview — not authoritative until the saved answer is confirmed by readback.
                  </p>
                ) : null}
                <AeThreadTranscript
                  threadId={streamingThreadId}
                  projection={projection}
                  liveTurn={liveTurn}
                  turnRenderKeys={turnRenderKeys}
                  onThreadCreated={handleThreadCreated}
                  onStreamEnd={handleStreamEnd}
                  onSettledTurn={handleSettledTurn}
                  onLiveStopChange={handleLiveStopChange}
                  {...(effectiveRouteThreadId === null ? {} : { onFollowUp: handleFollowUp })}
                  {...(effectiveRouteThreadId === null || !showBusinessComposerControls ? {} : { onChangeCriteria: handleChangeCriteria })}
                  onStopPendingTurn={handleStopPendingTurn}
                  onRetry={handleRetry}
                />
              </>
            )}
          </AeThreadScroller>
          {!showThreadUnavailable ? (
            <div className={cn('w-full flex-none bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6', showWelcome ? 'mb-auto pt-0' : 'pt-2')}>
              {draftStorageError !== null ? (
                <p role="alert" className="pb-2 text-sm text-destructive">
                  This browser could not save the answer draft. Nothing was sent; try again.
                </p>
              ) : null}
              <AeQueryPanel
                onSubmit={handleSubmit}
                busy={streamingBusy}
                {...(streamingBusy && activeTurnStop !== null ? { onStop: () => void activeTurnStop() } : {})}
                searchContext={searchContext}
                showExamples={showWelcome}
                defaultValue={refinementComposerOpen ? (latestProjectedTurn?.query ?? '') : showWelcome ? initialRouteQuery : ''}
                focusOnMount={refinementComposerOpen}
                initialTiming={composerTiming}
                showTiming={showComposerTiming}
                {...(composerTimingDate === undefined ? {} : { initialTimingDate: composerTimingDate })}
                {...(showWelcome || followUpComposerCopy === null ? {} : { placeholder: followUpComposerCopy.placeholder })}
                {...(showWelcome || followUpComposerCopy === null ? {} : { loopHint: followUpComposerCopy.loopHint })}
              />
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

function resolveInitialDraft(query: string, routeThreadId: string | null): InitialDraftResolution {
  if (typeof window === 'undefined') {
    return routeThreadId !== null || !answerTurnQueryWithinLimit(query)
      ? { kind: 'missing' }
      : {
          kind: 'ready',
          draft: {
            version: 1,
            query,
            clientTurnKey: createClientTurnKey(),
            searchContext: DEFAULT_AE_SEARCH_CONTEXT,
          },
        }
  }
  const stored = readPendingAnswerTurnDraft()
  if (routeThreadId !== null) {
    if (stored.kind === 'storage_error') {
      return stored
    }
    if (stored.kind !== 'ok') {
      return { kind: 'missing' }
    }
    if (stored.draft.threadId === routeThreadId) {
      return { kind: 'ready', draft: stored.draft }
    }
    const cleared = clearPendingAnswerTurnDraft()
    return cleared.kind === 'stored'
      ? { kind: 'missing' }
      : { kind: 'storage_error', error: cleared.error }
  }
  if (query.length === 0) {
    return stored.kind === 'ok'
      ? { kind: 'ready', draft: stored.draft }
      : stored.kind === 'storage_error'
        ? stored
        : { kind: 'missing' }
  }
  if (!answerTurnQueryWithinLimit(query)) {
    return { kind: 'missing' }
  }
  if (stored.kind === 'ok' && stored.draft.query === query) {
    return { kind: 'ready', draft: stored.draft }
  }

  const draft: PendingAnswerTurnDraft = {
    version: 1,
    query,
    clientTurnKey: createClientTurnKey(),
    searchContext: DEFAULT_AE_SEARCH_CONTEXT,
  }
  const saved = writePendingAnswerTurnDraft(draft)
  return saved.kind === 'stored'
    ? { kind: 'ready', draft }
    : { kind: 'storage_error', error: saved.error }
}

function readPendingAnswerTurnDraft(): DraftReadResult {
  const storage = browserSessionStorage()
  if (storage === undefined) {
    return {
      kind: 'storage_error',
      error: { kind: 'storage_error', operation: 'read', code: 'unavailable' },
    }
  }
  let raw: string | null
  try {
    raw = storage.getItem(PENDING_ANSWER_TURN_DRAFT_STORAGE_KEY)
  } catch {
    return {
      kind: 'storage_error',
      error: { kind: 'storage_error', operation: 'read', code: 'unavailable' },
    }
  }
  if (raw === null) {
    return { kind: 'missing' }
  }
  if (raw.length > PENDING_ANSWER_TURN_DRAFT_MAX_BYTES) {
    forgetPendingAnswerTurnDraft(storage)
    return { kind: 'invalid' }
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    forgetPendingAnswerTurnDraft(storage)
    return { kind: 'invalid' }
  }
  const parsed = pendingAnswerTurnDraftSchema.safeParse(value)
  if (!parsed.success) {
    forgetPendingAnswerTurnDraft(storage)
    return { kind: 'invalid' }
  }
  return { kind: 'ok', draft: parsed.data }
}

function writePendingAnswerTurnDraft(draft: PendingAnswerTurnDraft): DraftWriteResult {
  const storage = browserSessionStorage()
  if (storage === undefined) {
    return {
      kind: 'storage_error',
      error: { kind: 'storage_error', operation: 'write', code: 'unavailable' },
    }
  }
  const record = { ...draft, savedAt: Date.now() }
  const serialized = JSON.stringify(record)
  if (serialized.length > PENDING_ANSWER_TURN_DRAFT_MAX_BYTES) {
    return {
      kind: 'storage_error',
      error: { kind: 'storage_error', operation: 'write', code: 'too_large' },
    }
  }
  try {
    storage.setItem(PENDING_ANSWER_TURN_DRAFT_STORAGE_KEY, serialized)
    return { kind: 'stored' }
  } catch {
    return {
      kind: 'storage_error',
      error: { kind: 'storage_error', operation: 'write', code: 'unavailable' },
    }
  }
}

function clearPendingAnswerTurnDraft(expectedClientTurnKey?: string): DraftWriteResult {
  const storage = browserSessionStorage()
  if (storage === undefined) {
    return {
      kind: 'storage_error',
      error: { kind: 'storage_error', operation: 'clear', code: 'unavailable' },
    }
  }
  if (expectedClientTurnKey !== undefined) {
    const stored = readPendingAnswerTurnDraft()
    if (stored.kind === 'storage_error') {
      return { kind: 'storage_error', error: stored.error }
    }
    if (stored.kind === 'ok' && stored.draft.clientTurnKey !== expectedClientTurnKey) {
      return { kind: 'stored' }
    }
  }
  try {
    storage.removeItem(PENDING_ANSWER_TURN_DRAFT_STORAGE_KEY)
    return { kind: 'stored' }
  } catch {
    return {
      kind: 'storage_error',
      error: { kind: 'storage_error', operation: 'clear', code: 'unavailable' },
    }
  }
}

function forgetPendingAnswerTurnDraft(storage: Storage): void {
  try {
    storage.removeItem(PENDING_ANSWER_TURN_DRAFT_STORAGE_KEY)
  } catch {
    // Refusing malformed state is still safe when browser storage cannot clear it.
  }
}

function answerTurnQueryWithinLimit(query: string): boolean {
  if (query.length === 0) return false
  if (query.length <= QUERY_MAX_LENGTH) return true
  return query.trimStart().startsWith('{"operationRef"')
    && new TextEncoder().encode(query).byteLength <= ANSWER_OPERATION_INPUT_MAX_BYTES
}

function draftMatchesTurn(
  draft: PendingAnswerTurnDraft,
  query: string,
  searchContext: AeSearchContext,
  threadId: string | undefined,
): boolean {
  return draft.query === query
    && (draft.threadId ?? undefined) === threadId
    && stableAeSearchContextKey(draft.searchContext ?? DEFAULT_AE_SEARCH_CONTEXT) === stableAeSearchContextKey(searchContext)
}


function browserSessionStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}


