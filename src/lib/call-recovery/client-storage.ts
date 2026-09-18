import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

import type { CallReconciliationForm, FoundCallStatus } from './call-status-page-types'

const pendingCancellationSchema = z.strictObject({
  version: z.literal(1),
  callRef: z.string().min(1).max(300),
  idempotencyKey: z.string().min(1).max(200),
})
const pendingReconciliationAttemptSchema = z.strictObject({
  version: z.literal(1),
  callRef: z.string().min(1).max(300),
  toolRef: z.string().min(1).max(300),
  attemptRef: z.string().min(1).max(300),
  effectGeneration: z.number().int().nonnegative(),
  identity: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  idempotencyKey: z.string().min(1).max(200),
  observedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  draft: z.strictObject({
    resolution: z.enum(['not_released', 'released']),
    source: z.string().trim().min(1).max(300),
    evidenceRef: z.string().trim().min(1).max(300),
  }),
})
export type PendingReconciliationAttempt = z.infer<typeof pendingReconciliationAttemptSchema>

const CALL_RECOVERY_STORAGE_PREFIX = 'ae.call-recovery:v1'

function callRecoveryStorageKey(kind: 'cancel' | 'reconcile', callRef: string): string {
  return `${CALL_RECOVERY_STORAGE_PREFIX}:${kind}:${canonicalDigest(callRef)}`
}

function readCallRecoveryStorage(key: string): unknown {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.sessionStorage.getItem(key)
    if (raw === null || raw.length > 4_096) return undefined
    return JSON.parse(raw) as unknown
  } catch (cause) {
    captureRouteException(cause, { site: 'readCallRecoveryStorage' }, 'warning')
    return undefined
  }
}

export function persistCallRecoveryStorage(kind: 'cancel' | 'reconcile', callRef: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(callRecoveryStorageKey(kind, callRef), JSON.stringify(value))
  } catch (cause) {
    captureRouteException(cause, { site: 'persistCallRecoveryStorage' }, 'warning')
  }
}

export function clearCallRecoveryStorage(kind: 'cancel' | 'reconcile', callRef: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(callRecoveryStorageKey(kind, callRef))
  } catch (cause) {
    captureRouteException(cause, { site: 'clearCallRecoveryStorage' }, 'warning')
  }
}

export function readStoredCancellationKey(callRef: string): string | undefined {
  const parsed = pendingCancellationSchema.safeParse(readCallRecoveryStorage(callRecoveryStorageKey('cancel', callRef)))
  return parsed.success && parsed.data.callRef === callRef ? parsed.data.idempotencyKey : undefined
}

export function reconciliationBindingIdentity(result: FoundCallStatus): string | undefined {
  if (result.state !== 'reconciliation_required' || result.attemptRef === undefined || result.effectGeneration === undefined) return undefined
  return canonicalDigest({
    invocationRef: result.callRef,
    operationRef: result.toolRef,
    attemptRef: result.attemptRef,
    effectGeneration: result.effectGeneration,
  })
}

export function reconciliationCommandIdentity(result: FoundCallStatus, draft: CallReconciliationForm): string | undefined {
  const binding = reconciliationBindingIdentity(result)
  if (binding === undefined) return undefined
  return canonicalDigest({
    binding,
    resolution: draft.resolution,
    source: draft.source,
    evidenceRef: draft.evidenceRef,
  })
}

export function reconciliationAttemptMatches(result: FoundCallStatus, attempt: PendingReconciliationAttempt): boolean {
  return attempt.callRef === result.callRef
    && attempt.toolRef === result.toolRef
    && attempt.attemptRef === result.attemptRef
    && attempt.effectGeneration === result.effectGeneration
    && attempt.identity === reconciliationCommandIdentity(result, attempt.draft)
}

export function readStoredReconciliationAttempt(result: FoundCallStatus): PendingReconciliationAttempt | undefined {
  if (result.state !== 'reconciliation_required' || result.attemptRef === undefined || result.effectGeneration === undefined) return undefined
  const parsed = pendingReconciliationAttemptSchema.safeParse(
    readCallRecoveryStorage(callRecoveryStorageKey('reconcile', result.callRef)),
  )
  if (!parsed.success) return undefined
  return reconciliationAttemptMatches(result, parsed.data) ? parsed.data : undefined
}
