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
  OwnerSellerCanaryPromotionResult,
  OwnerSellerCanaryReadback,
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
import { parseX402FetchTransportConfiguration } from '@/modules/capability-supply/public'
import { formatExactAmount, rescaleExactAmount } from '@/modules/money/public'

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
type PromoteCanaryCallback = (
  context: SupplyFunnelActionContext,
  canaryRef: string,
) => Promise<OwnerSellerCanaryPromotionResult>
type RunCanaryCallback = SupplyFunnelCallbacks['runTest']
type X402CanaryDisclosure = Readonly<{
  network: string
  amount: string
  atomicUnits: string
  payTo: string
}>
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
  promoteCanary?: PromoteCanaryCallback
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
  canary = { kind: 'not_found' },
  authorityOptions = emptyAuthorityOptions,
  callbacks,
}: Readonly<{
  businessId: string
  offering: OwnerSupplyOfferingReadback
  initialOffering: OwnerOfferingEditorValue
  initialSource?: SupplyEndpointConfigValue
  initialDocumentPreflight?: SupplyEndpointDocumentPreflight
  canary?: OwnerSellerCanaryReadback
  authorityOptions?: readonly SupplyAuthorityOption[]
  callbacks: SupplyFunnelCallbacks
}>) {
  const [feedback, setFeedback] = useState<Feedback>()
  const [confirmTest, setConfirmTest] = useState(false)
  const actionContext = contextForOffering(businessId, offering)
  const currentStep = offering.currentStep
  const isX402Test = offering.publication?.source.kind === 'x402'
  const x402Canary = isX402Test ? x402CanaryDisclosure(offering) : undefined
  const hasCanaryStatus = canary.kind !== 'not_found'
  const incompatible = offering.publication?.state === 'incompatible'
    || offering.lifecycle.state === 'incompatible'
  const credentialNeedsReplacement = offering.readiness.outcome === 'credential_rejected'
    || offering.readiness.outcome === 'credential_unavailable'
    || offering.actionableReason === 'credential_rejected'
    || offering.actionableReason === 'credential_unavailable'
  const authorityNeedsRebind = offering.actionableReason === 'authority_stale'

  useEffect(() => {
    const targetId = window.location.hash === '#incompatibility'
      ? 'incompatibility'
      : window.location.hash === '#credential-recovery'
        ? 'credential-recovery'
        : window.location.hash === '#provider' && authorityNeedsRebind
          ? 'provider'
        : undefined
    if (targetId === undefined) return
    const target = document.getElementById(targetId)
    if (target === null) return
    target.scrollIntoView({ block: 'start' })
    target.focus({ preventScroll: true })
  }, [authorityNeedsRebind])

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
      {credentialNeedsReplacement ? (
        <div
          id="credential-recovery"
          tabIndex={-1}
          className="scroll-mt-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Alert>
            <AlertTitle>Choose a replacement connection</AlertTitle>
            <AlertDescription className="grid gap-3">
              Refreshing a rejected or unavailable connection reuses the same credential state. Choose a different available owner-scoped connection below, then check and re-admit this exact Operation. If no compatible replacement appears, ask the connection owner to create one; never paste a raw credential here.
              <Button asChild variant="secondary" className="min-h-touch justify-self-start">
                <a href="#provider">Choose replacement connection</a>
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {authorityNeedsRebind ? (
        <Alert>
          <AlertTitle>Re-admit the refreshed authority</AlertTitle>
          <AlertDescription>
            This Operation still holds the previous provider authority snapshot. Check and re-admit the source below; the current Operation revision and source hash guards still apply.
          </AlertDescription>
        </Alert>
      ) : null}
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
      {currentStep === 'admission' || incompatible || credentialNeedsReplacement || authorityNeedsRebind ? (
        <div
          id="provider"
          tabIndex={authorityNeedsRebind ? -1 : undefined}
          className="scroll-mt-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
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
      {currentStep === 'readiness' && !incompatible && !credentialNeedsReplacement && !authorityNeedsRebind ? (
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
      {currentStep === 'test' && !incompatible && !credentialNeedsReplacement && !authorityNeedsRebind && !(isX402Test && hasCanaryStatus) ? (
        <ActionStep
          title="4 · RUN A TEST"
          heading={isX402Test ? 'Run one paid seller canary' : 'Run a real test'}
          detail={isX402Test
            ? x402Canary === undefined
              ? 'AE cannot disclose the exact canary payment from the current admitted material. Reload or re-admit this Operation before authorizing any payment.'
              : confirmTest
                ? `Confirm one AE-funded seller canary on ${x402Canary.network}: ${x402Canary.amount} (${x402Canary.atomicUnits} atomic units) to ${x402Canary.payTo}. This test can transfer testnet USDC. It never charges the buyer and does not create Qualified Use, earnings, or platform rake.`
                : `Review one AE-funded seller canary on ${x402Canary.network}: ${x402Canary.amount} (${x402Canary.atomicUnits} atomic units) to ${x402Canary.payTo}. No payment is sent until you confirm.`
            : 'AE uses the first valid input example from the admitted contract and sends it to the active operation. This test does not charge anyone.'}
          actionLabel={isX402Test
            ? confirmTest
              ? 'Confirm one Base Sepolia payment'
              : 'Review paid canary'
            : confirmTest
              ? 'Send the test'
              : 'Review and confirm the test'}
          disabled={actionContext === undefined || (isX402Test && x402Canary === undefined)}
          onAction={async () => {
            if (!confirmTest) {
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
      {isX402Test && hasCanaryStatus ? (
        <SellerCanaryStatus
          canary={canary}
          {...(actionContext === undefined ? {} : { context: actionContext })}
          {...(x402Canary === undefined ? {} : { payment: x402Canary })}
          retry={callbacks.runTest}
          {...(callbacks.promoteCanary === undefined ? {} : { promote: callbacks.promoteCanary })}
          onReload={reload}
          onFeedback={setFeedback}
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

function SellerCanaryStatus({
  canary,
  context,
  payment,
  retry,
  promote,
  onReload,
  onFeedback,
}: Readonly<{
  canary: Exclude<OwnerSellerCanaryReadback, { kind: 'not_found' }>
  context?: SupplyFunnelActionContext
  payment?: X402CanaryDisclosure
  retry: RunCanaryCallback
  promote?: PromoteCanaryCallback
  onReload: () => Promise<void>
  onFeedback: (feedback: Feedback) => void
}>) {
  const [retryOpen, setRetryOpen] = useState(false)
  const [retryPending, setRetryPending] = useState(false)
  const retryInFlight = useRef(false)
  const [promotionOpen, setPromotionOpen] = useState(false)
  const [promotionPending, setPromotionPending] = useState(false)
  if (canary.kind === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Canary status unavailable</AlertTitle>
        <AlertDescription>{canary.reason ?? 'AE could not read the exact owner canary. Reload before starting another test.'}</AlertDescription>
      </Alert>
    )
  }
  if (canary.kind === 'conflict') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Canary identity conflict</AlertTitle>
        <AlertDescription>AE found conflicting canary records for this exact Operation revision. Do not run or promote another canary until the records are reconciled.</AlertDescription>
      </Alert>
    )
  }

  const availableCanary = canary
  const receipt = availableCanary.receipt
  const canRetry = availableCanary.state === 'refused'
    && availableCanary.refusal?.retryable === true
    && availableCanary.reconciliation === undefined
    && receipt === undefined
    && payment?.network === 'eip155:84532'
    && context !== undefined
  const canPromote = availableCanary.state === 'completed'
    && availableCanary.resultKind === 'completed'
    && receipt?.state === 'settled'
    && availableCanary.promotion.state === 'not_promoted'
    && context !== undefined
    && promote !== undefined
  async function confirmRetry() {
    if (!canRetry || context === undefined || retryInFlight.current) return
    retryInFlight.current = true
    setRetryPending(true)
    try {
      const result = await retry(context)
      onFeedback({
        message: result.refusal === undefined
          ? result.message ?? (result.state === 'completed' ? 'The seller canary completed.' : 'The seller canary needs attention.')
          : refusalMessage(result.refusal),
        variant: result.refusal === undefined && result.state === 'completed' ? 'default' : 'destructive',
      })
      setRetryOpen(false)
      await onReload()
    } finally {
      retryInFlight.current = false
      setRetryPending(false)
    }
  }
  async function confirmPromotion() {
    if (!canPromote || context === undefined || promote === undefined || promotionPending) return
    setPromotionPending(true)
    try {
      const result = await promote(context, availableCanary.canaryRef)
      onFeedback({
        message: result.kind === 'refused'
          ? promotionRefusalMessage(result.code)
          : result.kind === 'replayed'
            ? 'This exact canary promotion was already recorded. The public catalogue projection is current.'
            : 'This exact canary passed and the Operation was promoted to the public catalogue.',
        variant: result.kind === 'refused' ? 'destructive' : 'default',
      })
      setPromotionOpen(false)
      await onReload()
    } finally {
      setPromotionPending(false)
    }
  }

  return (
    <AeSection
      title="Seller canary evidence"
      description="Authoritative state for the exact paid canary retained by AE. Reloading this route reads the same durable canary reference."
    >
      {canary.state === 'reconciliation_required' ? (
        <Alert variant="destructive">
          <AlertTitle>Reconciliation required</AlertTitle>
          <AlertDescription>
            The payment outcome is ambiguous. AE must reconcile the existing authorization before any retry or promotion. Do not run another canary.
          </AlertDescription>
        </Alert>
      ) : canary.state === 'pending' ? (
        <Alert>
          <AlertTitle>Canary is still running</AlertTitle>
          <AlertDescription>AE has retained this invocation. Reload its status; do not start a second payment.</AlertDescription>
        </Alert>
      ) : canary.state === 'refused' && canary.refusal?.retryable === true ? (
        <Alert variant="destructive">
          <AlertTitle>Canary retry is available</AlertTitle>
          <AlertDescription>
            {canary.refusal.nextAction ?? `AE recorded ${canary.refusal.code}.`}{' '}
            {canRetry
              ? 'No payment evidence was retained for this refusal. Review the exact Base Sepolia terms before authorizing one new test payment.'
              : 'AE cannot safely offer another payment from the current evidence. Reload the exact status or correct the recorded issue before continuing.'}
          </AlertDescription>
        </Alert>
      ) : canary.state === 'refused' ? (
        <Alert variant="destructive">
          <AlertTitle>Canary did not pass</AlertTitle>
          <AlertDescription>
            {canary.refusal?.nextAction ?? canary.refusal?.code ?? 'The retained canary cannot be promoted.'}{' '}
            This canary is terminal and cannot be retried. Re-admit only if the recorded remediation actually changes the Operation material.
          </AlertDescription>
        </Alert>
      ) : canary.state === 'cancelled' ? (
        <Alert variant="destructive">
          <AlertTitle>Canary was cancelled</AlertTitle>
          <AlertDescription>
            The retained canary cannot be retried from this state. Reload its exact evidence before deciding whether the Operation material needs to change.
          </AlertDescription>
        </Alert>
      ) : canary.promotion.state === 'promoted' ? (
        <Alert>
          <AlertTitle>Promotion recorded</AlertTitle>
          <AlertDescription>This exact canary has already promoted the Operation. Replaying promotion is safe but unnecessary.</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>Canary passed</AlertTitle>
          <AlertDescription>Settlement and contract-valid output are recorded. Promotion remains a separate owner action.</AlertDescription>
        </Alert>
      )}
      <AeFactList facts={sellerCanaryFacts(canary)} />
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" className="min-h-touch" onClick={() => void onReload()}>
          Reload canary status
        </Button>
        {canRetry && payment !== undefined ? (
          <>
            <Button type="button" className="min-h-touch" onClick={() => setRetryOpen(true)}>
              Review one payment retry
            </Button>
            <AeConfirmDialog
              open={retryOpen}
              onOpenChange={setRetryOpen}
              title="Retry with one Base Sepolia payment?"
              description={`AE will make one new test payment on ${payment.network}: ${payment.amount} (${payment.atomicUnits} atomic units) to ${payment.payTo}. No payment is sent until you confirm. This AE-funded canary never charges the buyer and does not create Qualified Use, earnings, or platform rake.`}
              confirmLabel="Confirm one Base Sepolia payment"
              pending={retryPending}
              onConfirm={confirmRetry}
            />
          </>
        ) : null}
        {canPromote ? (
          <>
            <Button type="button" className="min-h-touch" onClick={() => setPromotionOpen(true)}>
              Promote to public catalogue
            </Button>
            <AeConfirmDialog
              open={promotionOpen}
              onOpenChange={setPromotionOpen}
              title="Promote this exact canary?"
              description={`AE will publish only the Operation revision sealed by canary ${canary.canaryRef}. Current source, seller claim, readiness, settlement, and output evidence are revalidated atomically.`}
              confirmLabel="Confirm promotion"
              pending={promotionPending}
              onConfirm={confirmPromotion}
            />
          </>
        ) : null}
      </div>
    </AeSection>
  )
}

function sellerCanaryFacts(
  canary: Extract<OwnerSellerCanaryReadback, { kind: 'available' }>,
) {
  const receipt = canary.receipt
  return [
    { label: 'Canary state', value: canary.state },
    { label: 'Canary reference', value: canary.canaryRef, mono: true },
    { label: 'Invocation reference', value: canary.invocationRef, mono: true },
    { label: 'Attempt reference', value: canary.attemptRef ?? 'Not assigned', mono: true },
    { label: 'Invocation evidence', value: canary.evidenceHash ?? 'Not recorded', mono: true },
    { label: 'Receipt state', value: receipt?.state ?? 'Not recorded' },
    { label: 'Receipt reference', value: receipt?.receiptRef ?? 'Not recorded', mono: true },
    { label: 'Receipt evidence', value: receipt?.evidenceHash ?? 'Not recorded', mono: true },
    { label: 'Network', value: receipt?.network ?? 'Not recorded', mono: true },
    { label: 'Asset', value: receipt?.asset ?? 'Not recorded', mono: true },
    { label: 'Payment identifier', value: receipt?.paymentIdentifier ?? 'Not recorded', mono: true },
    { label: 'Settlement transaction', value: receipt?.settlementTransactionHash ?? 'Not recorded', mono: true },
    { label: 'External settlement', value: receipt?.externalSettlementRef ?? 'Not recorded', mono: true },
    { label: 'Reconciliation required at', value: canary.reconciliation?.requiredAt ?? 'No' },
    { label: 'Refusal code', value: canary.refusal?.code ?? 'None', mono: true },
    { label: 'Retry allowed', value: canary.refusal?.retryable === true ? 'Yes' : 'No' },
    { label: 'Recorded next action', value: canary.refusal?.nextAction ?? 'None' },
    { label: 'Promotion', value: canary.promotion.state },
    ...(canary.promotion.state === 'promoted'
      ? [{ label: 'Promotion evidence', value: canary.promotion.evidenceDigest, mono: true }]
      : []),
  ]
}

function promotionRefusalMessage(code: Extract<OwnerSellerCanaryPromotionResult, { kind: 'refused' }>['code']): string {
  switch (code) {
    case 'canary_pending':
      return 'The canary is still pending. Reload its retained status before promotion.'
    case 'reconciliation_required':
      return 'The payment must be reconciled before promotion. Do not start another canary.'
    case 'target_drift':
    case 'canary_target_mismatch':
    case 'canary_identity_mismatch':
    case 'operation_commitment_stale':
      return 'The Operation no longer matches the exact canary target. AE will not charge this publication again; reconcile any uncertain payment, then correct and admit a new material revision.'
    case 'readiness_stale':
      return 'Current readiness is stale. Refresh readiness and retry promotion of the retained settled canary; do not start another payment.'
    case 'seller_claim_stale':
      return 'The seller claim no longer matches the retained canary. AE will not charge this publication again; correct and admit a new material revision.'
    case 'output_nondeterministic':
    case 'output_contract_invalid':
    case 'output_unusable':
      return 'The canary output did not satisfy the sealed contract evidence required for promotion.'
    case 'payment_not_settled':
    case 'payment_evidence_missing':
    case 'spend_commitment_mismatch':
      return 'Exact settlement evidence is missing or does not match the canary commitment. Promotion remains blocked.'
    default:
      return `Promotion was refused (${code}). Reload the exact canary evidence before taking another action.`
  }
}

function x402CanaryDisclosure(offering: OwnerSupplyOfferingReadback): X402CanaryDisclosure | undefined {
  const material = offering.sourceMaterial
  if (material?.sourceKind !== 'x402') return undefined
  const config = parseX402FetchTransportConfiguration(material.binding.adapter.config)
  let pricing: unknown
  try {
    pricing = JSON.parse(material.pricingConfigJson)
  } catch {
    return undefined
  }
  if (
    config === undefined
    || typeof pricing !== 'object'
    || pricing === null
    || !('paidAmount' in pricing)
  ) return undefined
  const paidAmount = pricing.paidAmount
  if (
    typeof paidAmount !== 'object'
    || paidAmount === null
    || !('currency' in paidAmount)
    || !('units' in paidAmount)
    || !('exponent' in paidAmount)
    || typeof paidAmount.currency !== 'string'
    || typeof paidAmount.units !== 'string'
    || typeof paidAmount.exponent !== 'number'
  ) return undefined
  const formatted = formatExactAmount(paidAmount)
  const atomicAmount = rescaleExactAmount(paidAmount, config.assetAmountExponent)
  return formatted === undefined || atomicAmount === undefined
    ? undefined
    : {
        network: config.network,
        amount: `${paidAmount.currency} ${formatted}`,
        atomicUnits: atomicAmount.units,
        payTo: config.payTo,
      }
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
