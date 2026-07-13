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
type ConversationTurn = Readonly<{ speaker: 'customer' | 'ae'; text: string }>

export function AeCustomerRequestWorkspace() {
  const [need, setNeed] = useState('')
  const [answer, setAnswer] = useState('')
  const [state, setState] = useState<WorkspaceState>({ kind: 'idle' })
  const [turns, setTurns] = useState<readonly ConversationTurn[]>([])
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
          request: need.trim(), knownFacts: {}, routing: { network: 'ae:public' },
        }),
      })
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        setState(errorState(response.status, 'AE could not start this request.'))
        return
      }
      setTurns([
        { speaker: 'customer', text: need.trim() },
        ...(result.clarification?.prompt ? [{ speaker: 'ae' as const, text: result.clarification.prompt }] : []),
      ])
      setState({ kind: 'request', projection: result })
    } catch {
      setState({ kind: 'error', message: 'AE could not be reached. Your request was not submitted.', authenticationRequired: false })
    }
  }

  async function continueRequest(projection: CustomerRequestView) {
    const clarification = projection.clarification
    const message = answer.trim()
    if (clarification === undefined || message.length === 0) return
    setState({ kind: 'submitting' })
    setTurns((current) => [...current, { speaker: 'customer', text: message }])
    setAnswer('')
    try {
      const isNaturalLanguage = clarification.answerKind === 'natural_language'
      const response = await fetch(
        `/api/requests/${encodeURIComponent(projection.requestRef)}/${isNaturalLanguage ? 'messages' : 'facts'}`,
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: `clarify:${projection.requestRef}:${projection.revision}:${crypto.randomUUID()}`,
            expectedRevision: projection.revision,
            ...(isNaturalLanguage ? { message } : { facts: { [clarification.field]: message } }),
          }),
        },
      )
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        setState(errorState(response.status, 'AE could not add that answer to this request.'))
        return
      }
      if (result.clarification?.prompt) setTurns((current) => [...current, { speaker: 'ae', text: result.clarification?.prompt ?? '' }])
      setState({ kind: 'request', projection: result })
    } catch {
      setState({ kind: 'error', message: 'AE could not be reached. Your existing request is unchanged.', authenticationRequired: false })
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
    <main className="mx-auto grid min-w-0 w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <header className="mx-auto grid max-w-3xl gap-3 text-center">
        <Text className="text-sm font-semibold text-accent">Ask AE</Text>
        <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">Start with whatever you know.</Heading>
        <Text type="large" color="secondary">A place, a business type, or the situation itself. AE helps you work out the next decision.</Text>
      </header>

      {state.kind === 'idle' || state.kind === 'error' ? <section className="mx-auto grid w-full max-w-3xl gap-3" aria-label="Start a request">
        <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-low sm:flex-row">
          <label className="sr-only" htmlFor="customer-need">What are you looking for?</label>
          <textarea id="customer-need" value={need} onChange={(event) => setNeed(event.target.value)} rows={2} maxLength={2_000} required placeholder="Try a place, business type, or need" className="min-h-16 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-lg text-primary outline-none focus:ring-2 focus:ring-accent" />
          <button type="submit" disabled={need.trim().length === 0} className="min-h-11 self-end rounded-md bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">Explore</button>
        </form>
        <Text type="supporting" color="secondary" className="text-center">No budget or full specification required to start.</Text>
        {state.kind === 'error' ? <RequestResult state={state} compare={compare} continueRequest={continueRequest} answer={answer} setAnswer={setAnswer} turns={turns} /> : <StartExamples />}
      </section> : <RequestResult state={state} compare={compare} continueRequest={continueRequest} answer={answer} setAnswer={setAnswer} turns={turns} />}
    </main>
  )
}

function RequestResult({ state, compare, continueRequest, answer, setAnswer, turns }: { state: WorkspaceState; compare: (projection: CustomerRequestView) => Promise<void>; continueRequest: (projection: CustomerRequestView) => Promise<void>; answer: string; setAnswer: (answer: string) => void; turns: readonly ConversationTurn[] }) {
  if (state.kind === 'error') return <Card padding={5} className="min-w-0" aria-live="polite"><div className="grid gap-4"><Heading level={2}>Request unavailable</Heading><Text color="secondary">{state.message}</Text>{state.authenticationRequired ? <Button label="Sign in to continue" href="/sign-in" variant="primary" /> : null}</div></Card>
  if (state.kind === 'request' && state.projection.state === 'options_ready') return <OptionsCard projection={state.projection} turns={turns} />
  if (state.kind === 'request' && state.projection.state === 'no_options') return <NoOptions projection={state.projection} turns={turns} />
  if (state.kind === 'request') return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} />{state.projection.clarification ? <Clarification projection={state.projection} answer={answer} setAnswer={setAnswer} submit={() => void continueRequest(state.projection)} /> : <Card padding={5}><div className="grid gap-4"><Text className="text-sm font-medium text-accent">{statusLabel(state.projection.state)}</Text><Heading level={2}>{state.projection.summary}</Heading>{state.projection.nextAction === 'prepare_options' ? <Button label="Show available options" variant="primary" clickAction={() => void compare(state.projection)} /> : state.projection.state === 'preparing_options' ? <Button label="Check again" variant="secondary" clickAction={() => void compare(state.projection)} /> : <Text color="secondary">AE cannot prepare a supported decision from the registered businesses for this request yet.</Text>}</div></Card>}</section>
  if (state.kind === 'submitting' || state.kind === 'comparing') return <Card padding={5} className="min-w-0" aria-live="polite" aria-busy="true"><Heading level={2}>{state.kind === 'submitting' ? 'Understanding your request…' : 'Comparing available options…'}</Heading><Text color="secondary" className="mt-2">No purchase or booking occurs during this step.</Text></Card>
  return <Card padding={5} className="min-w-0 bg-surface"><Heading level={2}>Your result will appear here</Heading><Text color="secondary" className="mt-2">AE will show missing information, unsupported requests, or comparable business options.</Text></Card>
}

