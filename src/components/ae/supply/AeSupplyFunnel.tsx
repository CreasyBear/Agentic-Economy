import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeOwnerOfferingEditor, type OwnerOfferingEditorValue, type OwnerOfferingSaveResult } from '@/components/ae/offerings/AeOwnerOfferings'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeOwnerOperationFacts } from './AeSupplyPublisherHome'
import type {
  OwnerSupplyCommandResult,
  OwnerSupplyOfferingReadback,
  SupplyFunnelActionContext,
  SupplyFunnelRefusal,
  SupplyFunnelStep,
  SupplyFunnelStepCompletion,
} from '@/modules/capability-supply/supply-funnel.functions'
import {
  AeSupplyEndpointConfigStep,
  type SupplyAuthorityOption,
  type SupplyEndpointConfigValue,
  type SupplyEndpointDocumentPreflight,
  type SupplyEndpointDocumentPreflightResult,
  type SupplyEndpointDraftSaveResult,
  type SupplyEndpointPreflightResult,
  type SupplyPublicationImport,
} from './AeSupplyEndpointConfigStep'

const steps: readonly SupplyFunnelStep[] = ['describe', 'admission', 'readiness', 'test']
const emptyAuthorityOptions: readonly SupplyAuthorityOption[] = []
const stepLabels: Readonly<Record<SupplyFunnelStep, string>> = {
  describe: 'Describe the Operation',
  admission: 'Connect the API',
  readiness: 'Check that it works',
  test: 'Run a test',
}
const stepStateLabels: Readonly<Record<OwnerSupplyOfferingReadback['stepStates'][SupplyFunnelStep], string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Done',
  refused: 'Needs attention',
  stale: 'Needs a fresh check',
}

type MaintenanceCallback = (context: SupplyFunnelActionContext) => Promise<OwnerSupplyCommandResult>
type Feedback = Readonly<{
  message: string
  variant: 'default' | 'destructive'
}>

export type SupplyFunnelCallbacks = Readonly<{
  saveOffering: (value: OwnerOfferingEditorValue) => Promise<OwnerOfferingSaveResult>
  saveSourceDraft?: (source: SupplyPublicationImport) => Promise<SupplyEndpointDraftSaveResult>
  preflightDocument?: (document: Record<string, unknown>) => Promise<SupplyEndpointDocumentPreflightResult>
  preflight: (source: SupplyPublicationImport) => Promise<SupplyEndpointPreflightResult>
  admit: (source: SupplyPublicationImport) => Promise<SupplyFunnelStepCompletion>
  runReadiness: (context: SupplyFunnelActionContext) => Promise<SupplyFunnelStepCompletion>
  runTest: (context: SupplyFunnelActionContext) => Promise<SupplyFunnelStepCompletion>
  recheck?: MaintenanceCallback
  withdraw?: MaintenanceCallback
  republish?: MaintenanceCallback
  onReload?: () => Promise<void>
}>

