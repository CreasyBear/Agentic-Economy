import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'


import type { PricingConfig } from '@/modules/money/public'
import { AeOwnerOfferingEditor, type OwnerOfferingEditorValue, type OwnerOfferingSaveResult } from '@/components/ae/offerings/AeOwnerOfferings'
import type { SupplyFunnelDraft, SupplyFunnelRefusal, SupplyFunnelStep, SupplyFunnelStepCompletion, SupplyFunnelStepState } from '@/modules/capability-supply/supply-funnel.functions'
import { defaultSupplyPricingConfig } from '@/modules/capability-supply/public'
import { AeSupplyEndpointConfigStep, type SupplyEndpointConfigValue } from './AeSupplyEndpointConfigStep'
import { emptySupplyFunnelDraft, readSupplyFunnelDraft, writeSupplyFunnelDraft } from './AeSupplyFunnel.exports'

const steps: readonly SupplyFunnelStep[] = ['describe', 'endpoint', 'readiness', 'pricing', 'test', 'publish']
const stepLabels: Readonly<Record<SupplyFunnelStep, string>> = {
  describe: 'Describe your service',
  endpoint: 'Connect your service',
  readiness: 'Check that it works',
  pricing: 'Set your price',
  test: 'Run a test',
  publish: 'Go live',
}

const stepStateLabels: Readonly<Record<SupplyFunnelStepState, string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Done',
  refused: 'Needs attention',
  stale: 'Needs a fresh check',
}

export type SupplyFunnelCallbacks = Readonly<{
  saveOffering: (value: OwnerOfferingEditorValue) => Promise<OwnerOfferingSaveResult>
  advance: (step: SupplyFunnelStep, value: Readonly<Record<string, unknown>>) => Promise<SupplyFunnelStepCompletion>
  runReadiness: (value: Readonly<Record<string, unknown>>) => Promise<SupplyFunnelStepCompletion>
  runTest: (value: Readonly<Record<string, unknown>>) => Promise<SupplyFunnelStepCompletion>
  publish: (value: Readonly<Record<string, unknown>>) => Promise<SupplyFunnelStepCompletion>
}>

