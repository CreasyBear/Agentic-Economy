import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef, useState } from 'react'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  cancelOwnerCallServer,
  readOwnerCallStatusServer,
  reconcileOwnerCallServer,
} from '@/modules/capability-execution/call-recovery.functions'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

import {
  cancelFeedback,
  reconcileFeedback,
  refreshFeedback,
  statusFromRecovery,
} from '@/lib/call-recovery/call-recovery-feedback'
import type {
  CallReconciliationForm,
  CallStatusPageActions,
  CallStatusPageResult,
} from '@/lib/call-recovery/call-status-page-types'
import {
  clearCallRecoveryStorage,
  persistCallRecoveryStorage,
  readStoredCancellationKey,
  readStoredReconciliationAttempt,
  reconciliationAttemptMatches,
  reconciliationCommandIdentity,
  type PendingReconciliationAttempt,
} from '@/lib/call-recovery/client-storage'
import { canRefreshCallStatus } from '@/lib/call-recovery/call-status-refresh'

export function useCallStatusRecovery(loadedResult: CallStatusPageResult): Readonly<{
  result: CallStatusPageResult
  actions: CallStatusPageActions
}> {
  const [localStatus, setLocalStatus] = useState<Readonly<{
    source: CallStatusPageResult
    current: CallStatusPageResult
  }>>({ source: loadedResult, current: loadedResult })
  const result = localStatus.source === loadedResult ? localStatus.current : loadedResult
  const [refreshPending, setRefreshPending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  const [reconcilePending, setReconcilePending] = useState(false)
  const [feedback, setFeedback] = useState<CallStatusPageActions['feedback']>()
  const readStatus = useServerFn(readOwnerCallStatusServer)
  const cancel = useServerFn(cancelOwnerCallServer)
  const reconcile = useServerFn(reconcileOwnerCallServer)
  const router = useRouter()
  const cancelIdempotencyKeyRef = useRef<string | undefined>(undefined)
  const [reconciliationAttempt, setReconciliationAttempt] = useState<PendingReconciliationAttempt | undefined>(() => (
    loadedResult.kind === 'found' ? readStoredReconciliationAttempt(loadedResult) : undefined
  ))
  const setResult = (current: CallStatusPageResult) => {
    setLocalStatus({ source: loadedResult, current })
  }

  async function refreshCurrentStatus() {
    if (refreshPending || cancelPending || reconcilePending || !canRefreshCallStatus(result)) return
    setRefreshPending(true)
    setFeedback(undefined)
    try {
      const refreshed = await readStatus({ data: { callRef: result.callRef } })
      setReconciliationAttempt(refreshed.kind === 'found' ? readStoredReconciliationAttempt(refreshed) : undefined)
      setResult(refreshed)
      setFeedback(refreshFeedback(refreshed))
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setFeedback({ kind: 'error', message: 'The current status source is unavailable. The displayed state has not changed.' })
    } finally {
      setRefreshPending(false)
    }
  }

  async function cancelCurrentCall() {
    if (refreshPending || cancelPending || reconcilePending || result.kind !== 'found' || !(result.state === 'authorized' || result.state === 'retryable' || result.state === 'leased')) return
    setCancelPending(true)
    setFeedback(undefined)
    cancelIdempotencyKeyRef.current ??= readStoredCancellationKey(result.callRef) ?? crypto.randomUUID()
    persistCallRecoveryStorage('cancel', result.callRef, {
      version: 1,
      callRef: result.callRef,
      idempotencyKey: cancelIdempotencyKeyRef.current,
    })
    try {
      const recovery = await cancel({
        data: {
          callRef: result.callRef,
          idempotencyKey: cancelIdempotencyKeyRef.current,
        },
      })
      cancelIdempotencyKeyRef.current = undefined
      clearCallRecoveryStorage('cancel', result.callRef)
      setResult(statusFromRecovery(recovery))
      setFeedback(cancelFeedback(recovery))
      try {
        await router.invalidate()
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        setFeedback({ kind: 'error', message: 'The cancellation result was received, but current status could not be reloaded. The displayed result is retained.' })
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setFeedback({ kind: 'error', message: 'The cancellation source is unavailable. No new Call state is claimed.' })
    } finally {
      setCancelPending(false)
    }
  }

  async function reconcileCurrentCall(input: CallReconciliationForm) {
    if (
      refreshPending
      || cancelPending
      || reconcilePending
      || result.kind !== 'found'
      || result.state !== 'reconciliation_required'
      || result.ownerContext?.reconciliation.canSubmitEvidence !== true
      || result.attemptRef === undefined
      || result.effectGeneration === undefined
    ) return
    const source = input.source.trim()
    const evidenceRef = input.evidenceRef.trim()
    if (source.length === 0 || evidenceRef.length === 0) {
      setFeedback({ kind: 'error', message: 'Enter the evidence source and evidence reference before reconciling.' })
      return
    }
    setReconcilePending(true)
    setFeedback(undefined)
    try {
      const draft = { resolution: input.resolution, source, evidenceRef }
      const attemptIdentity = reconciliationCommandIdentity(result, draft)
      if (attemptIdentity === undefined) return
      const attempt: PendingReconciliationAttempt = reconciliationAttempt !== undefined
        && reconciliationAttemptMatches(result, reconciliationAttempt)
        && reconciliationAttempt.identity === attemptIdentity
        ? reconciliationAttempt
        : {
          version: 1,
          callRef: result.callRef,
          toolRef: result.toolRef,
          attemptRef: result.attemptRef,
          effectGeneration: result.effectGeneration,
          identity: attemptIdentity,
          idempotencyKey: crypto.randomUUID(),
          observedAt: new Date().toISOString(),
          draft,
        }
      setReconciliationAttempt(attempt)
      persistCallRecoveryStorage('reconcile', result.callRef, attempt)
      const material = {
        kind: 'action_invocation_reconciliation' as const,
        version: 1 as const,
        evidenceRef,
        source,
        invocationRef: result.callRef,
        attemptRef: result.attemptRef,
        effectGeneration: result.effectGeneration,
        operationRef: result.toolRef,
        resolution: input.resolution,
        observedAt: attempt.observedAt,
      }
      const recovery = await reconcile({
        data: {
          callRef: result.callRef,
          idempotencyKey: attempt.idempotencyKey,
          evidence: { ...material, digest: canonicalDigest(material) },
        },
      })
      setReconciliationAttempt(undefined)
      clearCallRecoveryStorage('reconcile', result.callRef)
      setResult(statusFromRecovery(recovery))
      setFeedback(reconcileFeedback(recovery))
      try {
        await router.invalidate()
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        setFeedback({ kind: 'error', message: 'The reconciliation result was received, but current status could not be reloaded. The displayed result is retained.' })
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setFeedback({ kind: 'error', message: 'The reconciliation source is unavailable. No new Call state is claimed.' })
    } finally {
      setReconcilePending(false)
    }
  }

  const retainedReconciliation = result.kind === 'found'
    && reconciliationAttempt !== undefined
    && reconciliationAttemptMatches(result, reconciliationAttempt)
    ? reconciliationAttempt
    : undefined

  return {
    result,
    actions: {
      onRefresh: refreshCurrentStatus,
      refreshPending,
      onCancel: cancelCurrentCall,
      cancelPending,
      onReconcile: (input) => { void reconcileCurrentCall(input) },
      reconcilePending,
      ...(retainedReconciliation === undefined ? {} : { reconciliationDraft: retainedReconciliation.draft }),
      ...(feedback === undefined ? {} : { feedback }),
    },
  }
}
