/** Zero-dependency circuit breaker (Release It! Circuit Breaker / Fail Fast): closed -> open after N consecutive failures -> one half-open probe after the cool-down. State is per name and per runtime isolate. */
export class CircuitOpenError extends Error {
  constructor(readonly breaker: string) {
    super(`circuit open: ${breaker}`)
    this.name = 'CircuitOpenError'
  }
}

type BreakerState = { failures: number; openedAt: number | undefined; probing: boolean }
export type CircuitBreakerOptions = Readonly<{
  threshold?: number
  openMs?: number
  now?: () => number
  /** Which thrown causes count as dependency failures; others pass through uncounted. Defaults to all. */
  isFailure?: (cause: unknown) => boolean
}>

export function createCircuitBreaker(options: CircuitBreakerOptions = {}) {
  const { threshold = 5, openMs = 30_000, now = Date.now, isFailure = () => true } = options
  const states = new Map<string, BreakerState>()
  return {
    /** Runs `fn`, or throws CircuitOpenError immediately while the breaker is open (or a probe is in flight). */
    async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const state = states.get(name) ?? { failures: 0, openedAt: undefined, probing: false }
      states.set(name, state)
      if (state.openedAt !== undefined) {
        if (state.probing || now() - state.openedAt < openMs) throw new CircuitOpenError(name)
        state.probing = true
      }
      try {
        const value = await fn()
        state.failures = 0
        state.openedAt = undefined
        state.probing = false
        return value
      } catch (cause) {
        if (isFailure(cause)) {
          state.failures += 1
          if (state.probing || state.failures >= threshold) state.openedAt = now()
        }
        state.probing = false
        throw cause
      }
    },
  }
}

/** Shared breaker for outbound HTTP dependencies that already degrade to a fallback. */
export const dependencyBreaker = createCircuitBreaker()
