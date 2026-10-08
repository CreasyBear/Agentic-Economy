import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import { SUPPORT_EMAIL } from '@/components/ae/support/help/help.contracts'
import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { DecisionPanel } from '@/components/ae/shared/arc-pro/chat/DecisionPanel'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { offboardingBlocker, offboardingError } from './provider-workspace-projection'
import { DeferredSection, UnavailableSummary } from './ProviderWorkspaceSharedUi'
import {
  cancelOwnerProviderOffboardingServer,
  readOwnerProviderOffboardingServer,
  resumeOwnerProviderOffboardingServer,
  startOwnerProviderOffboardingServer,
  type OwnerProviderOffboardingResult,
} from './provider-workspace.functions'
import './ProviderWorkspaceComposition.css'

export function ProviderWorkspaceOffboardingSection({ offboarding, refreshWorkspace }: Readonly<{
  offboarding?: Promise<OwnerProviderOffboardingResult>
  refreshWorkspace: () => void
}>) {
  return (
    <AeSection id="offboarding" title="Provider offboarding" description="Stop new work, settle outstanding obligations, and retire this Provider safely.">
      <DeferredSection promise={offboarding} loadingLabel="Loading Provider offboarding" unavailableTitle="Provider offboarding unavailable">
        {(result) => <ProviderOffboardingCard initial={result} refreshWorkspace={refreshWorkspace} />}
      </DeferredSection>
    </AeSection>
  )
}

