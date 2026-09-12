import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { useEffect, useRef, useState } from 'react'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { offboardingBlocker, offboardingError } from './provider-workspace-projection'
import { DeferredSection, UnavailableSummary } from './ProviderWorkspaceSharedUi'
import {
  cancelOwnerProviderOffboardingServer,
  resumeOwnerProviderOffboardingServer,
  startOwnerProviderOffboardingServer,
  type OwnerProviderOffboardingResult,
} from './provider-workspace.functions'

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
  const startOffboardingRequest = useServerFn(startOwnerProviderOffboardingServer)
  const startOffboarding = useReverification(startOffboardingRequest)
  const resumeOffboardingRequest = useServerFn(resumeOwnerProviderOffboardingServer)
  const resumeOffboarding = useReverification(resumeOffboardingRequest)
  const cancelOffboardingRequest = useServerFn(cancelOwnerProviderOffboardingServer)
  const cancelOffboarding = useReverification(cancelOffboardingRequest)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [result, setResult] = useState(initial)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const startKey = useRef(`provider-offboarding:${globalThis.crypto.randomUUID()}`)

  useEffect(() => setResult(initial), [initial])

  const start = async () => {
    setPending(true)
    setError(undefined)
    try {
      const next = await startOffboarding({ data: { idempotencyKey: startKey.current } })
      setResult(next)
      if (next.kind === 'available') {
        setConfirmOpen(false)
        refreshWorkspace()
      } else if (next.kind === 'refused') {
        setError(offboardingError(next.reason))
      } else {
        setError('Provider offboarding could not be confirmed. Reload status before trying again.')
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Provider offboarding could not be confirmed. Reload status before trying again.')
    } finally {
      setPending(false)
    }
  }

  const resume = async () => {
    if (result.kind !== 'available') return
    setPending(true)
    setError(undefined)
    try {
      const next = await resumeOffboarding({ data: {
        caseRef: result.status.caseRef,
        expectedRevision: result.status.revision,
        idempotencyKey: `provider-offboarding-resume:${globalThis.crypto.randomUUID()}`,
      } })
      setResult(next)
      if (next.kind === 'available') refreshWorkspace()
      else setError(next.kind === 'refused' ? offboardingError(next.reason) : 'Provider offboarding status is unavailable. Reload before trying again.')
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Provider offboarding status is unavailable. Reload before trying again.')
    } finally {
      setPending(false)
    }
  }

  const cancel = async () => {
    if (result.kind !== 'available') return
    setPending(true)
    setError(undefined)
    try {
      const next = await cancelOffboarding({ data: {
        caseRef: result.status.caseRef,
        expectedRevision: result.status.revision,
        idempotencyKey: `provider-offboarding-cancel:${globalThis.crypto.randomUUID()}`,
      } })
      setResult(next)
      if (next.kind === 'available') refreshWorkspace()
      else setError(next.kind === 'refused' ? offboardingError(next.reason) : 'Provider offboarding status is unavailable. Reload before trying again.')
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Provider offboarding status is unavailable. Reload before trying again.')
    } finally {
      setPending(false)
    }
  }

  if (result.kind === 'unavailable') return <UnavailableSummary title="Provider offboarding unavailable" />
  if (result.kind === 'refused') {
    return <Alert variant="destructive"><AlertTitle>Provider cannot be retired</AlertTitle><AlertDescription>{offboardingError(result.reason)}</AlertDescription></Alert>
  }
  if (result.kind === 'not_found') {
    return (
      <div className="grid gap-related rounded-lg border border-border p-related">
        <div><h3 className="font-semibold">Retire this Provider</h3><p className="text-sm text-muted-foreground">AE freezes new work first, then waits for Calls, obligations and payouts before revoking connections.</p></div>
        {error === undefined ? null : <Alert variant="destructive" role="alert"><AlertTitle>Provider was not retired</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <Button ref={triggerRef} type="button" variant="destructive" className="justify-self-start min-h-touch" onClick={() => setConfirmOpen(true)}>Start Provider offboarding</Button>
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
      </div>
    )
  }

  const { status } = result
  const canResume = status.state === 'Action required'
  const canCancel = status.state === 'Freezing' && !status.routeabilityFrozen
  const isTerminal = status.state === 'Retired' || status.state === 'Cancelled'
  return (
    <div className="grid gap-related rounded-lg border border-border p-related" aria-live="polite">
      <div><h3 className="font-semibold">{status.state}</h3><p className="text-sm text-muted-foreground">{status.routeabilityFrozen ? 'New work is frozen.' : 'AE is preparing to freeze new work.'} Case {status.caseRef}</p></div>
      {status.blockerCodes.length === 0 ? null : (
        <Alert><AlertTitle>Action required</AlertTitle><AlertDescription>{status.blockerCodes.map(offboardingBlocker).join(' ')}</AlertDescription></Alert>
      )}
      {status.state === 'Retired' ? <p className="text-sm text-muted-foreground">Tools are retired, Calls and obligations are clear, and Provider connections are revoked.</p> : null}
      {status.state === 'Cancelled' ? <p className="text-sm text-muted-foreground">Offboarding was cancelled before new work was frozen. The Provider remains active.</p> : null}
      {isTerminal ? null : (
        <div className="flex flex-wrap gap-intra">
          <Button type="button" variant="secondary" className="min-h-touch" disabled={pending} onClick={canResume ? () => void resume() : refreshWorkspace}>{pending ? 'Checking…' : canResume ? 'Resume offboarding' : 'Refresh status'}</Button>
          {canCancel ? <Button type="button" variant="outline" className="min-h-touch" disabled={pending} onClick={() => void cancel()}>Cancel offboarding</Button> : null}
        </div>
      )}
      {error === undefined ? null : <Alert variant="destructive" role="alert"><AlertTitle>Status was not updated</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    </div>
  )
}
