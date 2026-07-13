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
  const [editingRevision, setEditingRevision] = useState<number | undefined>()
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
          idempotencyKey: `submit:${identity.requestRef}:${editingRevision ?? 0}`, requestRef: identity.requestRef, agentRef: identity.agentRef,
          ...(editingRevision === undefined ? {} : { expectedRevision: editingRevision }),
          request: need.trim(), routing: { network: 'ae:public' },
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
      setEditingRevision(undefined)
      setState({ kind: 'request', projection: result })
    } catch {
      setState({ kind: 'error', message: 'AE could not be reached. Your request was not submitted.', authenticationRequired: false })
    }
  }

  function edit(projection: CustomerRequestView) {
    setEditingRevision(projection.revision)
    setState({ kind: 'idle' })
  }

  function restart() {
    setNeed('')
    setAnswer('')
    setTurns([])
    setEditingRevision(undefined)
    setRequestIdentity(undefined)
    setState({ kind: 'idle' })
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
            ...(isNaturalLanguage ? { message } : { requirementKey: clarification.requirementKey, value: message }),
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
        body: JSON.stringify({
          revision: projection.revision,
          idempotencyKey: `prepare:${projection.requestRef}:${projection.revision}:${crypto.randomUUID()}`,
        }),
      })
      const result: CustomerRequestView | Readonly<{ error: string }> = await response.json()
      if ('kind' in result && result.kind === 'request') setState({ kind: 'request', projection: result })
      else setState(errorState(response.status, 'AE could not prepare comparable options for this request.'))
    } catch {
      setState({ kind: 'error', message: 'AE could not be reached. No option was selected or purchased.', authenticationRequired: false })
    }
  }

  async function authorize(projection: CustomerRequestView) {
    if (projection.preparationRef === undefined) {
      setState({ kind: 'error', message: 'AE could not find the disclosure review to authorize. Refresh this request.', authenticationRequired: false })
      return
    }
    setState({ kind: 'submitting' })
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(projection.requestRef)}/authorization`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: projection.revision,
          preparationRef: projection.preparationRef,
          idempotencyKey: `authorize:${projection.requestRef}:${projection.revision}`,
        }),
      })
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        setState(errorState(response.status, 'AE could not record that permission. Nothing was shared.'))
        return
      }
      setState({ kind: 'request', projection: result })
    } catch {
      setState({ kind: 'error', message: 'AE could not record that permission. Nothing was shared.', authenticationRequired: false })
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
        {editingRevision !== undefined ? <Text type="supporting" color="secondary">Editing revision {editingRevision} of this Request.</Text> : null}
        {state.kind === 'error' ? <RequestResult state={state} compare={compare} authorize={authorize} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} turns={turns} /> : <StartExamples />}
      </section> : <RequestResult state={state} compare={compare} authorize={authorize} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} turns={turns} />}
    </main>
  )
}

function RequestResult({ state, compare, authorize, continueRequest, edit, restart, answer, setAnswer, turns }: { state: WorkspaceState; compare: (projection: CustomerRequestView) => Promise<void>; authorize: (projection: CustomerRequestView) => Promise<void>; continueRequest: (projection: CustomerRequestView) => Promise<void>; edit: (projection: CustomerRequestView) => void; restart: () => void; answer: string; setAnswer: (answer: string) => void; turns: readonly ConversationTurn[] }) {
  if (state.kind === 'error') return <Card padding={5} className="min-w-0" aria-live="polite"><div className="grid gap-4"><Heading level={2}>Request unavailable</Heading><Text color="secondary">{state.message}</Text>{state.authenticationRequired ? <Button label="Sign in to continue" href="/sign-in" variant="primary" /> : null}</div></Card>
  if (state.kind === 'request' && state.projection.state === 'options_ready') return <OptionsCard projection={state.projection} turns={turns} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'no_options') return <NoOptions projection={state.projection} turns={turns} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'needs_authorization') return <DisclosureReview projection={state.projection} turns={turns} authorize={() => authorize(state.projection)} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request') return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={state.projection} correct={() => edit(state.projection)} />{state.projection.clarification ? <Clarification projection={state.projection} answer={answer} setAnswer={setAnswer} submit={() => void continueRequest(state.projection)} /> : <Card padding={5}><div className="grid gap-4"><Text className="text-sm font-medium text-accent">{statusLabel(state.projection.state)}</Text><Heading level={2}>{state.projection.summary}</Heading>{state.projection.nextAction === 'prepare_options' ? <Button label="Show available options" variant="primary" clickAction={() => void compare(state.projection)} /> : state.projection.state === 'preparing_options' ? <Button label="Check again" variant="secondary" clickAction={() => void compare(state.projection)} /> : <Text color="secondary">AE cannot prepare a supported decision from the registered businesses for this request yet.</Text>}<RecoveryActions edit={() => edit(state.projection)} restart={restart} /></div></Card>}</section>
  if (state.kind === 'submitting' || state.kind === 'comparing') return <Card padding={5} className="min-w-0" aria-live="polite" aria-busy="true"><Heading level={2}>{state.kind === 'submitting' ? 'Understanding your request…' : 'Comparing available options…'}</Heading><Text color="secondary" className="mt-2">No purchase or booking occurs during this step.</Text></Card>
  return <Card padding={5} className="min-w-0 bg-surface"><Heading level={2}>Your result will appear here</Heading><Text color="secondary" className="mt-2">AE will show missing information, unsupported requests, or comparable business options.</Text></Card>
}

function OptionsCard({ projection, turns, edit, restart }: { projection: CustomerRequestView; turns: readonly ConversationTurn[]; edit: () => void; restart: () => void }) {
  const optionSet = projection.optionSet
  const isSingle = optionSet?.cardinality === 'single' || projection.options.length === 1
  const coverage = optionSet?.coverage
  const recommendation = optionSet?.ordering.kind === 'recommended' ? optionSet.ordering : undefined
  const recommendedBusiness = recommendation === undefined ? undefined
    : projection.options.find((option) => option.optionRef === recommendation.optionRef)?.business.name
  return <section className="grid gap-6" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={projection} correct={edit} /><div className="grid gap-2"><Text className="text-sm font-semibold text-accent">{recommendation ? 'A clear price leader' : isSingle ? 'One option found' : 'Options found'}</Text><Heading level={2} className="text-3xl">{recommendation && recommendedBusiness ? `AE recommends ${recommendedBusiness}.` : isSingle ? 'One registered option matched.' : `${projection.options.length} registered options found.`}</Heading><Text color="secondary">{recommendation ? 'This recommendation follows the price priority in your request.' : isSingle ? 'This is not a comparison or recommendation.' : 'These options are not ranked. AE has not recommended one.'} Nothing has been selected, booked, or purchased.</Text>{recommendation ? <RecommendationEvidence ordering={recommendation} /> : null}{coverage ? <Text type="supporting" color="secondary">AE evaluated {coverage.evaluated} connected {coverage.evaluated === 1 ? 'business' : 'businesses'}: {coverage.optionsReceived} returned an option, {coverage.unavailable} unavailable, {coverage.pending} pending, {coverage.uncertain} uncertain.</Text> : null}</div><div className="grid gap-4 md:grid-cols-2">{projection.options.map((candidate) => <Card key={candidate.optionRef} padding={5}><article className="grid gap-3"><div><Text type="supporting" color="secondary">{recommendation?.optionRef === candidate.optionRef ? 'Recommended for your price priority' : 'Provider-reported option'}</Text><Heading level={3}>{candidate.business.name}</Heading></div><div><Text type="supporting" color="secondary">Provider estimate</Text><Text type="large" weight="semibold">{formatMoney(candidate.expectedCost.currency, candidate.expectedCost.amountMinor)}</Text><Text type="supporting" color="secondary">Provider maximum {formatMoney(candidate.maximumCost.currency, candidate.maximumCost.amountMinor)}</Text></div><PriceBasis option={candidate} />{candidate.comparableOutputs.map((output) => <Text key={output.label} color="secondary"><strong>{output.label}:</strong> {String(output.value)}</Text>)}{candidate.materialTerms.map((term) => <Text key={term} color="secondary">Provider term: {term}</Text>)}<Text type="supporting" color="secondary">Provider cancellation: {candidate.cancellation.summary}</Text><CommercialRelationship option={candidate} /><Text type="supporting" color="secondary">Valid until {formatOptionTime(candidate.provenance?.validUntil ?? candidate.expiresAt)}</Text></article></Card>)}</div><RecoveryActions edit={edit} restart={restart} /></section>
}

function PriceBasis({ option }: { option: CustomerRequestView['options'][number] }) {
  const componentTotal = option.priceComponents.reduce((total, component) => total + component.amountMinor, 0)
  const unitemizedMaximum = option.maximumCost.amountMinor - componentTotal
  return <div className="grid gap-1"><Text type="supporting" weight="semibold">Reported price components</Text>{option.priceComponents.map((component) => <Text key={`${component.label}:${component.amountMinor}`} type="supporting" color="secondary">{component.label}: {formatMoney(option.maximumCost.currency, component.amountMinor)}</Text>)}{unitemizedMaximum > 0 ? <Text type="supporting" color="secondary">The provider maximum includes up to {formatMoney(option.maximumCost.currency, unitemizedMaximum)} not itemised above.</Text> : null}</div>
}

function RecommendationEvidence({ ordering }: { ordering: Extract<NonNullable<CustomerRequestView['optionSet']>['ordering'], { kind: 'recommended' }> }) {
  return <div className="grid gap-2 rounded-md border border-border bg-surface p-4"><Text weight="semibold">Why this option</Text><ul className="grid gap-1 text-sm text-secondary">{ordering.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><Text type="supporting" weight="semibold">Tradeoffs checked</Text><ul className="grid gap-1 text-sm text-secondary">{ordering.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul></div>
}

function CommercialRelationship({ option }: { option: CustomerRequestView['options'][number] }) {
  const influence = option.commercialInfluence
  if (influence.status === 'unknown') return <Text type="supporting" color="secondary">Commercial relationship: AE has no registered evidence for this option.</Text>
  if (influence.status === 'none') return <Text type="supporting" color="secondary">Commercial relationship: {influence.summary}</Text>
  const effects = [
    influence.influencesEligibility ? 'eligibility' : undefined,
    influence.influencesInclusion ? 'inclusion' : undefined,
    influence.influencesOrder ? 'ordering' : undefined,
  ].filter((effect): effect is string => effect !== undefined)
  return <div className="grid gap-1 rounded-md border border-border bg-surface p-3"><Text type="supporting" weight="semibold">Commercial relationship disclosed</Text><Text type="supporting" color="secondary">{influence.summary}</Text><Text type="supporting" color="secondary">{influence.payerName} pays {influence.beneficiaryName}: {influence.compensationBasis}.</Text><Text type="supporting" color="secondary">{effects.length === 0 ? 'Registered as not influencing eligibility, inclusion, or ordering.' : `Registered as influencing ${effects.join(', ')}.`}</Text></div>
}

function NoOptions({ projection, turns, edit, restart }: { projection: CustomerRequestView; turns: readonly ConversationTurn[]; edit: () => void; restart: () => void }) { return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={projection} correct={edit} /><Card padding={5}><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">No connected options</Text><Heading level={2}>Nothing eligible returned an option.</Heading><Text color="secondary">Your Request is preserved. You can change what matters, try again later, or stop; AE will not invent availability.</Text><Text type="supporting" color="secondary">Request revision {projection.revision}</Text><RecoveryActions edit={edit} restart={restart} /></div></Card></section> }
function DisclosureReview({ projection, turns, authorize, edit, restart }: { projection: CustomerRequestView; turns: readonly ConversationTurn[]; authorize: () => Promise<void>; edit: () => void; restart: () => void }) { const review = projection.disclosureReview; if (review === undefined) return null; return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={projection} correct={edit} /><Card padding={5}><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">Before AE contacts businesses</Text><Heading level={2}>Review what would be shared</Heading><Text color="secondary">To {review.purpose.toLocaleLowerCase()}, AE would share the following with up to {review.maximumRecipients} eligible registered {review.maximumRecipients === 1 ? 'business' : 'businesses'}.</Text><ul className="grid gap-2">{review.categories.map((category) => <li key={`${category.label}:${category.classification}`} className="rounded-md border border-border bg-surface px-3 py-2"><strong>{category.label}</strong> <span className="text-secondary">· {category.classification}</span></li>)}</ul><Text weight="semibold">Nothing has been shared. Explicit permission is required before preparation can continue.</Text><Button label="Allow this comparison" variant="primary" clickAction={authorize} /><RecoveryActions edit={edit} restart={restart} /></div></Card></section> }
function WorkingUnderstanding({ projection, correct }: { projection: CustomerRequestView; correct: () => void }) { const criteria = projection.criteria ?? []; if (criteria.length === 0) return null; return <Card padding={4}><div className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><Text className="text-sm font-semibold text-accent">AE’s working understanding</Text><button type="button" onClick={correct} className="min-h-11 text-sm font-semibold underline underline-offset-4">Correct</button></div><div className="flex flex-wrap gap-2">{criteria.map((criterion) => <span key={`${criterion.label}:${String(criterion.value)}`} className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm"><strong>{criterion.label}:</strong> {String(criterion.value)} <span className="text-secondary">· {criterion.basis === 'customer_provided' ? 'you provided' : 'from your request'}</span></span>)}</div></div></Card> }
function RecoveryActions({ edit, restart }: { edit: () => void; restart: () => void }) { return <div className="flex flex-wrap gap-3 border-t border-border pt-4"><Button label="Edit this Request" variant="secondary" clickAction={edit} /><Button label="Start a new Request" variant="ghost" clickAction={restart} /></div> }

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
  if (state === 'needs_authorization') return 'Permission needed'
  return state === 'options_ready' ? 'Available options' : 'Not supported yet'
}
function formatMoney(currency: string, amountMinor: number): string { return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amountMinor / 100) }
function formatOptionTime(timestamp: number): string { return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp) }
function errorState(status: number, message: string): WorkspaceState { return { kind: 'error', message: status === 401 ? 'Sign in so AE can keep this request private and resumable.' : message, authenticationRequired: status === 401 } }
