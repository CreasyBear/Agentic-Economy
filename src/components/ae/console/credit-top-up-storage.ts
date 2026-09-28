import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { degrade } from '@/lib/observability/degrade'
import type { RecoveryLocator } from './credit-top-up-format'

const recoveryStoragePrefix = 'ae.account-funding.recovery.'
const draftStoragePrefix = 'ae.account-funding.draft.'
const attemptStoragePrefix = 'ae.account-funding.attempt.'

export function readStoredFundingAttempt(userId: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const key = window.sessionStorage.getItem(`${attemptStoragePrefix}${userId}`)
    return key?.startsWith('account-funding:') ? key : undefined
  } catch (cause) {
    return degrade(cause, undefined, { site: 'readStoredFundingAttempt', reason: 'invalid_response' })
  }
}

export function persistFundingAttempt(userId: string, idempotencyKey?: string): void {
  if (typeof window === 'undefined') return
  try {
    const key = `${attemptStoragePrefix}${userId}`
    if (idempotencyKey === undefined) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, idempotencyKey)
  } catch (cause) {
    captureRouteException(cause, { site: 'persistFundingAttempt' }, 'warning')
  }
}

export function readStoredFundingDraft(userId: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.sessionStorage.getItem(`${draftStoragePrefix}${userId}`) ?? undefined
  } catch (cause) {
    return degrade(cause, undefined, { site: 'readStoredFundingDraft', reason: 'invalid_response' })
  }
}

export function persistFundingDraft(userId: string, amountText: string): void {
  if (typeof window === 'undefined') return
  try {
    const key = `${draftStoragePrefix}${userId}`
    if (amountText.length === 0) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, amountText)
  } catch (cause) {
    captureRouteException(cause, { site: 'persistFundingDraft' }, 'warning')
  }
}

export function isRecoveryLocator(value: unknown): value is RecoveryLocator {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  const hasIdempotencyKey = typeof candidate.idempotencyKey === 'string' && candidate.idempotencyKey.length > 0
  const hasExternalRef = typeof candidate.externalRef === 'string' && candidate.externalRef.length > 0
  const hasCommandRef = typeof candidate.commandRef === 'string' && candidate.commandRef.length > 0
  return (hasExternalRef && !hasCommandRef)
    || (hasCommandRef && !hasExternalRef && hasIdempotencyKey)
}

export function persistRecovery(userId: string, locator: RecoveryLocator): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(`${recoveryStoragePrefix}${userId}`, JSON.stringify(locator))
  } catch (cause) {
    // Browser storage is optional; the in-memory locator still protects this render.
    captureRouteException(cause, { site: 'persistRecovery' }, 'warning')
  }
}

export function readStoredRecovery(userId: string): RecoveryLocator | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.sessionStorage.getItem(`${recoveryStoragePrefix}${userId}`)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!isRecoveryLocator(parsed)) return undefined
    return parsed
  } catch (cause) {
    return degrade(cause, undefined, { site: 'readStoredRecovery', reason: 'invalid_response' })
  }
}
export function clearStoredRecovery(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(`${recoveryStoragePrefix}${userId}`)
  } catch (cause) {
    captureRouteException(cause, { site: 'clearStoredRecovery' }, 'warning')
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