export function AeSupplyFunnel({
  businessId,
  offering,
  initialOffering,
  initialSource,
  initialDocumentPreflight,
  authorityOptions = emptyAuthorityOptions,
  callbacks,
}: Readonly<{
  businessId: string
  offering: OwnerSupplyOfferingReadback
  initialOffering: OwnerOfferingEditorValue
  initialSource?: SupplyEndpointConfigValue
  initialDocumentPreflight?: SupplyEndpointDocumentPreflight
  authorityOptions?: readonly SupplyAuthorityOption[]
  callbacks: SupplyFunnelCallbacks
}>) {
  const [feedback, setFeedback] = useState<Feedback>()
  const [confirmTest, setConfirmTest] = useState(false)
  const actionContext = contextForOffering(businessId, offering)
  const currentStep = offering.currentStep
  const isX402Test = offering.publication?.source.kind === 'x402'
  const incompatible = offering.publication?.state === 'incompatible'
    || offering.lifecycle.state === 'incompatible'

  useEffect(() => {
    if (window.location.hash !== '#incompatibility') return
    const target = document.getElementById('incompatibility')
    if (target === null) return
    target.scrollIntoView({ block: 'start' })
    target.focus({ preventScroll: true })
  }, [])

  async function reload() {
    setConfirmTest(false)
    await callbacks.onReload?.()
  }

  async function showCompletion(result: SupplyFunnelStepCompletion) {
    setFeedback({
      message: result.refusal === undefined
        ? result.message ?? (result.state === 'completed' ? `${stepLabels[result.step]} is saved.` : 'This step needs attention.')
        : refusalMessage(result.refusal),
      variant: result.refusal === undefined && result.state === 'completed' ? 'default' : 'destructive',
    })
    await reload()
  }

  async function showMaintenance(result: OwnerSupplyCommandResult) {
    setFeedback({
      message: result.kind === 'refused' ? refusalMessage(result.reason) : maintenanceMessage(result),
      variant: result.kind === 'refused' ? 'destructive' : 'default',
    })
    await reload()
  }

  return (
    <div className="grid gap-6">
      {feedback === undefined ? null : (
        <Alert variant={feedback.variant}>
          <AlertTitle>Setup update</AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}
      <SupplyTruthCard offering={offering} />
      <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-4" aria-label="Your four setup steps">
        {steps.map((step) => {
          const state = offering.stepStates[step]
          return (
            <li key={step} className="flex items-center gap-2 rounded-md border border-border p-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">{state === 'completed' ? '✓' : steps.indexOf(step) + 1}</span>
              <span className="grid gap-0.5">
                <span className="block font-semibold text-foreground">{stepLabels[step]}</span>
                <span className="block text-sm text-muted-foreground">{stepStateLabels[state]}</span>
              </span>
            </li>
          )
        })}
      </ol>
      {currentStep === 'describe' ? (
        <div id="description" className="scroll-mt-6">
          <AeOwnerOfferingEditor
            initialValue={initialOffering}
            onSave={async (value) => {
              const result = await callbacks.saveOffering(value)
              if (result.kind === 'saved') {
                setFeedback({ message: 'Operation details saved. Next, connect its API.', variant: 'default' })
                await reload()
              }
              return result
            }}
            draftKey={businessId}
          />
        </div>
      ) : null}
      {currentStep === 'admission' || incompatible ? (
        <div id="provider" className="scroll-mt-6">
          <AeSupplyEndpointConfigStep
            {...(initialSource === undefined ? {} : { initialValue: initialSource })}
            {...(initialDocumentPreflight === undefined ? {} : { initialDocumentPreflight })}
            {...(callbacks.preflightDocument === undefined ? {} : { onPreflightDocument: callbacks.preflightDocument })}
            {...(callbacks.saveSourceDraft === undefined ? {} : { onSaveDraft: callbacks.saveSourceDraft })}
            onPreflight={callbacks.preflight}
            authorityOptions={authorityOptions}
            onSubmit={async (value) => {
              await showCompletion(await callbacks.admit(value))
            }}
          />
        </div>
      ) : null}
      {currentStep === 'readiness' && !incompatible ? (
        <ActionStep
          title="3 · CHECK READINESS"
          heading="Check that the admitted operation works"
          detail="AE will record a bounded readiness observation for the exact admitted endpoint and contract."
          actionLabel="Check readiness"
          disabled={actionContext === undefined}
          onAction={async () => {
            if (actionContext === undefined) {
              setFeedback({ message: refusalMessage('publication_missing'), variant: 'destructive' })
              return
            }
            await showCompletion(await callbacks.runReadiness(actionContext))
          }}
        />
      ) : null}
      {currentStep === 'test' && !incompatible ? (
        <ActionStep
          title="4 · RUN A TEST"
          heading={isX402Test ? 'Check the payment challenge' : 'Run a real test'}
          detail={isX402Test
            ? 'AE checks the fresh x402 payment challenge for the exact admitted operation. No payment is sent. This is readiness only—not a paid fill, Qualified Use, earnings, settlement, or proof of live availability.'
            : 'AE uses the first valid input example from the admitted contract and sends it to the active operation. This test does not charge anyone.'}
          actionLabel={isX402Test
            ? 'Check payment challenge (no payment sent).'
            : confirmTest
              ? 'Send the test'
              : 'Review and confirm the test'}
          disabled={actionContext === undefined}
          onAction={async () => {
            if (!isX402Test && !confirmTest) {
              setConfirmTest(true)
              return
            }
            if (actionContext === undefined) {
              setFeedback({ message: refusalMessage('publication_missing'), variant: 'destructive' })
              return
            }
            await showCompletion(await callbacks.runTest(actionContext))
          }}
        />
      ) : null}
      {actionContext === undefined ? null : (
        <MaintenanceActions
          offering={offering}
          context={actionContext}
          {...(callbacks.recheck === undefined ? {} : { recheck: callbacks.recheck })}
          {...(callbacks.withdraw === undefined ? {} : { withdraw: callbacks.withdraw })}
          {...(callbacks.republish === undefined ? {} : { republish: callbacks.republish })}
          onResult={showMaintenance}
        />
      )}
    </div>
  )
}

function SupplyTruthCard({ offering }: Readonly<{ offering: OwnerSupplyOfferingReadback }>) {
  const publication = offering.publication
  const incompatible = publication?.state === 'incompatible'
    || offering.lifecycle.state === 'incompatible'
  return (
    <div
      id="incompatibility"
      tabIndex={-1}
      className="scroll-mt-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <AeSection title="Operation control" description="Canonical identifiers and states from the current owner readback. Credentials are never shown here.">
        {incompatible ? (
          <Alert>
            <AlertTitle>Readmission required</AlertTitle>
            <AlertDescription>
              This publication no longer matches the current Operation revision. Reconnect and re-admit the intended source below; the existing revision and source guards still apply.
            </AlertDescription>
          </Alert>
        ) : null}
        <AeFactList
          facts={[
            { label: 'Admission', value: offering.admission.state },
            { label: 'Publication', value: publication?.state ?? 'not published' },
            { label: 'Readiness', value: offering.readiness.outcome },
            { label: 'Live', value: offering.live.available ? 'available' : 'unavailable' },
          ]}
        />
        <AeOwnerOperationFacts offering={offering} detail />
      </AeSection>
    </div>
  )
}

function MaintenanceActions({
  offering,
  context,
  recheck,
  withdraw,
  republish,
  onResult,
}: Readonly<{
  offering: OwnerSupplyOfferingReadback
  context: SupplyFunnelActionContext
  recheck?: MaintenanceCallback
  withdraw?: MaintenanceCallback
  republish?: MaintenanceCallback
  onResult: (result: OwnerSupplyCommandResult) => Promise<void>
}>) {
  const publicationState = offering.publication?.state
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawPending, setWithdrawPending] = useState(false)
  const withdrawInFlight = useRef(false)
  async function confirmWithdrawal() {
    if (withdraw === undefined || withdrawInFlight.current) return
    withdrawInFlight.current = true
    setWithdrawPending(true)
    try {
      await onResult(await withdraw(context))
      setWithdrawOpen(false)
    } finally {
      withdrawInFlight.current = false
      setWithdrawPending(false)
    }
  }
  return (
    <AeSection id={publicationState === 'withdrawn' ? 'publication-maintenance' : 'readiness'} title="Publication maintenance" description="Each action rechecks the current Operation and publication revision before it changes anything.">
      <div className="flex flex-wrap gap-3">
        {publicationState === 'current' && recheck !== undefined ? <MaintenanceButton label="Recheck readiness" callback={recheck} context={context} onResult={onResult} /> : null}
        {publicationState === 'current' && withdraw !== undefined ? (
          <>
            <Button type="button" variant="secondary" disabled={withdrawPending} onClick={() => setWithdrawOpen(true)} className="min-h-touch">
              Withdraw publication
            </Button>
            <AeConfirmDialog
              open={withdrawOpen}
              onOpenChange={setWithdrawOpen}
              title="Withdraw this publication?"
              description="The operation will stop accepting new work. Existing evidence remains immutable, and you can republish from the current source later."
              confirmLabel="Confirm withdrawal"
              confirmVariant="destructive"
              pending={withdrawPending}
              onConfirm={confirmWithdrawal}
            />
          </>
        ) : null}
        {publicationState === 'withdrawn' && republish !== undefined ? <MaintenanceButton label="Republish" callback={republish} context={context} onResult={onResult} /> : null}
      </div>
    </AeSection>
  )
}

