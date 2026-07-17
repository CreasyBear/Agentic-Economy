import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading, Text } from '@astryxdesign/core/Text'
import {
  customerRequestEvidenceResultSchema,
  type CustomerRequestEvidenceExport,
} from '@/modules/customer-request/agent-contract'
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
      if (!response.ok || typeof result !== 'object' || result === null
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

  return <div className="grid gap-3 border-t border-border pt-4">
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" className="min-h-11 text-sm font-semibold underline underline-offset-4" onClick={() => void inspectEvidence()}>
        {evidenceLoading ? 'Opening activity record…' : evidence === undefined ? 'View activity record' : 'Hide activity record'}
      </button>
      <button type="button" className="min-h-11 text-sm font-semibold underline underline-offset-4" onClick={() => {
        setReporting((current) => !current)
        if (evidence === undefined) void inspectEvidence()
      }}>Report a problem</button>
    </div>
    {evidence === undefined ? null : <section className="grid gap-3 rounded-md border border-border bg-surface p-4" aria-live="polite">
      <Heading level={3}>Activity record</Heading>
      <Text color="secondary">{activityRecordSummary(evidence.state)}</Text>
      <ol className="grid gap-3">
        {evidence.steps.map((step) => <li key={step.step} className="grid gap-1 border-l-2 border-accent pl-3">
          <Text weight="semibold">Step {step.step} {activityStepState(step.state)}</Text>
          {step.evidence.length === 0
            ? <Text type="supporting" color="secondary">No receipt has been recorded for this step yet.</Text>
            : step.evidence.map((item) => <Text key={item.receiptRef} type="supporting" color="secondary">{item.label}</Text>)}
        </li>)}
      </ol>
      {evidence.result === undefined ? null : <div className="grid gap-1">
        <Text weight="semibold">{isPartialResult(evidence.result) ? 'Recorded partial result' : 'Recorded result'}</Text>
        <Text color="secondary">{readableResult(evidence.result)}</Text>
        {isPartialResult(evidence.result) ? <Text type="supporting" color="secondary">
          This evidence does not confirm completion.
        </Text> : null}
      </div>}
      {evidence.problems.length === 0 ? null : <div className="grid gap-2">
        <Text weight="semibold">Reported problems</Text>
        <ol className="grid gap-3">
          {evidence.problems.map((problem) => <li key={problem.reportRef} className="grid gap-1 border-l-2 border-border pl-3">
            <Text weight="semibold">Step {problem.affected.step}: {problem.state === 'update_due' ? 'status update due' : 'report received'}</Text>
            <Text color="secondary">{problem.summary}</Text>
            {problem.affected.business === undefined ? null
              : <Text type="supporting" color="secondary">This report is attached to the step involving {problem.affected.business}.</Text>}
            <Text type="supporting" color="secondary">
              This is your report. AE has not decided what caused the problem, who is responsible, or whether a remedy is due.
            </Text>
            <Text type="supporting" color="secondary">
              {problem.nextActor === 'customer'
                ? 'AE needs more information from you before it can continue checking this report.'
                : problem.nextActor === 'none'
                  ? 'This record is closed without deciding cause, responsibility, or remedy.'
                  : problem.state === 'update_due' && problem.nextUpdateDueAt !== undefined
                    ? `AE’s status update was due ${new Date(problem.nextUpdateDueAt).toLocaleString()}. No reviewer or remedy authority has been assigned.`
                    : problem.nextUpdateDueAt === undefined
                      ? 'AE owns the next status update. No reviewer or remedy authority has been assigned.'
                      : `AE owns the next status update, due ${new Date(problem.nextUpdateDueAt).toLocaleString()}. No reviewer or remedy authority has been assigned.`}
            </Text>
            <Text type="supporting" color="secondary">
              {problem.visibility === 'customer_and_ae_only'
                ? 'Visible only to you and AE.'
                : 'AE may share this report with the business for this step.'}
            </Text>
            {problem.evidence.length === 0 ? null
              : <Text type="supporting" color="secondary">{problem.evidence.length} recorded evidence item{problem.evidence.length === 1 ? '' : 's'} attached.</Text>}
            {(() => {
              const businessClaims = []
              for (const claim of problem.claims) {
                if (claim.claimSource === 'business') businessClaims.push(claim)
              }
              return businessClaims.length === 0 ? null : <div className="grid gap-1">
                <Text type="supporting" weight="semibold">Business statements</Text>
                {businessClaims.map((claim) => <Text
                  key={`${claim.business ?? 'business'}:${claim.recordedAt}`}
                  type="supporting"
                  color="secondary"
                >
                  {claim.business ?? 'The business'}: {claim.statement}{' '}
                  {claim.causalityPosition === 'supports'
                    ? 'The business says this supports your report.'
                    : claim.causalityPosition === 'disputes'
                      ? 'The business disputes the reported cause.'
                      : 'The business says the cause is still uncertain.'}
                </Text>)}
                <Text type="supporting" color="secondary">These statements do not decide cause, responsibility, or remedy.</Text>
              </div>
            })()}
            {problem.history.length <= 1 ? null : <ol className="grid gap-1 border-l border-border pl-3">
              {problem.history.slice(1).map((update) => <li key={update.version}>
                <Text type="supporting" color="secondary">
                  {update.source === 'customer' ? 'You' : 'AE support'}: {update.message}
                </Text>
              </li>)}
            </ol>}
            <Text type="supporting" color="secondary">
              Next: {problem.nextAction === 'check_status'
                ? 'check the current status'
                : problem.nextAction === 'provide_information'
                  ? 'provide the requested information'
                  : problem.nextAction === 'none'
                    ? 'no further action is requested'
                    : 'wait for the next status update'}. Reported {new Date(problem.reportedAt).toLocaleString()}.
            </Text>
            {problem.state !== 'waiting_for_customer' ? null : <ProblemReplyForm
              requestRef={requestRef}
              problem={problem}
              refresh={loadEvidence}
            />}
          </li>)}
        </ol>
      </div>}
      <Text type="supporting" color="secondary">Generated {new Date(evidence.generatedAt).toLocaleString()}.</Text>
    </section>}
    {evidenceError === undefined ? null : <Text type="supporting" color="secondary">{evidenceError}</Text>}
    {reporting ? <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void reportProblem() }}>
      <label htmlFor={`problem-category-${requestRef}`} className="text-sm font-semibold">What kind of problem is this?</label>
      <select id={`problem-category-${requestRef}`} value={problemCategory} onChange={(event) => setProblemCategory(event.target.value as typeof problemCategory)} className="min-h-11 rounded-md border border-border bg-card px-3">
        <option value="incorrect_result">The result looks wrong</option>
        <option value="unexpected_cost">The cost was unexpected</option>
        <option value="duplicate_charge_or_effect">I may have been charged or affected twice</option>
        <option value="privacy_concern">Information may have been shared incorrectly</option>
        <option value="could_not_stop">The work could not be stopped</option>
        <option value="other">Something else happened</option>
      </select>
      {evidence === undefined ? <Text type="supporting" color="secondary">Opening the activity record so you can attach this report to the right step.</Text> : <>
        <label htmlFor={`problem-step-${requestRef}`} className="text-sm font-semibold">Which step is this about?</label>
        <select id={`problem-step-${requestRef}`} value={affectedStep ?? ''} onChange={(event) => {
          setAffectedStep(Number(event.target.value))
          setSelectedEvidence([])
        }} className="min-h-11 rounded-md border border-border bg-card px-3">
          {evidence.steps.map((step) => <option key={step.step} value={step.step}>Step {step.step}: {activityStepState(step.state)}</option>)}
        </select>
        {(evidence.steps.find((step) => step.step === affectedStep)?.evidence ?? []).length === 0 ? null : <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Attach recorded evidence</legend>
          {(evidence.steps.find((step) => step.step === affectedStep)?.evidence ?? []).map((item) => <label key={item.receiptRef} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={selectedEvidence.includes(item.receiptRef)} onChange={(event) => setSelectedEvidence((current) => (
              event.target.checked ? [...current, item.receiptRef] : current.filter((value) => value !== item.receiptRef)
            ))} />
            {item.label}
          </label>)}
        </fieldset>}
      </>}
      <label htmlFor={`problem-${requestRef}`} className="text-sm font-semibold">What went wrong?</label>
      <textarea id={`problem-${requestRef}`} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={1_000} required className="min-h-24 rounded-md border border-border bg-card p-3 outline-none focus:ring-2 focus:ring-accent" />
      <label htmlFor={`problem-visibility-${requestRef}`} className="text-sm font-semibold">Who can see this report?</label>
      <select id={`problem-visibility-${requestRef}`} value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)} className="min-h-11 rounded-md border border-border bg-card px-3">
        <option value="customer_and_ae_only">Only me and AE</option>
        <option value="share_with_affected_business">AE may share it with the business for this step</option>
      </select>
      <Button label="Send problem report" variant="secondary" type="submit" isDisabled={evidence === undefined || affectedStep === undefined} />
    </form> : null}
    {receipt === undefined ? null : <Text type="supporting" color="secondary">Problem recorded. Report reference {receipt}</Text>}
    {error === undefined ? null : <Text type="supporting" color="secondary">{error}</Text>}
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
      if (!response.ok || typeof result !== 'object' || result === null
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

  return <form className="grid gap-2 pt-2" onSubmit={(event) => { event.preventDefault(); void reply() }}>
    <label htmlFor={`problem-reply-${problem.reportRef}`} className="text-sm font-semibold">Your reply</label>
    <textarea
      id={`problem-reply-${problem.reportRef}`}
      value={message}
      onChange={(event) => setMessage(event.target.value)}
      maxLength={1_000}
      required
      className="min-h-20 rounded-md border border-border bg-card p-3 outline-none focus:ring-2 focus:ring-accent"
    />
    <Button label={status === 'sending' ? 'Sending reply…' : 'Send reply'} variant="secondary" type="submit" isDisabled={status === 'sending'} />
    {status === 'sent' ? <Text type="supporting" color="secondary">Reply recorded. AE owns the next status update.</Text> : null}
    {status === 'error' ? <Text type="supporting" color="secondary">AE could not record your reply. The report is unchanged.</Text> : null}
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
