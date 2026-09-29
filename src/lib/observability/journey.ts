/**
 * One terminal signal per core journey. Both runtimes log `[ae.journey]`.
 * Convex must not import Sentry or TanStack; the web server registers a
 * reporter from `sentry.server` when a DSN is configured.
 */

export type JourneyName = 'search' | 'quote' | 'call' | 'funding' | 'chat' | 'publish'

export type JourneyOutcomeEvent = Readonly<{
  journey: JourneyName
  outcome: string
  good: boolean
}>

type JourneyReporter = (event: JourneyOutcomeEvent) => void

let journeyReporter: JourneyReporter | undefined

/** Server-only. Pass `undefined` to detach. */
export function setJourneyReporter(reporter: JourneyReporter | undefined): void {
  journeyReporter = reporter
}

export function recordJourneyOutcome(event: JourneyOutcomeEvent): void {
  try {
    console.info('[ae.journey]', JSON.stringify({
      journey: event.journey,
      outcome: event.outcome,
      good: event.good,
    }))
    journeyReporter?.(event)
  } catch (cause) {
    // Telemetry must not change the journey result.
    void cause
  }
}

/** Search verdicts match, scoped, and noMatch are results. Anything else is an error. */
export function recordSearchResult(kind: string): void {
  const outcome = kind === 'match' || kind === 'scoped' || kind === 'noMatch' ? kind : 'error'
  recordJourneyOutcome({ journey: 'search', outcome, good: outcome !== 'error' })
}

const quoteFaultCodes = new Set(['inspection_unavailable', 'commercial_policy_unavailable'])

export function recordQuoteJourney(result: Readonly<{ kind: string; code?: string; retryable?: boolean }>): void {
  if (result.kind === 'committed') {
    recordJourneyOutcome({ journey: 'quote', outcome: 'issued', good: true })
    return
  }
  const fault = (result.code !== undefined && quoteFaultCodes.has(result.code))
    || (result.code === 'tool_not_ready' && result.retryable === true)
  recordJourneyOutcome({
    journey: 'quote',
    outcome: fault ? 'refused_by_fault' : 'refused',
    good: false,
  })
}

const callOutcome = {
  completed: { outcome: 'completed', good: true },
  refused: { outcome: 'refused', good: false },
  reconciliation_required: { outcome: 'outcome_unknown', good: false },
  cancelled: { outcome: 'cancelled', good: false },
} as const

/** First leave from `pending` only. A later repair of the same Call is not a second attempt. */
export function recordCallTerminal(previousState: string, nextState: string): void {
  if (previousState !== 'pending') return
  const mapped = callOutcome[nextState as keyof typeof callOutcome]
  if (mapped === undefined) return
  recordJourneyOutcome({ journey: 'call', outcome: mapped.outcome, good: mapped.good })
}

export function recordFundingTerminal(
  previousState: string,
  nextState: 'succeeded' | 'failed' | 'outcome_unknown',
): void {
  if (previousState !== 'pending') return
  if (nextState === 'succeeded') {
    recordJourneyOutcome({ journey: 'funding', outcome: 'completed', good: true })
    return
  }
  if (nextState === 'failed') {
    recordJourneyOutcome({ journey: 'funding', outcome: 'failed', good: false })
    return
  }
  recordJourneyOutcome({ journey: 'funding', outcome: 'stuck', good: false })
}

/** A clarification is a finished answer. A second terminal write for the same turn is not a new answer. */
export function recordChatAnswer(previousState: string, nextState: string): void {
  if (previousState === 'completed' || previousState === 'input-required' || previousState === 'failed') return
  if (nextState === 'completed') {
    recordJourneyOutcome({ journey: 'chat', outcome: 'completed', good: true })
    return
  }
  if (nextState === 'input-required') {
    recordJourneyOutcome({ journey: 'chat', outcome: 'input_required', good: true })
    return
  }
  if (nextState === 'failed') recordJourneyOutcome({ journey: 'chat', outcome: 'failed', good: false })
}

export function recordAnonymousChat(outcome: 'completed' | 'input_required' | 'failed'): void {
  recordJourneyOutcome({ journey: 'chat', outcome, good: outcome !== 'failed' })
}

/** Replay is the original publish, not a second outcome. */
export function recordPublishResult(result: Readonly<{ kind: string }>): void {
  if (result.kind === 'published') {
    recordJourneyOutcome({ journey: 'publish', outcome: 'completed', good: true })
    return
  }
  if (result.kind === 'refused') {
    recordJourneyOutcome({ journey: 'publish', outcome: 'refused', good: false })
  }
}
