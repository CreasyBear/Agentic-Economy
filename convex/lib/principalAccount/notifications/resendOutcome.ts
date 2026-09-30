export type ResendOutcome =
  | Readonly<{ outcome: 'sent' }>
  | Readonly<{ outcome: 'retry'; code: string; retryDelayMs: number }>
  | Readonly<{ outcome: 'failed'; code: string }>

const MAX_ATTEMPTS = 8
const MAX_RETRY_DELAY_MS = 60 * 60_000

export function classifyResendOutcome(
  status: 'network_error',
  attemptCount: number,
): Exclude<ResendOutcome, { outcome: 'sent' }>
export function classifyResendOutcome(
  status: number | 'network_error',
  attemptCount: number,
): ResendOutcome
export function classifyResendOutcome(
  status: number | 'network_error',
  attemptCount: number,
): ResendOutcome {
  if (typeof status === 'number' && status >= 200 && status < 300) return { outcome: 'sent' }
  const retryCode = status === 'network_error'
    ? 'network_error'
    : status === 429
      ? 'provider_rate_limited'
      : status === 409
        ? 'provider_conflict'
        : status >= 500 && status < 600
          ? 'provider_unavailable'
          : undefined
  if (retryCode === undefined) return { outcome: 'failed', code: `provider_rejected_${status}` }
  if (attemptCount >= MAX_ATTEMPTS) return { outcome: 'failed', code: 'retries_exhausted' }
  const retryDelayMs = Math.min(60_000 * 2 ** Math.max(0, attemptCount - 1), MAX_RETRY_DELAY_MS)
  return { outcome: 'retry', code: retryCode, retryDelayMs }
}