function MaintenanceButton({ label, callback, context, onResult, variant = 'default' }: Readonly<{ label: string; callback?: MaintenanceCallback; context: SupplyFunnelActionContext; onResult: (result: OwnerSupplyCommandResult) => Promise<void>; variant?: 'default' | 'secondary' }>) {
  const [pending, setPending] = useState(false)
  async function run() {
    if (callback === undefined) return
    setPending(true)
    try {
      await onResult(await callback(context))
    } finally {
      setPending(false)
    }
  }
  return <Button type="button" variant={variant} disabled={pending || callback === undefined} aria-busy={pending || undefined} onClick={() => void run()} className="min-h-touch">{pending ? 'Working' : label}</Button>
}

function ActionStep({ heading, detail, actionLabel, onAction, disabled = false }: Readonly<{ title: string; heading: string; detail: string; actionLabel: string; onAction: () => Promise<void>; disabled?: boolean }>) {
  const [pending, setPending] = useState(false)
  async function run() {
    setPending(true)
    try {
      await onAction()
    } finally {
      setPending(false)
    }
  }
  return (
    <AeSection title={heading} description={detail}>
      <Button type="button" variant="default" disabled={pending || disabled} aria-busy={pending || undefined} onClick={() => void run()} className="min-h-touch w-fit">
        {pending ? 'Working' : actionLabel}
      </Button>
    </AeSection>
  )
}