export function AeSupplyFunnel({
  businessId,
  initialOffering,
  offeringRef,
  callbacks,
}: Readonly<{
  businessId: string
  initialOffering: OwnerOfferingEditorValue
  offeringRef?: string
  callbacks: SupplyFunnelCallbacks
}>) {
  const [draft, setDraft] = useState<SupplyFunnelDraft>(() => {
    const stored = readSupplyFunnelDraft()
    return stored !== undefined
      && stored.businessId === businessId
      && (offeringRef === undefined || stored.offeringRef === offeringRef)
      ? stored
      : emptySupplyFunnelDraft(businessId, offeringRef)
  })
  const [endpoint, setEndpoint] = useState<SupplyEndpointConfigValue>()
  const [pricing, setPricing] = useState<PricingConfig>(defaultSupplyPricingConfig)
  const [message, setMessage] = useState<string>()
  const [confirmTest, setConfirmTest] = useState(false)
  const currentStep = useMemo(() => steps.find((step) => draft.states[step] !== 'completed') ?? 'publish', [draft.states])

  useEffect(() => { writeSupplyFunnelDraft(draft) }, [draft])
  function updateCompletion(result: SupplyFunnelStepCompletion) {
    setDraft((current) => {
      const states = { ...current.states, [result.step]: result.state }
      const firstChanged = steps.indexOf(result.step)
      for (const later of steps.slice(firstChanged + 1)) {
        if (states[later] === 'completed') states[later] = 'stale'
      }
      const completedSteps = steps.filter((step) => states[step] === 'completed')
      return { ...current, ...(result.offeringRef === undefined ? {} : { offeringRef: result.offeringRef }), ...(result.revision === undefined ? {} : { revision: result.revision }), ...(result.sourceHash === undefined ? {} : { source: { sourceHash: result.sourceHash } }), states, completedSteps }
    })
    setMessage(result.refusal === undefined ? result.message ?? (result.state === 'completed' ? `${stepLabels[result.step]} is saved.` : 'This step needs attention.') : refusalMessage(result.refusal))
  }
  function reopen(step: SupplyFunnelStep) {
    setDraft((current) => {
      const states = { ...current.states, [step]: 'in_progress' }
      for (const later of steps.slice(steps.indexOf(step) + 1)) states[later] = 'stale'
      return { ...current, states, completedSteps: current.completedSteps.filter((item) => item !== step) }
    })
  }

  const endpointValue = endpoint === undefined ? {} : endpoint
  return (
    <div className="grid gap-6">
      {message === undefined ? null : (
        <Alert variant={draft.states[currentStep] === 'refused' ? 'destructive' : 'default'}>
          <AlertTitle>Setup update</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3" aria-label="Your six setup steps">
        {steps.map((step) => {
          const state = draft.states[step]
          return (
            <li key={step} className="flex items-center gap-2 rounded-md border border-border p-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">{state === 'completed' ? '✓' : steps.indexOf(step) + 1}</span>
              <span className="grid gap-0.5">
                <span className="block font-semibold text-foreground">{stepLabels[step]}</span>
                <span className="block text-sm text-muted-foreground">{stepStateLabels[state]}</span>
              </span>
              {state === 'completed' ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => reopen(step)} className="ml-auto">
                  Reopen {stepLabels[step].toLowerCase()}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ol>
      {currentStep === 'describe' ? <AeOwnerOfferingEditor initialValue={initialOffering} onSave={async (value) => { const result = await callbacks.saveOffering(value); if (result.kind === 'saved') updateCompletion({ step: 'describe', state: 'completed', ...(value.offeringRef === undefined ? {} : { offeringRef: value.offeringRef }), revision: result.value.expectedRevision, message: 'Your service details are saved. Next, connect your service.' }); return result }} draftKey={businessId} /> : null}
      {currentStep === 'endpoint' ? <AeSupplyEndpointConfigStep initialValue={endpointValue} onSubmit={async (value) => { setEndpoint(value); const result = await callbacks.advance('endpoint', value); updateCompletion(result) }} /> : null}
      {currentStep === 'readiness' ? <ActionStep title="3 · CHECK YOUR SERVICE" heading="Check that it works" detail="We will record whether the service responds and when that check expires. A response does not promise completed customer work." actionLabel="Check the service" onAction={async () => { const result = await callbacks.runReadiness({ endpoint: endpointValue }); updateCompletion(result) }} /> : null}
      {currentStep === 'pricing' ? <PricingStep config={pricing} onChange={setPricing} onComplete={async () => { const result = await callbacks.advance('pricing', pricing); updateCompletion(result) }} /> : null}
      {currentStep === 'test' ? <ActionStep title="5 · RUN A TEST" heading="Run a real test" detail="Review the request, possible cost, and any effect before you send it. This test does not charge anyone or create earnings." actionLabel={confirmTest ? 'Send the test' : 'Review and confirm the test'} onAction={async () => { if (!confirmTest) { setConfirmTest(true); return } const result = await callbacks.runTest({ endpoint: endpointValue, pricing }); updateCompletion(result) }} /> : null}
      {currentStep === 'publish' ? <ActionStep title="6 · GO LIVE" heading="Go live" detail="Publish this service so assistants can find it. Public pages may take a little time to update." actionLabel="Publish your service" onAction={async () => { const result = await callbacks.publish({ endpoint: endpointValue, pricing }); updateCompletion(result) }} /> : null}
    </div>
  )
}

function ActionStep({ title, heading, detail, actionLabel, onAction }: Readonly<{ title: string; heading: string; detail: string; actionLabel: string; onAction: () => Promise<void> }>) {
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
    <Card>
      <CardHeader className="p-5 pb-0">
        <CardTitle>
          <p className="block text-sm font-semibold text-muted-foreground">{title}</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">{heading}</h2>
        </CardTitle>
        <CardDescription><p>{detail}</p></CardDescription>
      </CardHeader>
      <CardFooter className="p-5 pt-0">
        <Button type="button" variant="default" disabled={pending} aria-busy={pending || undefined} onClick={() => void run()} className="min-h-11">
          {pending ? 'Working' : actionLabel}
        </Button>
      </CardFooter>
    </Card>
  )
}

function PricingStep({ config, onChange, onComplete }: Readonly<{ config: PricingConfig; onChange: (config: PricingConfig) => void; onComplete: () => Promise<void> }>) {
  const [pending, setPending] = useState(false)
  async function complete() {
    setPending(true)
    try {
      await onComplete()
    } finally {
      setPending(false)
    }
  }
  return (
    <Card>
      <CardHeader className="p-5 pb-0">
        <CardTitle>
          <p className="block text-sm font-semibold text-muted-foreground">4 · SET YOUR PRICE</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Choose a price per call</h2>
        </CardTitle>
        <CardDescription><p>Free calls are okay. Set what agents pay each time they use your service.</p></CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 p-5">
        <FieldGroup>
          <Field {...(pending ? { 'data-disabled': true } : {})}>
            <FieldLabel htmlFor="supply-paid-amount">Price per call</FieldLabel>
            <Input
              id="supply-paid-amount"
              type="number"
              min={0}
              value={config.paidAmountMinor}
              disabled={pending}
              aria-describedby="supply-price-help"
              onChange={(event) => onChange({ ...config, paidAmountMinor: Number(event.currentTarget.value) })}
            />
            <FieldDescription id="supply-price-help">Enter 0 for a free service.</FieldDescription>
          </Field>
        </FieldGroup>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Technical pricing details</summary>
          <p className="mt-2 block text-muted-foreground">Currency: {config.currency} · Unit: {config.unit}. The saved amount uses the currency's smallest unit.</p>
        </details>
      </CardContent>
      <CardFooter className="p-5 pt-0">
        <Button type="button" variant="default" disabled={pending} aria-busy={pending || undefined} onClick={() => void complete()} className="min-h-11">
          {pending ? 'Saving price' : 'Save price'}
        </Button>
      </CardFooter>
    </Card>
  )
}
function refusalMessage(refusal: SupplyFunnelRefusal): string {
  switch (refusal) {
    case 'invalid_offering':
      return 'Your service details need attention. Update the description, then try again.'
    case 'invalid_access_path':
    case 'selector_invalid':
    case 'operation_not_found':
    case 'schema_missing':
    case 'schema_profile_unsupported':
    case 'transport_unsupported':
    case 'source_invalid':
    case 'source_too_large':
    case 'source_too_deep':
    case 'source_version_unsupported':
      return 'The connection details need attention. Check advanced setup and try again.'
    case 'revision_conflict':
    case 'target_changed':
    case 'revision_changed':
    case 'offering_identity_conflict':
    case 'contract_identity_conflict':
    case 'operation_key_conflict':
    case 'offering_integrity_failure':
    case 'binding_integrity_failure':
    case 'catalog_offering_origin_changed':
      return 'This service changed while you were working. Refresh the details and try again.'
    case 'authorization_denied':
      return 'You do not have permission to change this service. Check your business access and try again.'
    case 'source_unavailable':
    case 'adapter_not_registered':
    case 'adapter_config_invalid':
    case 'adapter_config_too_large':
    case 'target_not_public':
    case 'transport_unreachable':
    case 'http_redirect':
    case 'http_4xx':
    case 'http_5xx':
    case 'response_content_type_invalid':
    case 'response_too_large':
    case 'response_invalid':
      return 'AE could not reach this service. Check advanced setup and try again.'
    case 'credential_rejected':
    case 'credential_unavailable':
      return 'AE could not use the access settings. Update advanced setup and try again.'
    case 'commercial_metadata_inconsistent':
    case 'price_unavailable':
    case 'pricing_config_invalid':
    case 'currency_mismatch':
      return 'The price details need attention. Choose a valid price and try again.'
    case 'payment_execution_unsupported':
      return 'Paid calls are not available for this setup yet. Choose free calls or enable payment support, then try again.'
    case 'input_invalid':
      return 'Check the details and try again.'
    case 'outcome_unknown':
      return 'The test result is not clear yet. Check the service before trying again.'
    case 'registration_context_invalid':
      return 'The service is not ready to publish yet. Return to its details and try again.'
    case 'readiness_stale':
      return 'The service changed after the last check. Check it again before continuing.'
  }
}
