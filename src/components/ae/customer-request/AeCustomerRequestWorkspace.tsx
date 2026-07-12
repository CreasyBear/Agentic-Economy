import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'

import type { CustomerRequestProjection, CustomerRequestView } from '@/modules/customer-request/customer-projection'

type SubmitResponse = CustomerRequestProjection | Readonly<{ kind: 'refused'; reason: string }> | Readonly<{ error: string }>
type WorkspaceState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'submitting' }>
  | Readonly<{ kind: 'request'; projection: CustomerRequestView }>
  | Readonly<{ kind: 'comparing'; projection: CustomerRequestView }>
  | Readonly<{ kind: 'error'; message: string; authenticationRequired: boolean }>

export function AeCustomerRequestWorkspace() {
  const [need, setNeed] = useState('')
  const [location, setLocation] = useState('Perth, WA')
  const [budget, setBudget] = useState('40.00')
  const [state, setState] = useState<WorkspaceState>({ kind: 'idle' })
  const [requestIdentity, setRequestIdentity] = useState<Readonly<{ requestRef: string; agentRef: string }> | undefined>()

  async function submit() {
    if (need.trim().length === 0 || state.kind === 'submitting' || state.kind === 'comparing') return
    const identity = requestIdentity ?? { requestRef: `request:${crypto.randomUUID()}`, agentRef: `web:${crypto.randomUUID()}` }
    setRequestIdentity(identity)
    setState({ kind: 'submitting' })
    try {
      const response = await fetch('/api/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `submit:${identity.requestRef}`, requestRef: identity.requestRef, agentRef: identity.agentRef,
          request: [need.trim(), location.trim() === '' ? '' : `Location: ${location.trim()}.`].filter(Boolean).join(' '),
          knownFacts: location.trim() === '' ? {} : { location: location.trim() },
          routing: { network: 'ae:public', currency: 'AUD', maximumSpendMinor: maximumSpendMinor(budget), optimizeFor: 'cost' },
        }),
      })
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        setState(errorState(response.status, 'AE could not start this request.'))
        return
      }
      setState({ kind: 'request', projection: result })
    } catch {
      setState({ kind: 'error', message: 'AE could not be reached. Your request was not submitted.', authenticationRequired: false })
    }
  }

  async function compare(projection: CustomerRequestView) {
    setState({ kind: 'comparing', projection })
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(projection.requestRef)}/options`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: projection.revision }),
      })
      const result: CustomerRequestView | Readonly<{ error: string }> = await response.json()
      if ('kind' in result && result.kind === 'request') setState({ kind: 'request', projection: result })
      else setState(errorState(response.status, 'AE could not prepare comparable options for this request.'))
    } catch {
      setState({ kind: 'error', message: 'AE could not be reached. No option was selected or purchased.', authenticationRequired: false })
    }
  }

  return (
    <main className="mx-auto grid min-w-0 w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:py-16">
      <header className="grid max-w-3xl gap-3">
        <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">What do you need?</Heading>
        <Text type="large" color="secondary">Describe the result you want. AE will tell you what it can compare from connected businesses.</Text>
      </header>

      <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]" aria-label="Customer request">
        <Card padding={5} className="min-w-0">
          <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <Heading level={2} className="text-xl font-semibold">Your request</Heading>
            <label className="grid gap-2 text-sm font-medium">What needs doing?
              <textarea value={need} onChange={(event) => setNeed(event.target.value)} rows={6} maxLength={2_000} required disabled={state.kind === 'submitting' || state.kind === 'comparing'} placeholder="For example: compare local printers for 200 cards by Friday." className="min-h-36 rounded-md border border-border bg-card px-3 py-3 text-primary shadow-low outline-none focus:border-accent focus:ring-2 focus:ring-accent disabled:cursor-wait disabled:opacity-60" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Where" value={location} onChange={setLocation} placeholder="Suburb, city, or online" disabled={state.kind === 'submitting' || state.kind === 'comparing'} />
              <Field label="Maximum spend (AUD)" value={budget} onChange={setBudget} placeholder="Optional" inputMode="decimal" disabled={state.kind === 'submitting' || state.kind === 'comparing'} />
            </div>
            <button type="submit" disabled={need.trim().length === 0 || state.kind === 'submitting' || state.kind === 'comparing'} className="min-h-11 rounded-md border border-accent bg-accent px-4 font-semibold text-on-accent outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
              {state.kind === 'submitting' ? 'Understanding your request…' : 'Start request'}
            </button>
          </form>
        </Card>

        <RequestResult state={state} compare={compare} />
      </section>
    </main>
  )
}

function RequestResult({ state, compare }: { state: WorkspaceState; compare: (projection: CustomerRequestView) => Promise<void> }) {
  if (state.kind === 'error') return <Card padding={5} className="min-w-0" aria-live="polite"><div className="grid gap-4"><Heading level={2}>Request unavailable</Heading><Text color="secondary">{state.message}</Text>{state.authenticationRequired ? <Button label="Sign in to continue" href="/sign-in" variant="primary" /> : null}</div></Card>
  if (state.kind === 'request' && state.projection.state === 'options_ready') return <OptionsCard projection={state.projection} />
  if (state.kind === 'request') return <Card padding={5} className="min-w-0" aria-live="polite"><div className="grid gap-4"><Text className="text-sm font-medium text-accent">{statusLabel(state.projection.state)}</Text><Heading level={2}>{state.projection.summary}</Heading>{state.projection.missingFields.map((field) => <Text key={field.field} color="secondary"><strong>{field.label}:</strong> {field.explanation}</Text>)}{state.projection.nextAction === 'prepare_options' ? <Button label="Compare available options" variant="primary" clickAction={() => void compare(state.projection)} /> : state.projection.state === 'preparing_options' ? <Button label="Check again" variant="secondary" clickAction={() => void compare(state.projection)} /> : <Text color="secondary">Change the request or add the information shown here, then continue.</Text>}</div></Card>
  if (state.kind === 'submitting' || state.kind === 'comparing') return <Card padding={5} className="min-w-0" aria-live="polite" aria-busy="true"><Heading level={2}>{state.kind === 'submitting' ? 'Understanding your request…' : 'Comparing available options…'}</Heading><Text color="secondary" className="mt-2">No purchase or booking occurs during this step.</Text></Card>
  return <Card padding={5} className="min-w-0 bg-surface"><Heading level={2}>Your result will appear here</Heading><Text color="secondary" className="mt-2">AE will show missing information, unsupported requests, or comparable business options.</Text></Card>
}

function OptionsCard({ projection }: { projection: CustomerRequestView }) {
  return <Card padding={5} className="min-w-0" aria-live="polite"><div className="grid gap-5"><div><Text className="text-sm font-medium text-accent">Available options</Text><Heading level={2} className="mt-2">Compare before deciding</Heading></div>{projection.options.length === 0 ? <Text color="secondary">No comparable options were returned.</Text> : projection.options.map((candidate) => <article key={candidate.optionRef} className="grid gap-2 border-t border-border pt-4"><Heading level={3}>{candidate.business.name}</Heading><Text>{formatMoney(candidate.expectedCost.currency, candidate.expectedCost.amountMinor)}</Text>{candidate.comparableOutputs.map((output) => <Text key={output.label} color="secondary">{output.label}: {String(output.value)}</Text>)}{candidate.materialTerms.map((term) => <Text key={term} color="secondary">{term}</Text>)}</article>)}<Text color="secondary">These are sandbox or registered provider responses. AE has not purchased, booked, or selected anything.</Text></div></Card>
}

function Field({ label, value, onChange, placeholder, inputMode, disabled }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: 'decimal'; disabled: boolean }) {
  return <label className="grid gap-2 text-sm font-medium">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} disabled={disabled} className="min-h-11 rounded-md border border-border bg-card px-3 text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent disabled:cursor-wait disabled:opacity-60" /></label>
}

function maximumSpendMinor(value: string): number { return Math.max(0, Math.round((Number.parseFloat(value) || 0) * 100)) }
function statusLabel(state: CustomerRequestView['state']): string {
  if (state === 'ready_to_compare') return 'Ready to compare'
  if (state === 'needs_information') return 'More information needed'
  if (state === 'preparing_options') return 'Checking connected businesses'
  if (state === 'needs_attention') return 'Needs attention'
  return state === 'options_ready' ? 'Available options' : 'Not supported yet'
}
function formatMoney(currency: string, amountMinor: number): string { return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amountMinor / 100) }
function errorState(status: number, message: string): WorkspaceState { return { kind: 'error', message: status === 401 ? 'Sign in so AE can keep this request private and resumable.' : message, authenticationRequired: status === 401 } }
