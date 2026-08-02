import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { timestampIso } from '@/lib/ui/format-time'
import { formatCurrencyAmount } from '@/modules/customer-request/format-currency-amount'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  exportSupportProblemServer,
  readSupportProblemsServer,
  updateSupportProblemServer,
  type SupportProblemExport,
  type SupportProblemRow,
} from '@/modules/customer-request/problem-support.functions'

export const Route = createFileRoute('/_operator/admin/request-problems')({
  ...operatorRouteOptions,
  loader: () => readSupportProblemsServer(),
  head: () => ({
    meta: [
      { title: 'Request problems | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: RequestProblemsRoute,
})

function RequestProblemsRoute() {
  const result = Route.useLoaderData()

  return <AeOperatorShell
    operatorRole="admin"
    title="Request problems"
    description="Record status updates without deciding cause, responsibility, or remedy."
    currentPath="/admin/request-problems"
  >
    {result.kind !== 'allowed'
      ? <Card className="p-5"><p className="text-muted-foreground">{result.kind === 'unavailable' ? 'Request problems could not be loaded. Refresh the page to try again.' : 'Active support access is required.'}</p></Card>
      : result.rows.length === 0
        ? <Card className="p-5"><p className="text-muted-foreground">No reported Request problems need tracking.</p></Card>
        : <div className="grid gap-4">
          {result.rows.map((problem) => <SupportProblemCard key={problem.reportRef} problem={problem} />)}
        </div>}
  </AeOperatorShell>
}

function SupportProblemCard({ problem }: { problem: SupportProblemRow }) {
  const router = useRouter()
  const [state, setState] = useState<'investigating' | 'waiting_for_customer' | 'closed'>('investigating')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [record, setRecord] = useState<Extract<SupportProblemExport, { kind: 'problem_export' }> | undefined>()
  const [loadingRecord, setLoadingRecord] = useState(false)

  async function update() {
    if (message.trim().length === 0 || submitting) return
    setSubmitting(true)
    setError(undefined)
    try {
      const result = await updateSupportProblemServer({ data: {
        reportRef: problem.reportRef,
        expectedVersion: problem.version,
        idempotencyKey: `support:${problem.reportRef}:${crypto.randomUUID()}`,
        state,
        publicMessage: message.trim(),
      } })
      if (result.kind !== 'problem_status_updated') {
        setError(result.kind === 'conflict'
          ? 'This report changed. Reload the latest status before updating it.'
          : 'This update was not accepted.')
        return
      }
      setMessage('')
      await router.invalidate()
    } catch {
      setError('AE could not record the status update.')
    } finally {
      setSubmitting(false)
    }
  }

  async function inspectRecord() {
    if (loadingRecord) return
    if (record !== undefined) {
      setRecord(undefined)
      return
    }
    setLoadingRecord(true)
    setError(undefined)
    try {
      const result = await exportSupportProblemServer({ data: { reportRef: problem.reportRef } })
      if (result.kind !== 'problem_export') {
        setError('The current report record is not available.')
        return
      }
      setRecord(result)
    } catch {
      setError('AE could not load the report record.')
    } finally {
      setLoadingRecord(false)
    }
  }

  return <Card className="p-5">
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold leading-tight tracking-tight text-foreground">{problem.category.replaceAll('_', ' ')}</h2>
          <p className="text-muted-foreground">{problem.summary}</p>
          <p className="text-sm text-muted-foreground">
            {problem.business === undefined ? 'Business not named' : problem.business} · {problem.state.replaceAll('_', ' ')} · next: {problem.nextActor}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">Version {problem.version}</p>
      </div>
      <Field>
        <FieldLabel htmlFor={`problem-state-${problem.reportRef}`}>Next status</FieldLabel>
        <Select
          value={state}
          onValueChange={(value) => {
            if (value === 'investigating' || value === 'waiting_for_customer' || value === 'closed') setState(value)
          }}
        >
          <SelectTrigger id={`problem-state-${problem.reportRef}`} className="min-h-11 w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="investigating">AE is investigating</SelectItem>
            <SelectItem value="waiting_for_customer">Customer information needed</SelectItem>
            <SelectItem value="closed">Close without adjudication</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`problem-message-${problem.reportRef}`}>Customer-visible update</FieldLabel>
        <Textarea
          id={`problem-message-${problem.reportRef}`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1_000}
          required
          className="min-h-24 bg-card"
        />
      </Field>
      <p className="text-sm text-muted-foreground">
        This records progress only. It does not assign fault, approve compensation, or authorize another business action.
      </p>
      <Button type="button" variant="secondary" onClick={() => void inspectRecord()} disabled={loadingRecord}>
        {loadingRecord ? 'Loading record…' : record === undefined ? 'Inspect report record' : 'Hide report record'}
      </Button>
      {record === undefined ? null : <div className="grid gap-3 rounded-md border border-border bg-card p-4">
        <div className="grid gap-1">
          <p className="font-semibold text-foreground">Customer report record</p>
          <p className="text-sm text-muted-foreground">
            Step {record.affected.step}
            {record.affected.business === undefined ? '' : ` · ${record.affected.business}`}
            {' · '}
            {record.visibility === 'customer_and_ae_only'
              ? 'Customer and AE only'
              : 'Customer allowed sharing with the affected business'}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Recorded evidence</p>
          {record.evidence.length === 0
            ? <p className="text-sm text-muted-foreground">No result evidence was attached.</p>
            : <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
              {record.evidence.map((item) => <li key={item.receiptRef}>{item.label}</li>)}
            </ul>}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Customer-visible history</p>
          <ol className="mt-1 grid gap-2 text-sm text-muted-foreground">
            {record.history.map((item) => <li key={item.version}>
              {item.source === 'customer' ? 'Customer' : 'AE support'} · {item.state.replaceAll('_', ' ')} · {item.message}
            </li>)}
          </ol>
        </div>
        {record.reconstruction === undefined
          ? <p className="text-sm text-muted-foreground">
              This older report predates the single-record Request reconstruction.
            </p>
          : <SupportProblemReconstruction reconstruction={record.reconstruction} />}
        <p className="text-sm text-muted-foreground">
          Cause remains unknown and the report is not adjudicated. No decision authority is assigned.
        </p>
      </div>}
      <Button type="button" variant="default" onClick={() => void update()} disabled={submitting || message.trim().length === 0}>
        {submitting ? 'Recording update…' : 'Record status update'}
      </Button>
      {error === undefined ? null : <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </Card>
}

export function SupportProblemReconstruction({
  reconstruction,
}: {
  reconstruction: NonNullable<Extract<SupportProblemExport, { kind: 'problem_export' }>['reconstruction']>
}) {
  const headingId = useId()

  return <section aria-labelledby={headingId} className="grid gap-4 border-t border-border pt-4">
    <div className="grid gap-1">
      <h3 id={headingId} className="text-lg font-semibold leading-tight tracking-tight">Request reconstruction</h3>
      <p className="text-sm text-muted-foreground">
        One source record for what the customer asked, confirmed, shared, and can safely do next.
      </p>
    </div>
    <dl className="grid gap-3 text-sm">
      <div>
        <dt className="font-semibold">Customer request · revision {reconstruction.request.revision}</dt>
        <dd className="text-muted-foreground">{reconstruction.request.ordinaryRequest}</dd>
      </div>
      <div>
        <dt className="font-semibold">Confirmed businesses</dt>
        <dd className="text-muted-foreground">{reconstruction.choice.businesses.join(' → ')}</dd>
        {reconstruction.choice.selectedBecause.map((reason) => (
          <dd key={reason} className="text-muted-foreground">{reason}</dd>
        ))}
      </div>
      <div>
        <dt className="font-semibold">Customer-confirmed limits · {reconstruction.authority.state}</dt>
        <dd className="text-muted-foreground">
          {formatCurrencyAmount(reconstruction.authority.spend.limit.currency, reconstruction.authority.spend.limit.amountMinor)} maximum ·{' '}
          {formatCurrencyAmount(reconstruction.authority.spend.admitted.currency, reconstruction.authority.spend.admitted.amountMinor)} admitted so far
        </dd>
        <dd className="text-muted-foreground">
          Confirmed {timestampIso(reconstruction.choice.confirmedAt)} · valid until{' '}
          {timestampIso(reconstruction.choice.validUntil)}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Information authority and release</dt>
        <dd>
          <ul className="grid gap-1 text-muted-foreground">
            {reconstruction.authority.dataSharing.map((sharing, index) => <li key={`${sharing.recipient}:${index}`}>
              {sharing.releaseState === 'authorized' ? 'Authorized' : 'Business step released'}
              {': '}
              {customerLabel(sharing.classification)} information with {sharing.recipient} for{' '}
              {sharing.purposes.map(customerLabel).join(', ')}
            </li>)}
          </ul>
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Business progress</dt>
        <dd>
          <ol className="grid gap-1 text-muted-foreground">
            {reconstruction.execution.steps.map((step) => <li key={step.step}>
              Step {step.step}: {step.business} · {customerLabel(step.state)}
              {step.evidence.length === 0 ? '' : ` · ${step.evidence.length} evidence receipt${step.evidence.length === 1 ? '' : 's'}`}
            </li>)}
          </ol>
        </dd>
        <dd className="text-muted-foreground">
          {reconstruction.execution.completedSteps} of {reconstruction.execution.totalSteps} completed ·{' '}
          {reconstruction.execution.duplicateRisk === 'protected_by_required_idempotency'
            ? 'AE reuses the same recorded attempt instead of asking the business twice.'
            : 'Duplicate posture differs by step and requires support review.'}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Allowed effects</dt>
        <dd>
          <ul className="grid gap-1 text-muted-foreground">
            {reconstruction.authority.effects.map((effect, index) => <li key={`${effect.class}:${index}`}>
              {effect.releaseState === 'authorized' ? 'Authorized' : 'Business step released'}
              {': '}
              {customerLabel(effect.class)} · {customerLabel(effect.reversibility)}
            </li>)}
          </ul>
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Next safe action</dt>
        <dd className="text-muted-foreground">
          {reconstruction.recovery.nextActor === 'ae' ? 'AE support' : customerLabel(reconstruction.recovery.nextActor)}
          {' · '}
          {supportNextAction(reconstruction.recovery.nextAction)}
        </dd>
      </div>
    </dl>
  </section>
}


function customerLabel(value: string): string {
  const words = value.replaceAll(/[-_]+/gu, ' ')
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`
}

function supportNextAction(
  value: NonNullable<
    Extract<SupportProblemExport, { kind: 'problem_export' }>['reconstruction']
  >['recovery']['nextAction'],
): string {
  if (value === 'await_status_update') return 'Wait for the next status update'
  if (value === 'check_status') return 'Check the latest status'
  if (value === 'provide_information') return 'Ask the customer for the requested information'
  return 'No further customer action is required'
}

