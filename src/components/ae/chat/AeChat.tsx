import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { captureClientProductEventOnClient } from '@/lib/observability/capture-client-events'
import type { AnswerThreadRecord, PublicThreadProjection } from '@/modules/answer-thread/public'
import { AeAnswerModelProvider } from './AeAnswerModelContext'
import { AeChatWelcome } from './AeChatWelcome'
import { AeQueryPanel } from './AeQueryPanel'
import { AeThreadFooter } from './AeThreadFooter'
import { AeThreadHeader } from './AeThreadHeader'
import { AeThreadScroller } from './AeThreadScroller'
import { AeThreadSidebar } from './AeThreadSidebar'
import { AeThreadTranscript } from './AeThreadTranscript'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'
import { AeThreadStreamingIndicator } from './AeStreamingLabel'

export type AeChatProps = {
  threadId?: string | null
  initialQuery?: string | null
  initialProjection?: PublicThreadProjection | null
}

type LiveTurn = {
  query: string
  generation: number
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
  const initialQueryStarted = useRef(false)
  const pendingThreadIdRef = useRef<string | null>(null)

  const routeThreadId = threadId
  const streamingThreadId = routeThreadId ?? sessionThreadId
  const showWelcome = routeThreadId === null && liveTurn === null && (projection?.turns.length ?? 0) === 0
  const showThreadUnavailable = routeThreadId !== null && projection === null && liveTurn === null && projectionUnavailable
  const completedTurnCount = projection?.turns.filter((turn) => turn.status === 'complete').length ?? 0

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
      setLiveTurn({ query: trimmed, generation: next })
      return next
    })
  }, [initialQuery])

  function startTurn(query: string) {
    setStreamingBusy(true)
    setGeneration((current) => {
      const next = current + 1
      setLiveTurn({ query, generation: next })
      return next
    })
  }

  function handleSubmit(query: string) {
    captureClientProductEventOnClient('query_submitted', { query_length: query.length })
    startTurn(query)
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
    setLiveTurn(null)
    void refreshThreads()

    const pendingId = pendingThreadIdRef.current
    if (routeThreadId === null && pendingId !== null) {
      pendingThreadIdRef.current = null
      void navigate({ to: '/t/$threadId', params: { threadId: pendingId }, replace: true })
      return
    }

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

  const sidebarVisible = threads.length > 0
  const showThreadChrome = routeThreadId !== null && completedTurnCount > 0
  const completedTurnQueries =
    projection?.turns.filter((turn) => turn.status === 'complete').map((turn) => ({ query: turn.query })) ?? []

  // Keep scroller mounted while a turn streams - sessionThreadId updates mid-stream must not remount.
  const scrollerKey = routeThreadId ?? (liveTurn !== null ? 'live' : sessionThreadId) ?? 'home'
  const defaultScrollPosition =
    completedTurnCount > 0 && liveTurn === null ? ('last-anchor' as const) : ('end' as const)

  const shell = (
    <div className={`ae-chat-layout${sidebarVisible ? ' ae-chat-layout--with-sidebar' : ''}`}>
      <AeThreadSidebar threads={threads} activeThreadId={routeThreadId} visible={sidebarVisible} />
      <div className="ae-chat-shell">
        {showThreadChrome && projection !== null ? (
          <AeThreadHeader title={projection.title} threadId={projection.threadId} />
        ) : null}
        <AeThreadScroller
          key={scrollerKey}
          autoScroll={liveTurn !== null}
          defaultScrollPosition={defaultScrollPosition}
        >
          {showWelcome ? <AeChatWelcome /> : null}
          {showThreadUnavailable ? (
            <div className="ae-chat-empty">
              <AeEmptyState
                title="Thread unavailable"
                description="This answer thread could not be found or loaded. Start a fresh search to keep going."
                action={<a href="/">Start a new search</a>}
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
          {showThreadChrome && projection !== null && liveTurn === null ? (
            <AeThreadFooter threadId={projection.threadId} turns={completedTurnQueries} />
          ) : null}
          <AeThreadStreamingIndicator streaming={streamingBusy} />
        </AeThreadScroller>
        <div className="ae-chat-panel-wrap">
          <AeQueryPanel onSubmit={handleSubmit} busy={streamingBusy} />
        </div>
      </div>
    </div>
  )

  return (
    <AePublicShell>
      {isStructuredAnswerModeEnabled() ? <AeAnswerModelProvider>{shell}</AeAnswerModelProvider> : shell}
    </AePublicShell>
  )
}