function contextForOffering(businessId: string, offering: OwnerSupplyOfferingReadback): SupplyFunnelActionContext | undefined {
  const publication = offering.publication
  if (offering.sourceHash === undefined || publication === undefined || (publication.state !== 'current' && publication.state !== 'withdrawn')) return undefined
  return {
    businessId,
    offeringRef: offering.offeringRef,
    offeringRevision: offering.revision,
    offeringSourceHash: offering.sourceHash,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.publicationRevision,
  }
}

function maintenanceMessage(result: Exclude<OwnerSupplyCommandResult, { kind: 'refused' }>): string {
  if (result.kind === 'withdrawn') return 'The current publication is withdrawn. Its evidence remains immutable history.'
  if (result.kind === 'republished') return `Publication revision ${result.revision} was created and readiness is unobserved until a fresh check succeeds.`
  return `Publication revision ${result.revision} was scheduled for a fresh readiness check.`
}

function refusalMessage(refusal: SupplyFunnelRefusal | string): string {
  const fixes: Readonly<Record<string, string>> = {
    publication_missing: 'Admit the source before running this action.',
    publication_not_found: 'Reload the owner readback and choose the current offering.',
    publication_stale: 'Reload the current publication before trying again.',
    revision_changed: 'This Operation changed elsewhere. Reload to continue.',
    catalog_offering_origin_changed: 'The catalog offering origin changed. Reload before trying again.',
    withdrawn: 'This publication is withdrawn. Republish it before running readiness or a test.',
    authority_stale: 'The provider authority changed. Recheck the current authority before trying again.',
    health_unobserved: 'Run a fresh readiness check for the current endpoint.',
    health_stale: 'The readiness observation expired. Run a fresh check.',
    health_unhealthy: 'The endpoint returned an unhealthy result. Correct it and run a fresh check.',
    source_invalid: 'Provide a complete canonical source with valid JSON and source-specific fields.',
    target_not_public: 'Use one public HTTPS endpoint without private or local addressing.',
    response_invalid: 'The endpoint response did not satisfy the admitted output contract.',
  }
  return `${refusal}: ${fixes[refusal] ?? 'Correct the named rule and reload the current owner readback.'}`
}