function OptionsCard({ projection, turns }: { projection: CustomerRequestView; turns: readonly ConversationTurn[] }) {
  return <section className="grid gap-6" aria-live="polite"><Conversation turns={turns} /><div className="grid gap-2"><Text className="text-sm font-semibold text-accent">Available options</Text><Heading level={2} className="text-3xl">Compare what matters</Heading><Text color="secondary">Prepared from eligible registered businesses for this Request. Nothing has been selected, booked, or purchased.</Text></div><div className="grid gap-4 md:grid-cols-2">{projection.options.length === 0 ? <Card padding={5}><Text color="secondary">No comparable options were returned.</Text></Card> : projection.options.map((candidate) => <Card key={candidate.optionRef} padding={5}><article className="grid gap-3"><Heading level={3}>{candidate.business.name}</Heading><Text type="large" weight="semibold">{formatMoney(candidate.expectedCost.currency, candidate.expectedCost.amountMinor)}</Text>{candidate.comparableOutputs.map((output) => <Text key={output.label} color="secondary"><strong>{output.label}:</strong> {String(output.value)}</Text>)}{candidate.materialTerms.map((term) => <Text key={term} color="secondary">{term}</Text>)}<Text type="supporting" color="secondary">Cancellation: {candidate.cancellation.summary}</Text></article></Card>)}</div></section>
}

function NoOptions({ projection, turns }: { projection: CustomerRequestView; turns: readonly ConversationTurn[] }) { return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><Card padding={5}><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">No connected options</Text><Heading level={2}>Nothing eligible returned an option.</Heading><Text color="secondary">Your Request is preserved. You can change what matters, try again later, or stop; AE will not invent availability.</Text><Text type="supporting" color="secondary">Request revision {projection.revision}</Text></div></Card></section> }

function StartExamples() { return <div className="grid gap-2 border-t border-border pt-6 sm:grid-cols-4"><Example label="Place" value="Fremantle" /><Example label="Business type" value="Electrician" /><Example label="Situation" value="A quiet dinner with my parents" /><Example label="Detailed" value="Dog-friendly stay near the beach" /></div> }
function Example({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-surface p-4"><Text type="supporting" weight="semibold">{label}</Text><Text color="secondary" className="mt-1">{value}</Text></div> }
function Conversation({ turns }: { turns: readonly ConversationTurn[] }) { return <div className="grid gap-3" aria-label="Request conversation">{turns.map((turn, index) => turn.speaker === 'customer' ? <div key={`${index}:${turn.text}`} className="ml-auto max-w-[85%] rounded-md bg-accent px-4 py-3 text-on-accent">{turn.text}</div> : <div key={`${index}:${turn.text}`} className="max-w-[90%] border-l-2 border-accent py-1 pl-4"><Text className="text-sm font-semibold text-accent">AE</Text><Heading level={2} className="mt-1">{turn.text}</Heading></div>)}</div> }
function Clarification({ projection, answer, setAnswer, submit }: { projection: CustomerRequestView; answer: string; setAnswer: (answer: string) => void; submit: () => void }) { return <form className="grid gap-3 border-t border-border pt-5" onSubmit={(event) => { event.preventDefault(); submit() }}><label htmlFor="clarification-answer" className="text-sm font-semibold">Your answer</label><div className="flex flex-col gap-2 sm:flex-row"><input id="clarification-answer" autoFocus value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={projection.clarification?.answerKind === 'natural_language' ? 'Describe it in your own words' : projection.clarification?.prompt} className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 outline-none focus:ring-2 focus:ring-accent" /><button type="submit" disabled={!answer.trim()} className="min-h-11 rounded-md bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">Continue</button></div></form> }
function statusLabel(state: CustomerRequestView['state']): string {
  if (state === 'ready_to_compare') return 'Ready to compare'
  if (state === 'needs_information') return 'More information needed'
  if (state === 'preparing_options') return 'Checking connected businesses'
  if (state === 'needs_attention') return 'Needs attention'
  if (state === 'no_options') return 'No connected options'
  return state === 'options_ready' ? 'Available options' : 'Not supported yet'
}
function formatMoney(currency: string, amountMinor: number): string { return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amountMinor / 100) }
function errorState(status: number, message: string): WorkspaceState { return { kind: 'error', message: status === 401 ? 'Sign in so AE can keep this request private and resumable.' : message, authenticationRequired: status === 401 } }
