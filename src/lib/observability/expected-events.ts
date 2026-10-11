import type { ErrorEvent, EventHint } from '@sentry/core'

type Crumb = { category: string; level: 'info'; message: string }

/** Expected outcomes: refusals, auth walls, 4xx, stale clients, degraded fallbacks. They are
 * breadcrumbs on the next real error and counters, never issues (alert on symptoms, not causes). */
const EXPECTED_MESSAGE = /thread_busy|turn_fenced|ArgumentValidationError|Could not find public function|Object is missing the required field|InvalidCursor|AbortError: .*(?:transition|skipped)|View transition|^unauthenticated$/iu

function read(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

function isClientStatus(status: unknown): boolean {
  return typeof status === 'number' && status >= 400 && status < 500
}

export function classifyExpectedEvent(event: ErrorEvent, hint?: EventHint): 'drop_to_breadcrumb' | undefined {
  const original = hint?.originalException
  const first = event.exception?.values?.[0]
  const text = [
    original instanceof Error ? `${original.name}: ${original.message}` : typeof original === 'string' ? original : undefined,
    first === undefined ? undefined : `${first.type ?? ''}: ${first.value ?? ''}`,
    event.message,
  ].filter((part): part is string => part !== undefined)
  if (text.some((part) => EXPECTED_MESSAGE.test(part) || /^(?:Error: )?unauthenticated$/u.test(part))) return 'drop_to_breadcrumb'
  if (read(event.tags, 'degraded') !== undefined) return 'drop_to_breadcrumb'
  if (read(event.tags, 'refusal') !== undefined) return 'drop_to_breadcrumb'
  if (isClientStatus(read(original, 'status')) || isClientStatus(read(event.extra, 'status'))) return 'drop_to_breadcrumb'
  return undefined
}

/** One shared beforeSend step: drop expected events to a breadcrumb, group the rest by cause. */
export function routeExpectedEvent(
  event: ErrorEvent,
  hint: EventHint | undefined,
  addBreadcrumb: (crumb: Crumb) => void,
): ErrorEvent | null {
  const cause = read(event.tags, 'degraded') ?? read(hint?.originalException, 'code') ?? read(event.tags, 'code')
  if (classifyExpectedEvent(event, hint) === 'drop_to_breadcrumb') {
    const first = event.exception?.values?.[0]
    addBreadcrumb({ category: 'expected', level: 'info', message: event.message ?? first?.value ?? first?.type ?? 'expected event' })
    return null
  }
  if (typeof cause === 'string' && cause.length > 0) event.fingerprint = ['{{ default }}', cause]
  return event
}
