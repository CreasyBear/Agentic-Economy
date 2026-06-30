import { useEffect, useId, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

import type {
  AnswerEvent,
  AnswerSource,
} from '@/modules/answer/public'
import { AeProviderSourceCard } from './AeProviderSourceCard'
import { AeAgentJsonAffordance } from './AeAgentJsonAffordance'

type Phase = 'idle' | 'streaming' | 'reconnecting' | 'complete' | 'stopped' | 'error'

export type AeAnswerStreamProps = {
  query: string | null
}

export function AeAnswerStream({ query }: AeAnswerStreamProps) {
  const regionId = useId()
  const [phase, setPhase] = useState<Phase>('idle')
  const [oneLine, setOneLine] = useState('')
  const [sources, setSources] = useState<readonly AnswerSource[]>([])
  const [summary, setSummary] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [agentJsonUrl, setAgentJsonUrl] = useState('')
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const completeRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (query === null || query.trim().length === 0) {
      return
    }

    setPhase('streaming')
    setOneLine('')
    setSources([])
    setSummary('')
    setNextStep('')
    setAgentJsonUrl('')
    setErrorCode(null)
    completeRef.current = false

    const controller = new AbortController()
    abortRef.current = controller
    const url = `/api/answer?q=${encodeURIComponent(query)}&stream=1`

    void streamAnswer(
      url,
      controller.signal,
      applyEvent,
      () => completeRef.current,
      () => {
        if (mountedRef.current) {
          setPhase('reconnecting')
        }
      },
    ).then((result) => {
      if (!mountedRef.current) return
      if (result === 'aborted') {
        setPhase((current) => (current === 'streaming' || current === 'reconnecting' ? 'stopped' : current))
      } else if (result === 'error') {
        setPhase('error')
        setErrorCode('network')
      }
    })

    return () => {
      controller.abort()
    }
  }, [query])

  function applyEvent(event: AnswerEvent) {
    if (!mountedRef.current) return
    setPhase((current) => (current === 'reconnecting' ? 'streaming' : current))
    switch (event.type) {
      case 'thinking':
        return
      case 'one-line':
        setOneLine(event.oneLine)
        return
      case 'sources':
        setSources(event.providers)
        return
      case 'summary-delta':
        setSummary((prev) => `${prev}${event.delta} `)
        return
      case 'next-step':
        setNextStep(event.nextStep)
        return
      case 'complete':
        setOneLine(event.answer.oneLine)
        setSources(event.answer.providers)
        setSummary(event.answer.summary)
        setNextStep(event.answer.nextStep)
        setAgentJsonUrl(event.answer.agentJsonUrl)
        setPhase('complete')
        completeRef.current = true
        return
      case 'error':
        setErrorCode(event.copyId)
        setPhase('error')
        return
      default: {
        const _exhaustive: never = event
        void _exhaustive
        return
      }
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  if (query === null) {
    return null
  }

  const busy = phase === 'streaming' || phase === 'reconnecting'
  const empty = phase === 'complete' && sources.length === 0
  const showSources = sources.length > 0

  return (
    <section
      className="ae-answer"
      data-phase={phase}
      data-empty={empty ? 'true' : 'false'}
      aria-live="polite"
      aria-busy={busy}
      aria-labelledby={regionId}
    >
      <div className="ae-answer__head">
        {oneLine.length > 0 ? (
          <p id={regionId} className="ae-answer__one-line">{oneLine}</p>
        ) : busy ? (
          <p id={regionId} className="ae-answer__one-line ae-answer__one-line--thinking" aria-label="Finding listed providers">
            <span className="ae-answer__caret" aria-hidden="true" />
          </p>
        ) : (
          <p id={regionId} className="ae-answer__one-line ae-answer__one-line--placeholder">Finding listed providers</p>
        )}

        {phase === 'reconnecting' ? (
          <span className="ae-answer__reconnect" role="status">Reconnecting…</span>
        ) : null}

        {busy ? (
          <button type="button" className="ae-answer__stop" onClick={stop} aria-label="Stop generating the answer">
            Stop
          </button>
        ) : null}
      </div>

      {phase === 'error' ? (
        <div className="ae-answer__error" role="status" data-error-id={errorCode ?? undefined}>
          <p>The answer could not be built right now. Try the search again, or browse the registry.</p>
          <Link to="/registry" search={{ q: '', limit: 10 }} className="ae-answer__error-link">Browse the registry</Link>
        </div>
      ) : null}

      {showSources ? (
        <ul className="ae-answer__sources" aria-label="Cited local providers">
          {sources.map((source) => (
            <li key={source.slug}>
              <AeProviderSourceCard source={source} />
            </li>
          ))}
        </ul>
      ) : null}

      {empty ? (
        <div className="ae-answer__empty" role="status">
          <p>{summary || 'No listed businesses match that yet.'}</p>
          <Link to="/claim" className="ae-answer__empty-link">List your business</Link>
        </div>
      ) : (
        summary.length > 0 ? (
          <p className="ae-answer__summary">{summary.trim()}</p>
        ) : null
      )}

      {nextStep.length > 0 && !empty ? (
        <p className="ae-answer__next-step"><span className="ae-answer__next-step-label">Next</span> {nextStep}</p>
      ) : null}

      {agentJsonUrl.length > 0 ? (
        <AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={query} />
      ) : null}
    </section>
  )
}

type StreamFrame = { seq: number; event: AnswerEvent }

const MAX_RETRIES = 2
const RETRY_BASE_MS = 400

async function streamAnswer(
  baseUrl: string,
  signal: AbortSignal,
  onEvent: (event: AnswerEvent) => void,
  isComplete: () => boolean,
  onReconnecting: () => void,
): Promise<'done' | 'aborted' | 'error'> {
  let attempt = 0
  let lastSeq = -1

  for (;;) {
    const url = lastSeq >= 0 ? `${baseUrl}&after=${lastSeq}` : baseUrl
    try {
      const res = await fetch(url, { signal })
      if (!res.ok || res.body === null) {
        if (signal.aborted) return 'aborted'
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          attempt += 1
          onReconnecting()
          await sleep(retryDelayMs(attempt), signal)
          if (signal.aborted) return 'aborted'
          continue
        }
        return 'error'
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const line = frame.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice('data:'.length).trim()
          if (payload.length === 0) continue
          try {
            const wrapped = JSON.parse(payload) as StreamFrame
            lastSeq = wrapped.seq
            onEvent(wrapped.event)
          } catch {
            // Skip a malformed frame; the stream continues.
          }
        }
      }

      if (isComplete()) {
        return 'done'
      }
      if (signal.aborted) {
        return 'aborted'
      }
      // Stream ended without a complete event (truncated). Reconnect from the
      // last seen seq if retries remain, otherwise surface an error.
      if (attempt < MAX_RETRIES) {
        attempt += 1
        onReconnecting()
        await sleep(retryDelayMs(attempt), signal)
        if (signal.aborted) return 'aborted'
        continue
      }
      return 'error'
    } catch (cause) {
      if (signal.aborted) return 'aborted'
      if (cause instanceof DOMException && cause.name === 'AbortError') return 'aborted'
      if ((cause as { name?: string })?.name === 'AbortError') return 'aborted'
      if (attempt < MAX_RETRIES) {
        attempt += 1
        onReconnecting()
        await sleep(retryDelayMs(attempt), signal)
        if (signal.aborted) return 'aborted'
        continue
      }
      return 'error'
    }
  }
}

function retryDelayMs(attempt: number): number {
  return RETRY_BASE_MS * 2 ** (attempt - 1)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
