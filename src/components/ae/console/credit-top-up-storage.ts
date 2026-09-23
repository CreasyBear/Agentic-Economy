import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { degrade } from '@/lib/observability/degrade'
import type { RecoveryLocator } from './credit-top-up-format'

export const recoveryStorageKey = 'ae.account-funding.recovery.v1'

export function isRecoveryLocator(value: unknown): value is RecoveryLocator {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  const hasIdempotencyKey = typeof candidate.idempotencyKey === 'string' && candidate.idempotencyKey.length > 0
  const hasExternalRef = typeof candidate.externalRef === 'string' && candidate.externalRef.length > 0
  const hasCommandRef = typeof candidate.commandRef === 'string' && candidate.commandRef.length > 0
  return (hasExternalRef && !hasCommandRef)
    || (hasCommandRef && !hasExternalRef && hasIdempotencyKey)
}

export function persistRecovery(locator: RecoveryLocator): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(recoveryStorageKey, JSON.stringify(locator))
  } catch (cause) {
    // Browser storage is optional; the in-memory locator still protects this render.
    captureRouteException(cause, { site: 'persistRecovery' }, 'warning')
  }
}

export function readStoredRecovery(): RecoveryLocator | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.sessionStorage.getItem(recoveryStorageKey)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!isRecoveryLocator(parsed)) return undefined
    return parsed
  } catch (cause) {
    return degrade(cause, undefined, { site: 'readStoredRecovery', reason: 'invalid_response' })
  }
}

export function readReturnedExternalRef(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const params = new URLSearchParams(window.location.search)
  const value = params.get('funding') ?? params.get('checkout_session_id') ?? params.get('session_id')
  return value === null || value.trim().length === 0 ? undefined : value
}

export function defaultCheckoutRedirect(url: string): void {
  window.location.assign(url)
}

export function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
