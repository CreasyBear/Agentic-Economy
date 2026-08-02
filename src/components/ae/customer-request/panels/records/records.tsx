import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { isRecord } from '@/modules/common/is-record'
import {
  customerRequestEvidenceResultSchema,
  type CustomerRequestEvidenceExport,
} from '@/modules/customer-request/agent-contract'
import { formatTimestamp } from '@/lib/ui/format-time'
import { isPartialResult, readableResult } from '../shared'

export function RequestRecordLinks({ requestRef }: { requestRef: string }) {
  const [reporting, setReporting] = useState(false)
  const [summary, setSummary] = useState('')
  const [problemCategory, setProblemCategory] = useState<
    'incorrect_result'
    | 'unexpected_cost'
    | 'duplicate_charge_or_effect'
    | 'privacy_concern'
    | 'could_not_stop'
    | 'other'
  >('other')
  const [affectedStep, setAffectedStep] = useState<number | undefined>()
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([])
  const [visibility, setVisibility] = useState<'customer_and_ae_only' | 'share_with_affected_business'>('customer_and_ae_only')
  const [receipt, setReceipt] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [evidence, setEvidence] = useState<CustomerRequestEvidenceExport | undefined>()
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | undefined>()

  async function inspectEvidence() {
    if (evidenceLoading) return
    if (evidence !== undefined) {
      setEvidence(undefined)
      return
    }
    await loadEvidence()
  }

  async function loadEvidence() {
    if (evidenceLoading) return
    setEvidenceLoading(true)
    setEvidenceError(undefined)
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(requestRef)}/evidence`, {
        headers: { Accept: 'application/json' },
      })
      const parsed = customerRequestEvidenceResultSchema.safeParse(await response.json())
      if (!response.ok || !parsed.success || parsed.data.kind !== 'evidence') {
        setEvidenceError('AE could not open the activity record. Your Request is unchanged.')
        return
      }
      const exported = parsed.data
      setEvidence(exported)
      setAffectedStep((current) => current ?? exported.steps.at(-1)?.step)
    } catch {
      setEvidenceError('AE could not be reached. Your Request is unchanged.')
    } finally {
      setEvidenceLoading(false)
    }
  }

  async function reportProblem() {
    if (summary.trim().length === 0) return
    setError(undefined)
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(requestRef)}/problems`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `problem:${requestRef}:${crypto.randomUUID()}`,
          category: problemCategory, summary: summary.trim(),
          ...(affectedStep === undefined ? {} : { affectedStep }),
          evidenceReceiptRefs: selectedEvidence,
          visibility,
        }),
      })
      const result: unknown = await response.json()
      if (!response.ok || !isRecord(result)
        || !('kind' in result) || result.kind !== 'problem_reported'
        || !('reportRef' in result) || typeof result.reportRef !== 'string') {
        setError('AE could not record that problem. Your Request is unchanged.')
        return
      }
      setReceipt(result.reportRef)
      setReporting(false)
      setSummary('')
      setSelectedEvidence([])
    } catch {
      setError('AE could not be reached. Your Request is unchanged.')
    }
  }

  return <div className="grid gap-3 pt-4">
    <Separator />
    <div className="flex flex-wrap items-center gap-4">
      <Button type="button" variant="link" className="min-h-11 p-0 text-sm" onClick={() => void inspectEvidence()}>
        {evidenceLoading ? 'Opening activity record…' : evidence === undefined ? 'View activity record' : 'Hide activity record'}
      </Button>
      <Button type="button" variant="link" className="min-h-11 p-0 text-sm" onClick={() => {
        setReporting((current) => !current)
        if (evidence === undefined) void inspectEvidence()
      }}>Report a problem</Button>
    </div>
    {evidence === undefined ? null : <section className="grid gap-3 rounded-md border border-border bg-card p-4" aria-live="polite">
      <h3 className="text-xl font-semibold">Activity record</h3>
      <p className="text-muted-foreground">{activityRecordSummary(evidence.state)}</p>
      <ol className="grid gap-3">
        {evidence.steps.map((step) => <li key={step.step} className="grid gap-1 border-l-2 border-brand pl-3">
          <p className="font-semibold">Step {step.step} {activityStepState(step.state)}</p>
          {step.evidence.length === 0
            ? <p className="text-sm text-muted-foreground">No receipt has been recorded for this step yet.</p>
            : step.evidence.map((item) => <p key={item.receiptRef} className="text-sm text-muted-foreground">{item.label}</p>)}
        </li>)}
      </ol>
      {evidence.result === undefined ? null : <div className="grid gap-1">
        <p className="font-semibold">{isPartialResult(evidence.result) ? 'Recorded partial result' : 'Recorded result'}</p>
        <p className="text-muted-foreground">{readableResult(evidence.result)}</p>
        {isPartialResult(evidence.result) ? <p className="text-sm text-muted-foreground">
          This evidence does not confirm completion.
        </p> : null}
      </div>}
      {evidence.problems.length === 0 ? null : <div className="grid gap-2">
        <p className="font-semibold">Reported problems</p>
        <ol className="grid gap-3">
          {evidence.problems.map((problem) => <li key={problem.reportRef} className="grid gap-1 border-l-2 border-border pl-3">
            <p className="font-semibold">Step {problem.affected.step}: {problem.state === 'update_due' ? 'status update due' : 'report received'}</p>
            <p className="text-muted-foreground">{problem.summary}</p>
            {problem.affected.business === undefined ? null
              : <p className="text-sm text-muted-foreground">This report is attached to the step involving {problem.affected.business}.</p>}
            <p className="text-sm text-muted-foreground">
              This is your report. AE has not decided what caused the problem, who is responsible, or whether a remedy is due.
            </p>
            <p className="text-sm text-muted-foreground">
              {problem.nextActor === 'customer'
                ? 'AE needs more information from you before it can continue checking this report.'
                : problem.nextActor === 'none'
                  ? 'This record is closed without deciding cause, responsibility, or remedy.'
                  : problem.state === 'update_due' && problem.nextUpdateDueAt !== undefined
                    ? `AE’s status update was due ${formatTimestamp(problem.nextUpdateDueAt)}. No reviewer or remedy authority has been assigned.`
                    : problem.nextUpdateDueAt === undefined
                      ? 'AE owns the next status update. No reviewer or remedy authority has been assigned.'
                      : `AE owns the next status update, due ${formatTimestamp(problem.nextUpdateDueAt)}. No reviewer or remedy authority has been assigned.`}
            </p>
            <p className="text-sm text-muted-foreground">
              {problem.visibility === 'customer_and_ae_only'
                ? 'Visible only to you and AE.'
                : 'AE may share this report with the business for this step.'}
            </p>
            {problem.evidence.length === 0 ? null
              : <p className="text-sm text-muted-foreground">{problem.evidence.length} recorded evidence item{problem.evidence.length === 1 ? '' : 's'} attached.</p>}
            {(() => {
              const businessClaims = []
              for (const claim of problem.claims) {
                if (claim.claimSource === 'business') businessClaims.push(claim)
              }
              return businessClaims.length === 0 ? null : <div className="grid gap-1">
                <p className="text-sm font-semibold">Business statements</p>
                {businessClaims.map((claim) => <p
                  key={`${claim.business ?? 'business'}:${claim.recordedAt}`}
                  className="text-sm text-muted-foreground"
                >
                  {claim.business ?? 'The business'}: {claim.statement}{' '}
                  {claim.causalityPosition === 'supports'
                    ? 'The business says this supports your report.'
                    : claim.causalityPosition === 'disputes'
                      ? 'The business disputes the reported cause.'
                      : 'The business says the cause is still uncertain.'}
                </p>)}
                <p className="text-sm text-muted-foreground">These statements do not decide cause, responsibility, or remedy.</p>
              </div>
            })()}
            {problem.history.length <= 1 ? null : <ol className="grid gap-1 border-l border-border pl-3">
              {problem.history.slice(1).map((update) => <li key={update.version}>
                <p className="text-sm text-muted-foreground">
                  {update.source === 'customer' ? 'You' : 'AE support'}: {update.message}
                </p>
              </li>)}
            </ol>}
            <p className="text-sm text-muted-foreground">
              Next: {problem.nextAction === 'check_status'
                ? 'check the current status'
                : problem.nextAction === 'provide_information'
                  ? 'provide the requested information'
                  : problem.nextAction === 'none'
                    ? 'no further action is requested'
                    : 'wait for the next status update'}. Reported {formatTimestamp(problem.reportedAt)}.
            </p>
            {problem.state !== 'waiting_for_customer' ? null : <ProblemReplyForm
              requestRef={requestRef}
              problem={problem}
              refresh={loadEvidence}
            />}
          </li>)}
        </ol>
      </div>}
      <p className="text-sm text-muted-foreground">Generated {formatTimestamp(evidence.generatedAt)}.</p>
    </section>}
    {evidenceError === undefined ? null : <p className="text-sm text-muted-foreground">{evidenceError}</p>}
    {reporting ? <form onSubmit={(event) => { event.preventDefault(); void reportProblem() }}>
      <FieldGroup className="grid gap-2">
        <Field>
          <FieldLabel htmlFor={`problem-category-${requestRef}`}>What kind of problem is this?</FieldLabel>
          <Select value={problemCategory} onValueChange={(value) => setProblemCategory(value as typeof problemCategory)}>
            <SelectTrigger id={`problem-category-${requestRef}`} className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="incorrect_result">The result looks wrong</SelectItem>
                <SelectItem value="unexpected_cost">The cost was unexpected</SelectItem>
                <SelectItem value="duplicate_charge_or_effect">I may have been charged or affected twice</SelectItem>
                <SelectItem value="privacy_concern">Information may have been shared incorrectly</SelectItem>
                <SelectItem value="could_not_stop">The work could not be stopped</SelectItem>
                <SelectItem value="other">Something else happened</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {evidence === undefined ? <Field><FieldDescription>Opening the activity record so you can attach this report to the right step.</FieldDescription></Field> : <>
          <Field>
            <FieldLabel htmlFor={`problem-step-${requestRef}`}>Which step is this about?</FieldLabel>
            <Select value={affectedStep === undefined ? '' : String(affectedStep)} onValueChange={(value) => {
              setAffectedStep(Number(value))
              setSelectedEvidence([])
            }}>
              <SelectTrigger id={`problem-step-${requestRef}`} className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {evidence.steps.map((step) => <SelectItem key={step.step} value={String(step.step)}>Step {step.step}: {activityStepState(step.state)}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {(evidence.steps.find((step) => step.step === affectedStep)?.evidence ?? []).length === 0 ? null : <FieldGroup className="gap-2">
            <p className="text-sm font-semibold">Attach recorded evidence</p>
            {(evidence.steps.find((step) => step.step === affectedStep)?.evidence ?? []).map((item) => <Field key={item.receiptRef} orientation="horizontal">
              <Checkbox
                id={`problem-evidence-${requestRef}-${item.receiptRef}`}
                checked={selectedEvidence.includes(item.receiptRef)}
                onCheckedChange={(checked) => setSelectedEvidence((current) => (
                  checked === true ? [...current, item.receiptRef] : current.filter((value) => value !== item.receiptRef)
                ))}
              />
              <FieldLabel htmlFor={`problem-evidence-${requestRef}-${item.receiptRef}`} className="font-normal">{item.label}</FieldLabel>
            </Field>)}
          </FieldGroup>}
        </>}
        <Field>
          <FieldLabel htmlFor={`problem-${requestRef}`}>What went wrong?</FieldLabel>
          <Textarea id={`problem-${requestRef}`} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={1_000} required className="min-h-24" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`problem-visibility-${requestRef}`}>Who can see this report?</FieldLabel>
          <Select value={visibility} onValueChange={(value) => setVisibility(value as typeof visibility)}>
            <SelectTrigger id={`problem-visibility-${requestRef}`} className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="customer_and_ae_only">Only me and AE</SelectItem>
                <SelectItem value="share_with_affected_business">AE may share it with the business for this step</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field orientation="horizontal">
          <Button type="submit" variant="secondary" disabled={evidence === undefined || affectedStep === undefined}>Send problem report</Button>
        </Field>
      </FieldGroup>
    </form> : null}
    {receipt === undefined ? null : <p className="text-sm text-muted-foreground">Problem recorded. Report reference {receipt}</p>}
    {error === undefined ? null : <p className="text-sm text-muted-foreground">{error}</p>}
  </div>
}
export function ProblemReplyForm({
  requestRef,
  problem,
  refresh,
}: {
  requestRef: string
  problem: CustomerRequestEvidenceExport['problems'][number]
  refresh: () => Promise<void>
}) {
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function reply() {
    if (message.trim().length === 0 || status === 'sending') return
    setStatus('sending')
    try {
      const response = await fetch(
        `/api/requests/${encodeURIComponent(requestRef)}/problems/${encodeURIComponent(problem.reportRef)}/replies`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: problem.version,
            idempotencyKey: `problem-reply:${problem.reportRef}:${crypto.randomUUID()}`,
            message: message.trim(),
          }),
        },
      )
      const result: unknown = await response.json()
      if (!response.ok || !isRecord(result)
        || !('kind' in result) || result.kind !== 'problem_reply_recorded') {
        setStatus('error')
        return
      }
      setMessage('')
      setStatus('sent')
      await refresh()
    } catch {
      setStatus('error')
    }
  }

  return <form className="pt-2" onSubmit={(event) => { event.preventDefault(); void reply() }}>
    <FieldGroup className="grid gap-2">
      <Field>
        <FieldLabel htmlFor={`problem-reply-${problem.reportRef}`}>Your reply</FieldLabel>
        <Textarea
          id={`problem-reply-${problem.reportRef}`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1_000}
          required
          className="min-h-20"
        />
      </Field>
      <Field orientation="horizontal">
        <Button type="submit" variant="secondary" disabled={status === 'sending'}>{status === 'sending' ? 'Sending reply…' : 'Send reply'}</Button>
      </Field>
      {status === 'sent' ? <p className="text-sm text-muted-foreground">Reply recorded. AE owns the next status update.</p> : null}
      {status === 'error' ? <p className="text-sm text-muted-foreground">AE could not record your reply. The report is unchanged.</p> : null}
    </FieldGroup>
  </form>
}
function activityRecordSummary(state: CustomerRequestEvidenceExport['state']): string {
  if (state === 'completed') return 'AE recorded a completed result and the supporting step receipts.'
  if (state === 'outcome_unknown') return 'Some work is recorded, but AE is still confirming a later result and will not repeat it automatically.'
  if (state === 'failed') return 'AE recorded where the work stopped and any completed steps remain preserved.'
  if (state === 'cancelled') return 'AE recorded where the Request stopped.'
  return 'AE is recording progress as the work continues.'
}
function activityStepState(state: CustomerRequestEvidenceExport['steps'][number]['state']): string {
  if (state === 'outcome_unknown') return 'still being confirmed'
  if (state === 'awaiting_result') return 'waiting for a result'
  if (state === 'ready_to_contact') return 'preparing business contact'
  if (state === 'contacting') return 'contacting the business'
  return state.replaceAll('_', ' ')
}
