import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PanelLeftIcon } from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePublicShell, defaultHomeSearch } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { captureClientProductEventOnClient } from '@/lib/observability/capture-client-events'
import {
  DEFAULT_AE_SEARCH_CONTEXT,
  aeSearchContextLocationLabel,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import type { AnswerThreadRecord, PublicThreadProjection } from '@/modules/answer-thread/public'
import { AeAnswerModelProvider } from './AeAnswerModelContext'
import { AeChatWelcome } from './AeChatWelcome'
import { AeQueryPanel } from './AeQueryPanel'
import { AeThreadHeader } from './AeThreadHeader'
import { AeThreadScroller } from './AeThreadScroller'
import { AeThreadSidebar } from './AeThreadSidebar'
import { AeThreadTranscript } from './AeThreadTranscript'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'

export type AeChatProps = {
  threadId?: string | null
  initialQuery?: string | null
  initialProjection?: PublicThreadProjection | null
}

type LiveTurn = {
  query: string
  generation: number
  searchContext: AeSearchContext
}

export function AeChat({ threadId = null, initialQuery = null, initialProjection }: AeChatProps) {
  const navigate = useNavigate()
  const [projection, setProjection] = useState<PublicThreadProjection | null>(initialProjection ?? null)
  const [projectionUnavailable, setProjectionUnavailable] = useState(false)
  const [threads, setThreads] = useState<readonly AnswerThreadRecord[]>([])
  const [liveTurn, setLiveTurn] = useState<LiveTurn | null>(null)
  const [generation, setGeneration] = useState(0)
  const [streamingBusy, setStreamingBusy] = useState(false)
  const [sessionThreadId, setSessionThreadId] = useState<string | null>(null)
  const [searchContext] = useState<AeSearchContext>(DEFAULT_AE_SEARCH_CONTEXT)
  const [sidebarManuallyOpen, setSidebarManuallyOpen] = useState(false)
  const initialQueryStarted = useRef(false)
  const pendingThreadIdRef = useRef<string | null>(null)

  const routeThreadId = threadId
  const streamingThreadId = routeThreadId ?? sessionThreadId
  const showWelcome = routeThreadId === null && liveTurn === null && (projection?.turns.length ?? 0) === 0
  const showThreadUnavailable = routeThreadId !== null && projection === null && liveTurn === null && projectionUnavailable
  const completedTurns = projection?.turns.filter((turn) => turn.status === 'complete') ?? []
  const completedTurnCount = completedTurns.length

  const wasShowingWelcomeRef = useRef(showWelcome)
  const [leavingWelcome, setLeavingWelcome] = useState(showWelcome)

  const refreshThreads = useCallback(async () => {
    try {
      const response = await fetch('/api/answer/threads')
      if (!response.ok) {
        return
      }
      const body = (await response.json()) as { threads: readonly AnswerThreadRecord[] }
      setThreads(body.threads)
    } catch {
      // Sidebar is optional when persistence is unavailable.
    }
  }, [])

  const refreshProjection = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/answer/threads/${encodeURIComponent(id)}`)
      if (!response.ok) {
        setProjection(null)
        setProjectionUnavailable(true)
        return
      }
      const body = (await response.json()) as PublicThreadProjection
      setProjection(body)
      setProjectionUnavailable(false)
    } catch {
      setProjectionUnavailable(true)
    }
  }, [])

  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  useEffect(() => {
    if (routeThreadId === null) {
      setProjection(null)
      setProjectionUnavailable(false)
      return
    }
    if (initialProjection?.threadId === routeThreadId) {
      setProjection(initialProjection)
      setProjectionUnavailable(false)
      return
    }
    if (initialProjection === null) {
      setProjection(null)
      setProjectionUnavailable(true)
      return
    }
    void refreshProjection(routeThreadId)
  }, [routeThreadId, initialProjection, refreshProjection])

  useEffect(() => {
    if (initialQueryStarted.current) {
      return
    }
    const trimmed = initialQuery?.trim()
    if (trimmed === undefined || trimmed.length === 0) {
      return
    }
    initialQueryStarted.current = true
    setStreamingBusy(true)
    setGeneration((current) => {
      const next = current + 1
      setLiveTurn({ query: trimmed, generation: next, searchContext })
      return next
    })
  }, [initialQuery, searchContext])

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

  function startTurn(query: string, context: AeSearchContext = searchContext) {
    setStreamingBusy(true)
    setGeneration((current) => {
      const next = current + 1
      setLiveTurn({ query, generation: next, searchContext: context })
      return next
    })
  }

  function handleSubmit(query: string) {
    captureClientProductEventOnClient('query_submitted', {
      query_length: query.length,
      search_mode: searchContext.mode,
      search_location: aeSearchContextLocationLabel(searchContext) ?? 'none',
    })
    startTurn(query, searchContext)
  }

  function handleThreadCreated(id: string) {
    pendingThreadIdRef.current = id
    setSessionThreadId(id)
  }

  function handleStreamEnd(outcome: 'complete' | 'error' | 'stopped' | 'rate_limited') {
    setStreamingBusy(false)
    if (outcome === 'complete') {
      handleTurnComplete()
    }
  }

  function handleTurnComplete() {
    captureClientProductEventOnClient('answer_completed', { query_length: liveTurn?.query.length ?? 0 })
    void refreshThreads()

    const pendingId = pendingThreadIdRef.current
    if (routeThreadId === null && pendingId !== null) {
      pendingThreadIdRef.current = null
      void Promise.resolve(navigate({ to: '/t/$threadId', params: { threadId: pendingId }, replace: true })).finally(() => {
        setLiveTurn(null)
      })
      return
    }

    setLiveTurn(null)

    if (routeThreadId !== null) {
      void refreshProjection(routeThreadId)
    }
  }

  function handleFollowUp(query: string) {
    handleSubmit(query)
  }

  function handleRetry(query: string) {
    startTurn(query)
  }

  function handleDeleteThread(deletedThreadId: string) {
    setThreads((current) => current.filter((thread) => thread.threadId !== deletedThreadId))
    if (routeThreadId === deletedThreadId) {
      void navigate({ to: '/', search: defaultHomeSearch, replace: true })
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

  const shell = (
    <div className={`ae-chat-layout${sidebarVisible ? ' ae-chat-layout--with-sidebar' : ''}`}>
      <AeThreadSidebar threads={threads} activeThreadId={routeThreadId} visible={sidebarVisible} onDelete={handleDeleteThread} />
      <div className="ae-chat-shell">
        {showSidebarToggle ? (
          <div className="ae-chat-toolbar">
            <Button
              variant="ghost"
              size="icon-sm"
              className="ae-chat-sidebar-toggle"
              onClick={() => setSidebarManuallyOpen((value) => !value)}
              aria-controls="ae-thread-sidebar"
              aria-expanded={sidebarVisible}
              aria-label={sidebarVisible ? 'Hide recent questions' : 'Show recent questions'}
            >
              <PanelLeftIcon data-icon="only" />
            </Button>
          </div>
        ) : null}
        {showThreadChrome && projection !== null ? (
          <AeThreadHeader title={projection.title} threadId={projection.threadId} />
        ) : null}
        <div className="ae-chat-stage">
          <AeThreadScroller
            key={scrollerKey}
            autoScroll={liveTurn !== null}
            defaultScrollPosition={defaultScrollPosition}
            settleMessageId={settleMessageId}
            streaming={streamingBusy}
            showJumpButton={liveTurn !== null}
          >
            {showThreadUnavailable ? (
              <div className="ae-chat-empty">
                <AeEmptyState
                  title="Thread unavailable"
                  description="This answer thread could not be found or loaded. Start a fresh search to keep going."
                  action={
                    <Button asChild variant="publicSecondary" size="sm">
                      <a href="/">Start a new search</a>
                    </Button>
                  }
                />
              </div>
            ) : null}
            <AeThreadTranscript
              threadId={routeThreadId}
              projection={projection}
              liveTurn={liveTurn}
              onThreadCreated={handleThreadCreated}
              onStreamEnd={handleStreamEnd}
              onFollowUp={handleFollowUp}
              onRetry={handleRetry}
            />
          </AeThreadScroller>
          {!showWelcome ? (
            <div className="ae-chat-panel-wrap">
              <AeQueryPanel
                onSubmit={handleSubmit}
                busy={streamingBusy}
                searchContext={searchContext}
                showExamples={false}
              />
            </div>
          ) : null}
          {landingMode ? (
            <div
              className={`ae-chat-landing ${!showWelcome ? 'ae-chat-landing--exit' : ''}`}
              aria-hidden={!showWelcome}
            >
              <div className="ae-chat-landing__inner">
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
    <AePublicShell immersive hideFooter>
      {isStructuredAnswerModeEnabled() ? <AeAnswerModelProvider>{shell}</AeAnswerModelProvider> : shell}
    </AePublicShell>
  )
}
