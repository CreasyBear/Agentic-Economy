import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from '../actions/AdminActionSheet'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { COMMERCIAL_POLICY_FAMILIES, type CommercialPolicyEnvironment, type CommercialPolicyFamily } from '@/modules/money/public'
import { createPrefixedRandomId } from '@/modules/common/random-id'
import { buildPolicyInput, fieldsFromCurrent, POLICY_LABELS, proposedProductionPolicyFields, type PolicyFields, type PolicyInput, type PolicyPreparation } from './commercial-policy-form'
import { CommercialPolicyControlReview } from './CommercialPolicyReview'
import { CommercialPolicyTable } from './CommercialPolicyTable'

type Draft = { preparation: PolicyPreparation; fields: PolicyFields }
type Review = { input: PolicyInput; stateDigest?: string; requiresSecondApproval: boolean }
const selectClass = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Query state never writes draft state. Edit and review events capture the exact preparation and terms. */
export function CommercialPolicyActions({ environment }: { environment: CommercialPolicyEnvironment }) {
  const [refreshAt, setRefreshAt] = useState(() => Date.now())
  const editorHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const timer = window.setInterval(() => setRefreshAt(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const [family, setFamily] = useState<CommercialPolicyFamily>('commercial_perimeter')
  const preparation = useQuery(api.moneyCommercialPolicy.prepareChange, { environment, family })
  const summary = useQuery(api.moneyCommercialPolicy.readSummary,
    environment === 'production' ? { environment, refreshAt } : 'skip')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ready = preparation?.kind === 'ready' ? preparation : null
  const current = ready?.current ?? null
  function beginEdit(copyCurrent: boolean) {
    if (ready === null || ready.conflict) return
    setDraft({ preparation: ready, fields: copyCurrent && ready.current !== null
      ? fieldsFromCurrent(ready.current) : proposedProductionPolicyFields(family, Date.now()) })
    setError(null)
  }
  function change<K extends keyof PolicyFields>(key: K, value: PolicyFields[K]) {
    setDraft(previous => previous === null ? null : { ...previous, fields: { ...previous.fields, [key]: value } })
    setError(null)
  }
  function reviewDraft() {
    if (draft === null) return
    const result = buildPolicyInput(draft.preparation, draft.fields, createPrefixedRandomId('commercial-policy:'))
    if (result.kind === 'invalid') { setError(result.message); return }
    const active = draft.preparation.current?.lifecycle === 'active' ? draft.preparation.current : null
    setReview({ input: Object.freeze({ ...result.input, control: Object.freeze(result.input.control) }), ...(active === null ? {} : { stateDigest: active.stateDigest }), requiresSecondApproval: draft.preparation.requiresSecondApproval })
  }
  function suspend() {
    if (ready === null || current?.lifecycle !== 'active' || ready.conflict) return
    setReview({ input: Object.freeze({ changeKind: 'suspend', family, environment, policyRef: current.policyRef, expectedCurrentPolicyRef: current.policyRef, revision: current.revision, effectiveAt: current.effectiveAt, expiresAt: current.expiresAt, control: current.control }), stateDigest: current.stateDigest, requiresSecondApproval: ready.requiresSecondApproval })
  }
  if (environment !== 'production') return <AeSection title="Commercial policy" description="Sandbox uses the declared deterministic policy fixture. Production terms are managed in the production environment." />
  return <AeSection title="Commercial policy" description="An Admin owner approves one policy family at a time, with supporting evidence and a validity period.">
    {summary === undefined ? <p role="status">Loading approval records…</p>
      : summary.kind === 'refused' ? <Alert role="alert" variant="destructive"><AlertDescription>Approval records are unavailable: {summary.code}. Review Audit or retry.</AlertDescription></Alert>
        : <CommercialPolicyTable summary={summary} selectedFamily={family} locked={draft !== null || review !== null} onSelect={selected => {
          setFamily(selected)
          setError(null)
          window.requestAnimationFrame(() => {
            editorHeading.current?.scrollIntoView({ block: 'start' })
            editorHeading.current?.focus({ preventScroll: true })
          })
        }} />}
    <div className="grid gap-related rounded-lg border border-border p-gutter">
      <h3 ref={editorHeading} tabIndex={-1} className="font-medium">Prepare {POLICY_LABELS[family]} policy</h3>
      <div className="grid gap-intra"><Label htmlFor="commercial-policy-family">Policy family</Label>
        <select id="commercial-policy-family" className={selectClass} value={family} disabled={draft !== null || review !== null} onChange={event => {
          const value = COMMERCIAL_POLICY_FAMILIES.find(item => item === event.target.value)
          if (value !== undefined) { setFamily(value); setError(null) }
        }}>{COMMERCIAL_POLICY_FAMILIES.map(value => <option key={value} value={value}>{POLICY_LABELS[value]}</option>)}</select>
      </div>
      {preparation === undefined ? <p role="status">Loading current policy…</p> : ready === null ? <Alert role="status"><AlertDescription>Policy preparation requires an Admin owner in the declared payment environment.</AlertDescription></Alert> : <>
        <p className="text-sm">Environment: {ready.environment}. {ready.requiresSecondApproval ? 'A different Admin owner must approve this change.' : 'An Admin owner can approve this change.'}</p>
        {ready.conflict ? <Alert role="alert" variant="destructive"><AlertDescription>Multiple active policies conflict. Changes are unavailable until the conflict is resolved.</AlertDescription></Alert> : null}
        {current === null ? <p>No approved policy is recorded for this family.</p> : <details><summary className="cursor-pointer">Recorded policy: {current.lifecycle}, revision {current.revision}</summary>
          <div className="mt-3 grid gap-related"><p className="break-all text-sm">{current.policyRef}</p><p className="text-sm">Effective {formatPerthTimestamp(current.effectiveAt)} · expires {formatPerthTimestamp(current.expiresAt)} Perth time</p><CommercialPolicyControlReview control={current.control} /><p className="break-all text-sm">Evidence: {current.evidenceRef}</p><p className="break-all text-sm">Approved by: {current.approvedByPrincipalRef}</p></div>
        </details>}
        {draft === null ? <div className="flex flex-wrap gap-intra"><Button type="button" disabled={ready.conflict || review !== null} onClick={() => beginEdit(current?.lifecycle === 'active')}>{current?.lifecycle === 'active' ? 'Replace active policy' : 'Prepare new policy'}</Button>{current?.lifecycle === 'active' ? <Button type="button" variant="outline" disabled={ready.conflict || review !== null} onClick={suspend}>Suspend active policy</Button> : null}</div> : null}
      </>}
      {draft === null ? null : <form className="grid gap-related" onSubmit={event => { event.preventDefault(); reviewDraft() }}>
        <fieldset disabled={review !== null} className="grid gap-related">
          <legend className="mb-3 font-medium">{POLICY_LABELS[draft.preparation.family]} terms</legend>
          {ready !== null && (ready.current?.stateDigest ?? null) !== (draft.preparation.current?.stateDigest ?? null) ? <p role="status">The recorded policy changed while you were editing. This draft retains its original version; cancel and prepare again to use the latest record.</p> : null}
          <PolicyBusinessFields family={draft.preparation.family} fields={draft.fields} change={change} />
          <div className="grid gap-related sm:grid-cols-2">
            <TextField name="effectiveAt" label="Effective date and time" type="datetime-local" value={draft.fields.effectiveAt} onChange={value => change('effectiveAt', value)} />
            <TextField name="expiresAt" label="Expiry date and time" type="datetime-local" value={draft.fields.expiresAt} onChange={value => change('expiresAt', value)} />
          </div><p className="text-xs text-muted-foreground">Enter dates in your browser’s local time. Final review shows Perth time.</p>
          {family === 'operations' || family === 'treasury_custody' ? <details><summary className="cursor-pointer text-sm">Server technical requirements (read only)</summary><dl className="mt-2 grid gap-intra text-sm">{Object.entries(draft.preparation.requirements).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="break-all">{value}</dd></div>)}</dl><p className="mt-2 text-sm">These required versions do not prove operational readiness.</p></details> : null}
          <p className="text-xs text-muted-foreground">Suggested amounts and recovery times are editable targets. Confirm operational controls only with actual evidence.</p>
          {error === null ? null : <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="flex gap-intra"><Button type="submit">Review policy</Button><Button type="button" variant="outline" onClick={() => { setDraft(null); setError(null) }}>Cancel editing</Button></div>
        </fieldset>
      </form>}
    </div>
    {review === null ? null : <AdminActionSheet action="change_commercial_policy" input={review.input} open
      onOpenChange={open => { if (!open) setReview(null) }}
      approval={{ kind: review.requiresSecondApproval ? 'propose' : 'execute' }}
      {...(review.stateDigest === undefined ? {} : { currentStateDigest: review.stateDigest })}
      targetRefs={[]} />}
  </AeSection>
}
function TextField({ name, label, value, onChange, type = 'text', hint }: { name: string; label: string; value: string; onChange: (value: string) => void; type?: 'text' | 'datetime-local'; hint?: string }) {
  return <div className="grid gap-intra"><Label htmlFor={`policy-${name}`}>{label}</Label><Input id={`policy-${name}`} value={value} onChange={event => onChange(event.target.value)} type={type} inputMode={type === 'text' ? 'decimal' : undefined} autoComplete="off" {...(hint === undefined ? {} : { 'aria-describedby': `policy-${name}-hint` })} />{hint === undefined ? null : <p id={`policy-${name}-hint`} className="text-xs text-muted-foreground">{hint}</p>}</div>
}
function PolicyBusinessFields({ family, fields, change }: { family: CommercialPolicyFamily; fields: PolicyFields; change: <K extends keyof PolicyFields>(key: K, value: PolicyFields[K]) => void }) {
  const text = (name: keyof Pick<PolicyFields, 'serviceFeeTax' | 'callTax' | 'minimumFunding' | 'maximumFunding' | 'fundingIncrement' | 'customerMaximum' | 'retentionDays' | 'minimumBuffer' | 'rpoMinutes' | 'rtoMinutes' | 'serviceFee' | 'pricingMargin' | 'commitmentSeconds' | 'reportsPerDay'>, label: string, hint?: string) => <TextField name={name} label={label} value={fields[name]} onChange={value => change(name, value)} {...(hint === undefined ? {} : { hint })} />
  const confirm = (name: keyof Pick<PolicyFields, 'perimeterConfirmed' | 'legalHoldConfirmed' | 'custodyConfirmed' | 'backupConfirmed' | 'restoreConfirmed' | 'dailyCloseConfirmed'>, label: string) => <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4" checked={fields[name]} onChange={event => change(name, event.target.checked)} /><span>{label}</span></label>
  switch (family) {
    case 'commercial_perimeter': return confirm('perimeterConfirmed', 'I confirm Agentic Economy is the principal reseller, Customers are businesses only, and Customers have no crypto entitlement, with supporting evidence.')
    case 'tax': return <>{text('serviceFeeTax', 'Tax on credit funding (%)', 'Applies to the funded amount plus service fee.')}<p className="text-sm">Tax on Calls: 0% (fixed; Call tax is not priced by the current implementation).</p><div className="grid gap-intra"><Label htmlFor="policy-invoice">Tax invoice issuance</Label><select id="policy-invoice" value={fields.invoiceIssuance} onChange={event => change('invoiceIssuance', event.target.value)} className={selectClass}><option value="">Choose a status</option><option value="disabled_pending_approval">Disabled pending approval</option><option value="enabled">Enabled</option></select></div></>
    case 'accounting_client_money': return <>{text('minimumFunding', 'Minimum funding (AUD)')}{text('maximumFunding', 'Maximum funding (AUD)')}{text('fundingIncrement', 'Funding increment (AUD)')}{text('customerMaximum', 'Customer accessible limit (AUD)')}<p className="text-sm">Customer balances are classified as customer contract liabilities. Minimum funding must be a multiple of the increment.</p></>
    case 'privacy_retention': return <>{text('retentionDays', 'Evidence retention (days)')}{confirm('legalHoldConfirmed', 'I confirm legal holds are supported, with supporting evidence.')}</>
    case 'treasury_custody': return <>{text('minimumBuffer', 'Minimum treasury buffer (USDC)', 'The current custody maximum must be at least this floor. Raise the custody configuration before approving a higher floor.')}{text('rpoMinutes', 'Recovery point objective (minutes)', 'Whole minutes, from 1 to 5.')}{text('rtoMinutes', 'Recovery time objective (minutes)', 'Whole minutes, from 1 to 60.')}{confirm('custodyConfirmed', 'I confirm this is a real-money deployment with managed PostgreSQL point-in-time recovery, supported by actual evidence.')}</>
    case 'operations': return <>{text('serviceFee', 'Funding service fee (%)')}<p className="text-sm">Buyer pricing margin: 0% (fixed; no additional margin is added to current prices).</p>{text('commitmentSeconds', 'Commitment lifetime (seconds)', 'Whole seconds, from 10 to 900.')}{text('reportsPerDay', 'Paid Call reports per day', 'Optional: blank uses the existing default of 3. Enter 0 to 20 to set it explicitly.')}{confirm('backupConfirmed', 'I confirm PostgreSQL point-in-time recovery is configured, with actual backup evidence.')}{confirm('restoreConfirmed', 'I confirm a production restore was rehearsed, with the completed rehearsal evidence.')}{confirm('dailyCloseConfirmed', 'I confirm daily close is human signed, with signed evidence.')}</>
  }
}