function ProviderOffboardingCard({ initial, refreshWorkspace }: Readonly<{
  initial: OwnerProviderOffboardingResult
  refreshWorkspace: () => void
}>) {
  const readStatus = useServerFn(readOwnerProviderOffboardingServer)
  const startOffboardingRequest = useServerFn(startOwnerProviderOffboardingServer)
  const startOffboarding = useReverification(startOffboardingRequest)
  const resumeOffboardingRequest = useServerFn(resumeOwnerProviderOffboardingServer)
  const resumeOffboarding = useReverification(resumeOffboardingRequest)
  const cancelOffboardingRequest = useServerFn(cancelOwnerProviderOffboardingServer)
  const cancelOffboarding = useReverification(cancelOffboardingRequest)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState(initial)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const operationInFlight = useRef(false)
  const authorityGeneration = useRef(0)
  const observationRequired = useRef(false)
  const [needsObservation, setNeedsObservation] = useState(false)
  const [replayReady, setReplayReady] = useState(false)
  type OriginalRequest = Readonly<{ kind: 'start'; data: Readonly<{ idempotencyKey: string }> }>
    | Readonly<{ kind: 'resume' | 'cancel'; data: Readonly<{ caseRef: string; expectedRevision: number; idempotencyKey: string }>; businessRef: string; providerRef: string }>
  const originalRequest = useRef<OriginalRequest | undefined>(undefined)
  const [requestToReview, setRequestToReview] = useState<OriginalRequest | undefined>(undefined)
  function replaceOriginalRequest(request: OriginalRequest | undefined) {
    originalRequest.current = request
    setRequestToReview(request)
  }
  const knownCaseRef = useRef(initial.kind === 'available' ? initial.status.caseRef : undefined)
  const startKey = useRef(`provider-offboarding:${globalThis.crypto.randomUUID()}`)

  function requireObservation(message: string) {
    observationRequired.current = true
    setNeedsObservation(true)
    setReplayReady(false)
    setConfirmOpen(false)
    setReplayOpen(false)
    setError(message)
  }

  function acceptObservation(next: OwnerProviderOffboardingResult, explicit = false) {
    // A rerender or a delayed loader value cannot resolve a lost command response.
    if (observationRequired.current && !explicit) {
      if (next.kind === 'refused') { authorityGeneration.current += 1; setResult(next); replaceOriginalRequest(undefined) }
      return
    }
    if (next.kind === 'unavailable') {
      requireObservation('Current offboarding status could not be read. The last confirmed case remains visible; read status again before another command.')
      return
    }
    if (next.kind === 'refused') {
      authorityGeneration.current += 1
      setResult(next)
      replaceOriginalRequest(undefined)
      requireObservation(offboardingError(next.reason))
      return
    }
    const original = originalRequest.current
    if (observationRequired.current && originalRequest.current !== undefined && knownCaseRef.current !== undefined
      && (next.kind !== 'available' || next.status.caseRef !== knownCaseRef.current
        || (original !== undefined && original.kind !== 'start'
          && (next.status.businessRef !== original.businessRef || next.status.providerRef !== original.providerRef)))) {
      setResult(next.kind === 'available' ? { kind: 'refused', reason: 'case_changed' } : next)
      requireObservation('The previous offboarding case could not be confirmed for this Provider. Read current status or contact private support before another command.')
      return
    }
    if (original !== undefined && original.kind !== 'start' && next.kind === 'available'
      && next.status.revision < original.data.expectedRevision) {
      requireObservation('This read is older than the submitted case revision. Read current status again before another command.')
      return
    }
    if (original !== undefined && (next.kind === 'not_found'
      || (original.kind !== 'start' && next.kind === 'available'
        && next.status.revision === original.data.expectedRevision
        && next.status.state !== 'Retired' && next.status.state !== 'Cancelled'))) {
      if (next.kind === 'available') setResult(next)
      requireObservation('The original request is still unconfirmed. You can review and retry that exact request, or contact private support. A new command remains blocked.')
      setReplayReady(true)
      return
    }
    setResult(next)
    if (next.kind === 'available') knownCaseRef.current = next.status.caseRef
    replaceOriginalRequest(undefined)
    observationRequired.current = false
    setNeedsObservation(false)
    setReplayReady(false)
    setError(undefined)
  }

  useEffect(() => { acceptObservation(initial) }, [initial])

  async function observeStatus() {
    if (operationInFlight.current) return
    operationInFlight.current = true
    setPending(true)
    const generation = authorityGeneration.current
    try {
      const next = await readStatus()
      if (generation === authorityGeneration.current) acceptObservation(next, true)
    }
    catch (cause) {
      captureClientExceptionOnClient(cause)
      if (generation === authorityGeneration.current) requireObservation('Current offboarding status could not be read. Read status again before another command.')
    } finally { operationInFlight.current = false; setPending(false) }
  }

  async function executeOriginal(request: OriginalRequest) {
    if (operationInFlight.current) return
    operationInFlight.current = true
    setPending(true)
    setReplayReady(false)
    setError(undefined)
    const generation = authorityGeneration.current
    try {
      const next = request.kind === 'start' ? await startOffboarding({ data: request.data })
        : request.kind === 'resume' ? await resumeOffboarding({ data: request.data })
          : await cancelOffboarding({ data: request.data })
      if (generation !== authorityGeneration.current) return
      if (next.kind === 'available') {
        setResult(next)
        knownCaseRef.current = next.status.caseRef
        replaceOriginalRequest(undefined)
        observationRequired.current = false
        setNeedsObservation(false)
        setConfirmOpen(false)
        setReplayOpen(false)
        refreshWorkspace()
      } else {
        if (next.kind !== 'unavailable') {
          if (next.kind === 'refused') authorityGeneration.current += 1
          setResult(next); replaceOriginalRequest(undefined)
        }
        requireObservation(next.kind === 'refused' ? offboardingError(next.reason)
          : 'The command outcome could not be confirmed. Read current offboarding status before another command.')
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      if (generation === authorityGeneration.current) requireObservation('The command outcome could not be confirmed. Read current offboarding status before another command.')
    } finally { operationInFlight.current = false; setPending(false) }
  }

  const start = async () => {
    if (operationInFlight.current || observationRequired.current) return
    const request = Object.freeze({ kind: 'start' as const, data: Object.freeze({ idempotencyKey: startKey.current }) })
    replaceOriginalRequest(request)
    await executeOriginal(request)
  }

  const resume = async () => {
    if (result.kind !== 'available' || operationInFlight.current || observationRequired.current) return
    const request = Object.freeze({ kind: 'resume' as const, businessRef: result.status.businessRef, providerRef: result.status.providerRef,
      data: Object.freeze({ caseRef: result.status.caseRef, expectedRevision: result.status.revision,
        idempotencyKey: `provider-offboarding-resume:${globalThis.crypto.randomUUID()}` }) })
    replaceOriginalRequest(request)
    await executeOriginal(request)
  }

  const cancel = async () => {
    if (result.kind !== 'available' || operationInFlight.current || observationRequired.current) return
    const request = Object.freeze({ kind: 'cancel' as const, businessRef: result.status.businessRef, providerRef: result.status.providerRef,
      data: Object.freeze({ caseRef: result.status.caseRef, expectedRevision: result.status.revision,
        idempotencyKey: `provider-offboarding-cancel:${globalThis.crypto.randomUUID()}` }) })
    replaceOriginalRequest(request)
    await executeOriginal(request)
  }

  function wrap(content: ReactNode) {
    const original = requestToReview
    return <AeNavigationSafetyBoundary blockSearchChanges
      state={{ dirty: needsObservation || pending, pending, saveOutcome: needsObservation ? 'outcome_unknown' : pending ? 'idle' : 'saved' }}
      title="Leave with an unconfirmed offboarding request?" pendingTitle="Offboarding request is running"
      description="The request is unconfirmed. Read current status before issuing another offboarding command. Leaving does not retry it."
      pendingDescription="Wait for the current request before leaving."
      saveActionRef={triggerRef} headingRef={cardRef}>
      <div ref={cardRef} tabIndex={-1}>{content}
        {replayReady && original !== undefined ? <Button ref={triggerRef} type="button" variant="secondary" size="md" disabled={pending} onClick={() => setReplayOpen(true)}>Review original offboarding request</Button> : null}
        <AeConfirmDialog open={replayOpen} onOpenChange={setReplayOpen} pending={pending}
          title="Retry the original offboarding request?"
          description={original?.kind === 'start'
            ? 'Retry the original request to freeze new work and begin Provider retirement. Existing Calls, obligations and payouts still need to settle. This uses the original request reference.'
            : original?.kind === 'cancel'
              ? `Retry the original cancellation for case ${original.data.caseRef}, revision ${original.data.expectedRevision}. It can cancel only before new work is frozen. This uses the original request reference.`
              : original?.kind === 'resume'
                ? `Retry the original continuation for case ${original.data.caseRef}, revision ${original.data.expectedRevision}. New work remains frozen and settlement and connection cleanup gates still apply. This uses the original request reference.`
                : 'Read current status before retrying.'}
          confirmLabel="Retry original request" confirmVariant="destructive" returnFocusRef={triggerRef}
          onConfirm={() => { if (replayReady && original !== undefined && originalRequest.current === original && observationRequired.current) void executeOriginal(original) }} />
      </div>
    </AeNavigationSafetyBoundary>
  }

  if (result.kind === 'unavailable') return wrap(<UnavailableSummary title="Provider offboarding unavailable" retryLabel="Read current offboarding status" onRetry={() => void observeStatus()} />)
  if (result.kind === 'refused') {
    return wrap(<AeAlert tone="danger" title="Provider offboarding needs review">{offboardingError(result.reason)}
      <Button type="button" variant="secondary" size="md" disabled={pending} onClick={() => void observeStatus()}>Read current offboarding status</Button>
    </AeAlert>)
  }
  if (result.kind === 'not_found') {
    return wrap(
      <DecisionPanel className="arc-provider-offboarding" aria-label="Provider offboarding">
        <div className="arc-provider-offboarding-heading"><h3>Retire this Provider</h3><p>AE freezes new work first, then waits for Calls, obligations and payouts before revoking connections.</p></div>
        {error === undefined ? null : <AeAlert tone="danger" title="Offboarding outcome is unconfirmed" role="alert">{error}</AeAlert>}
        <Button ref={triggerRef} type="button" variant="danger" size="md" className="arc-provider-offboarding-action" disabled={pending || needsObservation} onClick={() => setConfirmOpen(true)}>Start Provider offboarding</Button>
        {needsObservation ? <Button type="button" variant="secondary" size="md" disabled={pending} onClick={() => void observeStatus()}>Read current offboarding status</Button> : null}
        <AeConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Start Provider offboarding?"
          description="New work will stop first. Outstanding Calls, obligations and payouts must resolve before AE revokes Provider connections and marks the Provider retired. After the freeze, this process can be resumed but not rolled back."
          confirmLabel="Freeze new work and continue"
          confirmVariant="destructive"
          pending={pending}
          onConfirm={start}
          returnFocusRef={triggerRef}
        />
      </DecisionPanel>
    )
  }

  const { status } = result
  const canResume = status.state === 'Action required'
  const canCancel = status.state === 'Freezing' && !status.routeabilityFrozen
  const isTerminal = status.state === 'Retired' || status.state === 'Cancelled'
  return wrap(
    <DecisionPanel className="arc-provider-offboarding" aria-label="Provider offboarding" aria-live="polite">
      <div className="arc-provider-offboarding-heading"><h3>{status.state}</h3><p>{status.routeabilityFrozen ? 'New work is frozen.' : 'AE is preparing to freeze new work.'} Case {status.caseRef}</p></div>
      {status.blockerCodes.length === 0 ? null : (
        <AeAlert role="alert" tone="info" title="Action required"><ul className="grid gap-related">{status.blockerCodes.map(code => (
            <li key={code}>
              <p>{offboardingBlocker(code)}</p>
              {code === 'obligations_remain' || code === 'payout_resolution_required' ? (
                <a className={actionLinkClassName('secondary', 'sm')} href="/owner/operations#earnings">Review recorded obligations</a>
              ) : code === 'connections_remain' || code === 'provider_cleanup_pending' ? (
                <a className={actionLinkClassName('secondary', 'sm')} href="/owner/settings/integrations#provider-connections">Review connection cleanup</a>
              ) : code === 'routeable_tools_remain' ? (
                <a className={actionLinkClassName('secondary', 'sm')} href="/owner/operations">Review Tool availability</a>
              ) : null}
              <p className="text-sm text-muted-foreground">{code === 'calls_remain' ? 'AE must confirm existing Calls are finished or reconciled. Do not create replacement Calls.' : code === 'retention_policy_unbound' ? 'An operator must confirm the retained-record policy.' : 'Review the recorded status. Contact private support if this gate remains blocked.'}</p>
            </li>
          ))}</ul></AeAlert>
      )}
      {status.state === 'Retired' ? <p className="text-sm text-muted-foreground">Tools are retired, Calls and obligations are clear, and Provider connections are revoked.</p> : null}
      {status.state === 'Cancelled' ? <p className="text-sm text-muted-foreground">Offboarding was cancelled before new work was frozen. The Provider remains active.</p> : null}
      {status.blockerCodes.length === 0 && !needsObservation ? null : (
        <div className="grid gap-intra">
          <AeCopyReference label="Offboarding case reference" value={status.caseRef} />
          <a className={actionLinkClassName('secondary', 'md')} href={`${SUPPORT_EMAIL}?subject=${encodeURIComponent('Provider offboarding help')}&body=${encodeURIComponent(`Offboarding case reference: ${status.caseRef}\nBlockers: ${status.blockerCodes.join(', ')}\n\nWhat happened:\n`)}`}>Contact private support (opens email app)</a>
          <p className="text-xs text-muted-foreground">Include the case reference. Do not include credentials, private inputs or results.</p>
        </div>
      )}
      {isTerminal ? null : (
        <div className="arc-provider-offboarding-actions">
          <Button type="button" variant="secondary" size="md" disabled={pending} onClick={needsObservation || !canResume ? () => void observeStatus() : () => void resume()}>{pending ? 'Checking…' : needsObservation ? 'Read current offboarding status' : canResume ? 'Resume offboarding' : 'Refresh status'}</Button>
          {canCancel && !needsObservation ? <Button type="button" variant="secondary" size="md" disabled={pending} onClick={() => void cancel()}>Cancel offboarding</Button> : null}
        </div>
      )}
      {error === undefined ? null : <AeAlert tone="danger" title="Offboarding outcome is unconfirmed" role="alert">{error}</AeAlert>}
    </DecisionPanel>
  )
}
