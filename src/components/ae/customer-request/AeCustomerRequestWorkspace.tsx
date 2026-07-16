import { useEffect, useRef, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Skeleton } from '@astryxdesign/core/Skeleton'

import {
  customerRequestEvidenceResultSchema,
  type CustomerRequestEvidenceExport,
} from '@/modules/customer-request/agent-contract'
import { fetchBrowserRequestWithInterpreterRecovery } from '@/modules/customer-request/browser-submit-recovery'
import type { CustomerRequestProjection, CustomerRequestView } from '@/modules/customer-request/customer-projection'

type SubmitResponse = CustomerRequestProjection | Readonly<{ kind: 'refused'; reason: string }> | Readonly<{ error: string }>
type WorkspaceState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'resuming' }>
  | Readonly<{ kind: 'submitting' }>
  | Readonly<{ kind: 'request'; projection: CustomerRequestView }>
  | Readonly<{ kind: 'comparing'; projection: CustomerRequestView }>
  | Readonly<{ kind: 'reviewing'; projection: CustomerRequestView; routeRef: string }>
  | Readonly<{ kind: 'confirming'; projection: CustomerRequestView; routeRef: string }>
  | Readonly<{ kind: 'refreshing'; projection: CustomerRequestView }>
  | Readonly<{
      kind: 'conflict'
      projection: CustomerRequestView
      reason: Extract<CustomerRequestProjection, { kind: 'conflict' }>['reason']
    }>
  | Readonly<{ kind: 'error'; message: string; authenticationRequired: boolean }>
type ConversationTurn = Readonly<{ speaker: 'customer' | 'ae'; text: string }>
type CustomerRoute = NonNullable<CustomerRequestView['decision']>['routes'][number]
type BrowserRequestIdentity = Readonly<{ requestRef: string; agentRef: string }>
type CustomerClarification = NonNullable<CustomerRequestView['clarification']>

const optionTimeFormatter = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
const ACTIVE_REQUEST_STORAGE_KEY = 'ae.customer-request.active:v1'

export type AeCustomerRequestWorkspaceProps = Readonly<{
  initialNeed?: string
}>

export function AeCustomerRequestWorkspace({ initialNeed = '' }: AeCustomerRequestWorkspaceProps) {
  const [need, setNeed] = useState(initialNeed)
  const [answer, setAnswer] = useState('')
  const [state, setState] = useState<WorkspaceState>({ kind: 'idle' })
  const [turns, setTurns] = useState<readonly ConversationTurn[]>([])
  const [editingRevision, setEditingRevision] = useState<number | undefined>()
  const requestIdentityRef = useRef<BrowserRequestIdentity | undefined>(undefined)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (initialNeed.trim().length > 0) return
    const identity = readStoredRequestIdentity()
    if (identity === undefined) return
    requestIdentityRef.current = identity
    setState({ kind: 'resuming' })
    let active = true
    void fetch(`/api/requests/${encodeURIComponent(identity.requestRef)}`, {
      method: 'GET', headers: { Accept: 'application/json' },
    }).then(async (response) => {
      const result: SubmitResponse = await response.json()
      if (!active) return
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        if (response.status === 404) {
          requestIdentityRef.current = undefined
          forgetStoredRequestIdentity()
        }
        setState(errorState(response.status, 'AE could not reopen this Request. You can start a new one below.'))
        return
      }
      setNeed(result.summary)
      setTurns(result.clarification === undefined
        ? []
        : [{ speaker: 'ae', text: customerClarificationPrompt(result.clarification) }])
      setState({ kind: 'request', projection: result })
    }).catch(() => {
      if (active) setState({
        kind: 'error', message: 'AE could not be reached. Your Request is still saved in this browser.',
        authenticationRequired: false,
      })
    })
    return () => { active = false }
  }, [initialNeed])

  async function submit() {
    if (need.trim().length === 0 || submittingRef.current || state.kind === 'submitting'
      || state.kind === 'resuming' || state.kind === 'comparing' || state.kind === 'confirming' || state.kind === 'refreshing') return
    submittingRef.current = true
    const identity = requestIdentityRef.current ?? { requestRef: `request:${crypto.randomUUID()}`, agentRef: `web:${crypto.randomUUID()}` }
    requestIdentityRef.current = identity
    setState({ kind: 'submitting' })
    try {
      const replacing = editingRevision !== undefined
      const endpoint = replacing
        ? `/api/requests/${encodeURIComponent(identity.requestRef)}/messages`
        : '/api/requests'
      const requestInit = {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(replacing
          ? {
              idempotencyKey: `replace:${identity.requestRef}:${editingRevision}`,
              expectedRevision: editingRevision, message: need.trim(), mode: 'replace',
            }
          : {
              idempotencyKey: `submit:${identity.requestRef}:0`, requestRef: identity.requestRef,
              agentRef: identity.agentRef, request: need.trim(), routing: { network: 'ae:public' },
            }),
      }
      const response = replacing
        ? await fetch(endpoint, requestInit)
        : await fetchBrowserRequestWithInterpreterRecovery(endpoint, requestInit)
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        setState(errorState(response.status, 'AE could not start this request.'))
        return
      }
      setTurns([
        { speaker: 'customer', text: need.trim() },
        ...(result.clarification === undefined ? [] : [{
          speaker: 'ae' as const, text: customerClarificationPrompt(result.clarification),
        }]),
      ])
      rememberRequestIdentity(result.requestRef)
      setEditingRevision(undefined)
      setState({ kind: 'request', projection: result })
    } catch {
      setState({ kind: 'error', message: 'AE could not be reached. Your request was not submitted.', authenticationRequired: false })
    } finally {
      submittingRef.current = false
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
    requestIdentityRef.current = undefined
    forgetStoredRequestIdentity()
    setState({ kind: 'idle' })
  }

  function reviewRoute(projection: CustomerRequestView, routeRef: string) {
    setState({ kind: 'reviewing', projection, routeRef })
  }

  function leaveRouteReview(projection: CustomerRequestView) {
    setState({ kind: 'request', projection })
  }

  async function continueRequest(projection: CustomerRequestView) {
    const clarification = projection.clarification
    const message = answer.trim()
    if (clarification === undefined || message.length === 0) return
    setState({ kind: 'submitting' })
    setTurns((current) => [...current, { speaker: 'customer', text: message }])
    setAnswer('')
    try {
      const isContractFact = clarification.kind === 'contract_fact'
      const response = await fetch(
        `/api/requests/${encodeURIComponent(projection.requestRef)}/${isContractFact ? 'facts' : 'messages'}`,
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isContractFact
            ? {
                idempotencyKey: `clarify:${projection.requestRef}:${projection.revision}:${crypto.randomUUID()}`,
                expectedRevision: projection.revision,
                requirementKey: clarification.requirementKey,
                value: message,
              }
            : {
                idempotencyKey: `clarify:${projection.requestRef}:${projection.revision}:${crypto.randomUUID()}`,
                expectedRevision: projection.revision,
                message,
              }),
        },
      )
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        setState(errorState(response.status, 'AE could not add that answer to this request.'))
        return
      }
      const nextClarification = result.clarification
      if (nextClarification !== undefined) setTurns((current) => [
        ...current, { speaker: 'ae', text: customerClarificationPrompt(nextClarification) },
      ])
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
      const result: CustomerRequestProjection | Readonly<{ error: string }> = await response.json()
      if ('kind' in result && result.kind === 'request') setState({ kind: 'request', projection: result })
      else if ('kind' in result && result.kind === 'conflict') {
        setState({ kind: 'conflict', projection, reason: result.reason })
      } else setState(errorState(response.status, 'AE could not prepare comparable options for this request.'))
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

  async function confirmRoute(projection: CustomerRequestView, routeRef: string) {
    setState({ kind: 'confirming', projection, routeRef })
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(projection.requestRef)}/confirmation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: projection.revision,
          routeRef,
          idempotencyKey: `confirm:${projection.requestRef}:${projection.revision}:${routeRef}`,
        }),
      })
      const result: SubmitResponse = await response.json()
      if ('kind' in result && result.kind === 'request') setState({ kind: 'request', projection: result })
      else if ('kind' in result && result.kind === 'conflict') {
        setState({ kind: 'conflict', projection, reason: result.reason })
      } else setState(errorState(response.status, 'AE could not confirm this choice. Nothing was started.'))
    } catch {
      setState({
        kind: 'error', message: 'AE could not be reached. Nothing was started.', authenticationRequired: false,
      })
    }
  }

  async function refresh(projection: CustomerRequestView) {
    setState({ kind: 'refreshing', projection })
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(projection.requestRef)}`)
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        setState(errorState(response.status, 'AE could not check this request. It was not sent again.'))
        return
      }
      setState({ kind: 'request', projection: result })
    } catch {
      setState({
        kind: 'error', message: 'AE could not be reached. The request was not sent again.',
        authenticationRequired: false,
      })
    }
  }

  async function actOnRoute(projection: CustomerRequestView, operation: 'run' | 'cancellation') {
    setState({ kind: 'refreshing', projection })
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(projection.requestRef)}/${operation}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: operation === 'run'
            ? `run:${projection.requestRef}:${projection.confirmation?.confirmationRef ?? projection.routeGenerationRef ?? projection.revision}`
            : `cancellation:${projection.requestRef}:${projection.activity?.updatedAt ?? projection.revision}`,
        }),
      })
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        setState(errorState(response.status, operation === 'run'
          ? 'AE could not start this request. Nothing was sent twice.'
          : 'AE could not confirm that this request stopped. Check its current state.'))
        return
      }
      setState({ kind: 'request', projection: result })
    } catch {
      setState({
        kind: 'error',
        message: operation === 'run'
          ? 'AE could not be reached. Check this Request before trying again.'
          : 'AE could not be reached. Check whether this Request stopped before doing anything else.',
        authenticationRequired: false,
      })
    }
  }

  const showStartHeader = (state.kind === 'idle' || state.kind === 'error')
    && requestIdentityRef.current === undefined

  return (
    <main className="mx-auto grid min-w-0 w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:py-14">
      {showStartHeader ? <header className="mx-auto grid max-w-3xl gap-3 text-center">
        <Text className="text-sm font-semibold text-accent">Ask AE</Text>
        <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">What can we help you find?</Heading>
        <Text type="large" color="secondary">Enter a place, a type of business, or describe the situation. We’ll ask what matters and help you compare your options.</Text>
      </header> : null}

      {state.kind === 'request' && state.projection.recovery?.state === 'restored'
        ? <Card padding={3} className="mx-auto w-full max-w-4xl" aria-live="polite">
            <Text color="secondary">{state.projection.recovery.reason === 'choice_expired'
              ? 'AE restored this Request. The earlier choice expired, so no work was authorized or restarted.'
              : 'AE restored the latest saved state for this Request. Checking it did not restart the work.'}</Text>
          </Card>
        : null}

      {state.kind === 'idle' || state.kind === 'error' ? <section className="mx-auto grid w-full max-w-3xl gap-3" aria-label="Start a request">
        <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-low sm:flex-row">
          <label className="sr-only" htmlFor="customer-need">What are you looking for?</label>
          <textarea id="customer-need" value={need} onChange={(event) => setNeed(event.target.value)} rows={2} maxLength={2_000} required placeholder="Try a place, business type, or need" className="min-h-16 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-lg text-primary outline-none focus:ring-2 focus:ring-accent" />
          <button type="submit" disabled={need.trim().length === 0} className="min-h-11 self-end rounded-md bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">Explore</button>
        </form>
        <Text type="supporting" color="secondary" className="text-center">No budget or full specification required. Keep contact, payment, and account details until AE asks for them.</Text>
        {editingRevision !== undefined ? <Text type="supporting" color="secondary">Editing revision {editingRevision} of this Request.</Text> : null}
        {state.kind === 'error' ? <RequestResult state={state} compare={compare} reviewRoute={reviewRoute} leaveRouteReview={leaveRouteReview} confirmRoute={confirmRoute} actOnRoute={actOnRoute} authorize={authorize} refresh={refresh} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} turns={turns} /> : <StartExamples />}
      </section> : <RequestResult state={state} compare={compare} reviewRoute={reviewRoute} leaveRouteReview={leaveRouteReview} confirmRoute={confirmRoute} actOnRoute={actOnRoute} authorize={authorize} refresh={refresh} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} turns={turns} />}
    </main>
  )
}

function RequestResult({ state, compare, reviewRoute, leaveRouteReview, confirmRoute, actOnRoute, authorize, refresh, continueRequest, edit, restart, answer, setAnswer, turns }: { state: WorkspaceState; compare: (projection: CustomerRequestView) => Promise<void>; reviewRoute: (projection: CustomerRequestView, routeRef: string) => void; leaveRouteReview: (projection: CustomerRequestView) => void; confirmRoute: (projection: CustomerRequestView, routeRef: string) => Promise<void>; actOnRoute: (projection: CustomerRequestView, operation: 'run' | 'cancellation') => Promise<void>; authorize: (projection: CustomerRequestView) => Promise<void>; refresh: (projection: CustomerRequestView) => Promise<void>; continueRequest: (projection: CustomerRequestView) => Promise<void>; edit: (projection: CustomerRequestView) => void; restart: () => void; answer: string; setAnswer: (answer: string) => void; turns: readonly ConversationTurn[] }) {
  if (state.kind === 'error') return <Card padding={5} className="min-w-0" aria-live="polite"><div className="grid gap-4"><Heading level={2}>Request unavailable</Heading><Text color="secondary">{state.message}</Text>{state.authenticationRequired ? <Button label="Sign in to continue" href="/sign-in" variant="primary" /> : null}</div></Card>
  if (state.kind === 'conflict') return <Card padding={5} className="mx-auto w-full max-w-4xl" aria-live="polite">
    <div className="grid gap-4">
      <Text className="text-sm font-semibold text-accent">A newer decision is available</Text>
      <Heading level={2}>This Request changed.</Heading>
      <Text color="secondary">{conflictExplanation(state.reason)} No action was authorized, and your Request is preserved.</Text>
      <Button label="Load the current Request" variant="primary" clickAction={() => void refresh(state.projection)} />
      <RecoveryActions edit={() => edit(state.projection)} restart={restart} />
    </div>
  </Card>
  if (state.kind === 'request' && state.projection.confirmation !== undefined) {
    return <RouteConfirmationCard projection={state.projection} turns={turns} start={() => actOnRoute(state.projection, 'run')} edit={() => edit(state.projection)} restart={restart} />
  }
  if (state.kind === 'reviewing') {
    return <RouteReviewCard projection={state.projection} routeRef={state.routeRef} turns={turns} confirm={() => confirmRoute(state.projection, state.routeRef)} decline={() => leaveRouteReview(state.projection)} edit={() => edit(state.projection)} restart={restart} />
  }
  if (state.kind === 'request' && state.projection.decision !== undefined) {
    return <RouteDecisionCard projection={state.projection} turns={turns} review={(routeRef) => reviewRoute(state.projection, routeRef)} check={() => compare(state.projection)} edit={() => edit(state.projection)} restart={restart} />
  }
  if (state.kind === 'request' && state.projection.state === 'options_ready') return <OptionsCard projection={state.projection} turns={turns} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'no_options') return <NoOptions projection={state.projection} turns={turns} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'needs_authorization') return <DisclosureReview projection={state.projection} turns={turns} authorize={() => authorize(state.projection)} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'in_progress') return <RouteProgressCard projection={state.projection} turns={turns} refresh={() => refresh(state.projection)} cancel={() => actOnRoute(state.projection, 'cancellation')} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'cancelled') return <CancelledStatusCard projection={state.projection} turns={turns} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && (state.projection.state === 'outcome_unknown'
    || state.projection.state === 'completed' || state.projection.state === 'failed')) {
    return <ActionStatusCard projection={state.projection} turns={turns} refresh={() => refresh(state.projection)} edit={() => edit(state.projection)} restart={restart} />
  }
  if (state.kind === 'request') return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={state.projection} correct={() => edit(state.projection)} />{state.projection.clarification ? <Clarification prompt={customerClarificationPrompt(state.projection.clarification)} answer={answer} setAnswer={setAnswer} submit={() => void continueRequest(state.projection)} /> : <Card padding={5}><div className="grid gap-4"><Text className="text-sm font-medium text-accent">{statusLabel(state.projection.state)}</Text><Heading level={2}>{state.projection.summary}</Heading>{state.projection.dataHandling === undefined ? null : <Text color="secondary">{state.projection.dataHandling.explanation}</Text>}{state.projection.nextAction === 'prepare_options' ? <Button label="Show available options" variant="primary" clickAction={() => void compare(state.projection)} /> : state.projection.state === 'preparing_options' ? <Button label="Check again" variant="secondary" clickAction={() => void compare(state.projection)} /> : <Text color="secondary">AE cannot prepare a useful choice for this request yet.</Text>}<RecoveryActions edit={() => edit(state.projection)} restart={restart} /></div></Card>}</section>
  if (state.kind === 'confirming') return <ConfirmationLoadingCard />
  if (state.kind === 'resuming' || state.kind === 'submitting' || state.kind === 'comparing' || state.kind === 'refreshing') return <Card padding={5} className="min-w-0" aria-live="polite" aria-busy="true"><Heading level={2}>{state.kind === 'resuming' ? 'Reopening your Request…' : state.kind === 'submitting' ? 'Understanding your request…' : state.kind === 'comparing' ? 'Comparing available options…' : 'Checking with the latest evidence…'}</Heading><Text color="secondary" className="mt-2">No purchase, booking, or business step occurs during this moment.</Text></Card>
  return <Card padding={5} className="min-w-0 bg-surface"><Heading level={2}>Your result will appear here</Heading><Text color="secondary" className="mt-2">AE will show missing information, unsupported requests, or comparable business options.</Text></Card>
}

function conflictExplanation(reason: Extract<CustomerRequestProjection, { kind: 'conflict' }>['reason']): string {
  if (reason === 'revision_changed') return 'The Request was revised before this comparison finished.'
  if (reason === 'options_changed') return 'The available ways forward changed before this comparison finished.'
  if (reason === 'identity_changed') return 'The person or agent allowed to access this Request changed.'
  return 'This operation key was already used for different work.'
}

function RouteDecisionCard({ projection, turns, review, check, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  review: (routeRef: string) => void
  check: () => Promise<void>
  edit: () => void
  restart: () => void
}) {
  const decision = projection.decision
  if (decision === undefined) return null
  const recommendation = decision.comparison.kind === 'recommended' ? decision.comparison : undefined
  const recommendedRoute = recommendation === undefined
    ? undefined
    : decision.routes.find(({ routeRef }) => routeRef === recommendation.routeRef)
  return <section className="mx-auto grid w-full max-w-4xl gap-6" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <header className="grid gap-2">
      <Text className="text-sm font-semibold text-accent">Ways forward</Text>
      <Heading level={2} className="text-3xl">{decision.outcome.summary}</Heading>
      <Text color="secondary">{decision.outcome.kind === 'routes_expired'
        ? 'Your Request is preserved. Check again to rebuild the available ways forward from current business information.'
        : 'Compare who is involved, the maximum cost, what would be shared, and how problems would be handled.'}</Text>
      <Text color="secondary">{decision.comparison.summary}</Text>
    </header>
    {recommendation === undefined ? null : <Card padding={4}>
      <Text weight="semibold">Why AE recommends this way</Text>
      <ul className="mt-2 grid gap-1 text-sm text-secondary">
        {recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      <Text type="supporting" weight="semibold" className="mt-3">Tradeoffs checked</Text>
      <ul className="mt-1 grid gap-1 text-sm text-secondary">
        {recommendation.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}
      </ul>
      {recommendation.commercialInfluence === 'disclosed'
        ? <div className="mt-3 grid gap-1">
          <Text color="secondary">
            Commercial relationships did not change eligibility, inclusion, or order.
          </Text>
          {recommendedRoute?.comparison.commercialInfluence.status === 'disclosed'
            ? recommendedRoute.comparison.commercialInfluence.summaries.map((summary) => (
              <Text key={summary} type="supporting" color="secondary">{summary}</Text>
            ))
            : null}
        </div>
        : null}
    </Card>}
    {decision.changes.kind === 'changed'
      ? <DecisionChanges changes={decision.changes.items} routes={decision.routes} />
      : null}
    <div className="grid gap-4">
      {decision.routes.map((route, index) => <Card key={route.routeRef} padding={5}>
        <article className="grid gap-5">
          <div className="grid gap-1">
            <Text type="supporting" color="secondary">
              {route.availability === 'expired'
                ? 'Expired way forward'
                : recommendation?.routeRef === route.routeRef
                  ? 'Recommended for your stated priority'
                  : decision.routes.length === 1
                    ? 'Current way forward'
                    : recommendation === undefined
                      ? `Current way forward ${index + 1}`
                      : `Other way forward ${index + 1}`}
            </Text>
            <Heading level={3}>{route.result.summary}</Heading>
            <Text color="secondary">Through {businessList(route.businesses.map(({ name }) => name))}</Text>
            {route.result.deliverables.length === 0 ? null : <Text type="supporting" color="secondary">
              Expected result: {route.result.deliverables.join(', ')}
            </Text>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Text type="supporting" weight="semibold">What it could cost</Text>
              <Text type="large" weight="semibold">
                {route.maximumTotalCost.kind === 'known'
                  ? `Maximum ${formatMoney(route.maximumTotalCost.currency, route.maximumTotalCost.amountMinor)}`
                  : 'Price needs confirmation'}
              </Text>
            </div>
            <div>
              <Text type="supporting" weight="semibold">Available until</Text>
              <Text color="secondary">{formatOptionTime(route.validUntil)}</Text>
            </div>
          </div>
          <div className="grid gap-2">
            <Text weight="semibold">Why it fits</Text>
            <Text color="secondary">It covers the requested result and every constraint AE could check.</Text>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-secondary">
            <span>{route.dataUse.recipientCount} information {route.dataUse.recipientCount === 1 ? 'recipient' : 'recipients'}</span>
            <span>{route.comparison.irreversibleEffectCount} irreversible {route.comparison.irreversibleEffectCount === 1 ? 'effect' : 'effects'}</span>
            <span>{route.comparison.recovery === 'retry_safe' ? 'Safe retry after confirmed failure' : 'Check required before retry'}</span>
            <span>{route.comparison.duration === 'not_declared' ? 'Timing not declared' : route.comparison.duration}</span>
          </div>
          <RouteImportantDetails route={route} />
          <details className="rounded-md border border-border bg-surface p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">How this would work</summary>
            <ol className="mt-3 grid gap-3 text-sm text-secondary">
              {(route.steps ?? []).map((step) => <li key={step.step}>
                <strong>Step {step.step}: {step.business.name}.</strong>{' '}
                {step.after.length === 0
                  ? 'This starts the work.'
                  : `${step.business.name} will follow ${step.after.length === 1 ? `step ${step.after[0]}` : `steps ${step.after.join(', ')}`}.`}
              </li>)}
            </ol>
          </details>
          {route.availability === 'current' && route.maximumTotalCost.kind === 'known'
            ? <Button label={`Review ${route.result.summary.replace(/[.!?]+$/u, '')}`} variant="primary" clickAction={() => review(route.routeRef)} />
            : <Button label="Check current options" variant="secondary" clickAction={() => void check()} />}
        </article>
      </Card>)}
    </div>
    <Card padding={4}>
      <Text weight="semibold">Nothing has been authorized or shared.</Text>
      <Text color="secondary" className="mt-1">A separate confirmation step is required before AE can create authority for any action.</Text>
    </Card>
    <RecoveryActions edit={edit} restart={restart} />
  </section>
}

function RouteImportantDetails({ route }: { route: CustomerRoute }) {
  return <details className="rounded-md border border-border bg-surface p-4">
    <summary className="min-h-11 cursor-pointer font-semibold">Important details</summary>
    <div className="mt-4 grid gap-5">
      <RouteDisclosureDetails route={route} review={false} />
    </div>
  </details>
}

function RouteReviewCard({ projection, routeRef, turns, confirm, decline, edit, restart }: {
  projection: CustomerRequestView
  routeRef: string
  turns: readonly ConversationTurn[]
  confirm: () => Promise<void>
  decline: () => void
  edit: () => void
  restart: () => void
}) {
  const route = projection.decision?.routes.find((candidate) => candidate.routeRef === routeRef)
  const actions = projection.decision?.actions
  if (route === undefined || actions === undefined) return <Card padding={5} className="mx-auto w-full max-w-4xl" aria-live="polite">
    <div className="grid gap-4">
      <Heading level={2}>This choice is no longer available.</Heading>
      <Text color="secondary">Return to the current options before deciding. Nothing was confirmed or shared.</Text>
      <Button label="Return to options" variant="primary" clickAction={decline} />
    </div>
  </Card>
  return <section className="mx-auto grid w-full max-w-4xl gap-6" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <header className="grid gap-2">
      <Text className="text-sm font-semibold text-accent">Your choice</Text>
      <Heading level={2} className="text-3xl">Review before you confirm</Heading>
      <Text color="secondary">Check the result, maximum cost, information sharing, effects, expiry, and ways out before you decide.</Text>
    </header>
    <Card padding={5}>
      <div className="grid gap-6">
        <div className="grid gap-1">
          <Heading level={3}>{route.result.summary}</Heading>
          <Text color="secondary">Through {businessList(route.businesses.map(({ name }) => name))}</Text>
          {route.result.deliverables.length === 0 ? null : <Text type="supporting" color="secondary">Expected result: {route.result.deliverables.join(', ')}</Text>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Text type="supporting" weight="semibold">Maximum cost</Text>
            <Text type="large" weight="semibold">{route.maximumTotalCost.kind === 'known'
              ? `Maximum ${formatMoney(route.maximumTotalCost.currency, route.maximumTotalCost.amountMinor)}`
              : 'Price needs confirmation'}</Text>
          </div>
          <div>
            <Text type="supporting" weight="semibold">Confirm before</Text>
            <Text color="secondary">{formatOptionTime(route.validUntil)}</Text>
          </div>
        </div>
        <RouteDisclosureDetails route={route} review />
        <Text type="supporting" color="secondary">Choice code {route.quoteDigest}</Text>
        <div className="grid gap-3 rounded-md border border-border bg-surface p-4">
          <Heading level={3}>What confirming means</Heading>
          <Text color="secondary">Confirming gives AE permission for this exact choice and maximum cost. It does not start work or share information yet.</Text>
          <Text type="supporting" color="secondary">{actions.start.summary}</Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button label="Confirm this choice" variant="primary" clickAction={confirm} />
          <Button label="Change this Request" variant="secondary" clickAction={edit} />
          <Button label="Decline this choice" variant="secondary" clickAction={decline} />
          <Button label="Start a new Request" variant="ghost" clickAction={restart} />
        </div>
      </div>
    </Card>
  </section>
}

function RouteDisclosureDetails({ route, review }: { route: CustomerRoute; review: boolean }) {
  return <>
    <div className="grid gap-2">
      <Text weight="semibold">What would be shared</Text>
      {route.dataUse.recipients.length === 0
        ? <Text color="secondary">{review ? 'No information would be shared.' : 'No information sharing is declared for this way forward.'}</Text>
        : <ul className="grid gap-2 text-sm text-secondary">
            {route.dataUse.recipients.map((recipient) => <li key={recipient.recipientRef}>
              <strong>{recipient.name}</strong> — {recipient.purposes.map(readableLabel).join(', ')}. Fields: {recipient.fields.map(({ label, classification }) => `${label} (${classification})`).join(', ')}
            </li>)}
          </ul>}
    </div>
    <div className="grid gap-2">
      <Text weight="semibold">{review ? 'What starting could change' : 'What this way could change'}</Text>
      {route.effects.length === 0
        ? <Text color="secondary">No external change is declared.</Text>
        : <ul className="grid gap-1 text-sm text-secondary">
            {route.effects.map((effect) => <li key={`${effect.kind}:${effect.reversibility}`}>
              {effectLabel(effect.kind)} — {reversibilityLabel(effect.reversibility)}
            </li>)}
          </ul>}
    </div>
    <div className="grid gap-2">
      <Text weight="semibold">What remains uncertain</Text>
      <Text color="secondary">{route.uncertainty.length === 0
        ? `No uncertainty is declared for this ${review ? 'choice' : 'way forward'}.`
        : route.uncertainty.map(uncertaintyLabel).join(', ')}</Text>
      <Text type="supporting" color="secondary">{route.comparison.duration === 'not_declared'
        ? 'Completion timing has not been declared.'
        : route.comparison.duration}</Text>
    </div>
    <div className="grid gap-2">
      <Text weight="semibold">Commercial relationships</Text>
      <Text color="secondary">{route.comparison.commercialInfluence.status === 'unknown'
        ? 'AE does not have enough commercial relationship evidence to recommend this option.'
        : route.comparison.commercialInfluence.status === 'none'
          ? 'No registered commercial relationship affects this option.'
          : route.comparison.commercialInfluence.summaries.join(' ')}</Text>
    </div>
    <div className="grid gap-2">
      <Text weight="semibold">If something goes wrong</Text>
      <ul className="grid gap-1 text-sm text-secondary">
        {route.recovery.map((recovery) => <li key={recovery.step}>
          Step {recovery.step}, {recovery.businessName}: {recovery.posture === 'retry_safe'
            ? 'AE can safely retry after a confirmed failure.'
            : 'AE must check what happened before any retry.'}
        </li>)}
      </ul>
      <Text type="supporting" color="secondary">{route.fallback.available
        ? `${route.fallback.alternatives.length} alternative ${route.fallback.alternatives.length === 1 ? 'way is' : 'ways are'} available before confirmation.`
        : 'No alternative way is currently declared.'}</Text>
    </div>
    <div className="grid gap-2">
      <Text weight="semibold">Cancellation</Text>
      <Text color="secondary">{route.cancellation.summary}</Text>
    </div>
    <div className="grid gap-2">
      <Text weight="semibold">Evidence expected</Text>
      <Text color="secondary">{route.evidence.map(({ label }) => label).join(', ') || 'No completion evidence is declared.'}</Text>
    </div>
  </>
}

function RouteConfirmationCard({ projection, turns, start, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  start: () => Promise<void>
  edit: () => void
  restart: () => void
}) {
  const confirmation = projection.confirmation
  if (confirmation === undefined) return null
  const route = confirmation.route
  return <section className="mx-auto grid w-full max-w-4xl gap-6" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <Card padding={5}>
      <div className="grid gap-5">
        <div className="grid gap-2">
          <Text className="text-sm font-semibold text-accent">Choice confirmed</Text>
          <Heading level={2}>{route.result.summary}</Heading>
          <Text color="secondary">Through {businessList(route.businesses.map(({ name }) => name))}. Nothing has started yet.</Text>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Text type="supporting" weight="semibold">Maximum cost</Text><Text type="large" weight="semibold">{route.maximumTotalCost.kind === 'known' ? formatMoney(route.maximumTotalCost.currency, route.maximumTotalCost.amountMinor) : 'Not confirmed'}</Text></div>
          <div><Text type="supporting" weight="semibold">Confirmed until</Text><Text color="secondary">{formatOptionTime(confirmation.validUntil)}</Text></div>
        </div>
        <div><Text weight="semibold">Information recipients</Text><ul className="mt-2 grid gap-1 text-sm text-secondary">{route.dataUse.recipients.map((recipient) => <li key={recipient.recipientRef}>{recipient.name} — {recipient.purposes.map(readableLabel).join(', ')}. Fields: {recipient.fields.map(({ label, classification }) => `${label} (${classification})`).join(', ')}</li>)}</ul></div>
        <div><Text weight="semibold">What could change</Text><ul className="mt-2 grid gap-1 text-sm text-secondary">{route.effects.map((effect) => <li key={`${effect.kind}:${effect.reversibility}`}>{effectLabel(effect.kind)} — {reversibilityLabel(effect.reversibility)}</li>)}</ul></div>
        <div><Text weight="semibold">Evidence expected</Text><Text color="secondary" className="mt-1">{route.evidence.map(({ label }) => label).join(', ') || 'No completion evidence is declared.'}</Text></div>
        <div><Text weight="semibold">What still needs confirmation</Text><Text color="secondary" className="mt-1">{route.uncertainty.length === 0 ? 'No uncertainty is declared for this choice.' : route.uncertainty.map(uncertaintyLabel).join(', ')}</Text></div>
        <div><Text weight="semibold">Fallback</Text><Text color="secondary" className="mt-1">{route.fallback.available ? `${route.fallback.alternatives.length} alternative ${route.fallback.alternatives.length === 1 ? 'way is' : 'ways are'} available before work starts.` : 'No alternative way is currently declared.'}</Text></div>
        <div><Text weight="semibold">Cancellation</Text><Text color="secondary" className="mt-1">{route.cancellation.summary}</Text></div>
        <div><Text weight="semibold">Recovery by step</Text><ul className="mt-2 grid gap-1 text-sm text-secondary">{route.recovery.map((recovery) => <li key={recovery.step}>Step {recovery.step}, {recovery.businessName}: {recovery.posture === 'retry_safe' ? 'AE can safely retry after a confirmed failure.' : 'AE must check what happened before any retry.'}</li>)}</ul></div>
        <Text type="supporting" color="secondary">Confirmation code {confirmation.confirmationRef}</Text>
        <Button label="Start now" variant="primary" clickAction={start} />
      </div>
    </Card>
    <RecoveryActions edit={edit} restart={restart} />
  </section>
}

function RouteProgressCard({ projection, turns, refresh, cancel, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  refresh: () => Promise<void>
  cancel: () => Promise<void>
  edit: () => void
  restart: () => void
}) {
  const progress = projection.progress
  if (progress === undefined) return null
  const stateLabel = progress.current.state === 'queued'
    ? 'Waiting to begin'
    : progress.current.state === 'ready_to_contact'
      ? 'Preparing business contact'
      : progress.current.state === 'contacting'
      ? 'Contacting the business'
      : progress.current.state === 'awaiting_result'
        ? 'Waiting for the business result'
        : progress.current.state === 'completed'
          ? 'Business result checked'
          : 'Needs attention'
  return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <Card padding={5}>
      <div className="grid gap-4">
        <Text className="text-sm font-semibold text-accent">In progress</Text>
        <Heading level={2}>{projection.summary}</Heading>
        <Text weight="semibold">Step {progress.current.step} of {progress.total}</Text>
        <Text color="secondary">{stateLabel}</Text>
        {projection.activity === undefined ? null : <Text weight="semibold">
          {activityResponsibility(projection.activity.actor, projection.activity.certainty)}
        </Text>}
        <Text type="supporting" color="secondary">{progress.completed} of {progress.total} steps completed. Rechecking will not send the work again.</Text>
        {progress.dependencies === undefined ? null : <div className="grid gap-2 rounded-md border border-border bg-surface p-4">
          {progress.dependencies.completed.map(({ step, business }) => (
            <Text key={`completed:${step}`} type="supporting" color="secondary">Completed: {business}</Text>
          ))}
          {progress.dependencies.blocked.map(({ step, business, waitingForBusiness }) => (
            <Text key={`blocked:${step}`} type="supporting" color="secondary">
              Waiting: {business}, after {waitingForBusiness}
            </Text>
          ))}
        </div>}
        <Text type="supporting" color="secondary">AE is acting only within the choice you confirmed.</Text>
        {cancellationMessage(projection.activity?.cancellation)}
        <div className="flex flex-wrap gap-3">
          <Button label="Check progress" variant="primary" clickAction={refresh} />
          {cancellationAvailable(projection.activity?.cancellation)
            ? <Button label="Stop before the next step" variant="secondary" clickAction={cancel} />
            : null}
        </div>
        <RequestRecordLinks requestRef={projection.requestRef} />
        <RecoveryActions edit={edit} restart={restart} />
      </div>
    </Card>
  </section>
}

function cancellationAvailable(
  cancellation: NonNullable<CustomerRequestView['activity']>['cancellation'] | undefined,
): boolean {
  return cancellation === 'available_before_next_step'
    || (typeof cancellation === 'object' && cancellation.state === 'available')
}

function cancellationMessage(
  cancellation: NonNullable<CustomerRequestView['activity']>['cancellation'] | undefined,
) {
  if (typeof cancellation === 'object' && cancellation.state === 'available') {
    return <Text type="supporting" color="secondary">
      AE will not release the next business step before {new Date(cancellation.releaseMayStartAt).toISOString()}.
    </Text>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'pending') {
    return <div className="grid gap-1">
      <Text type="supporting" color="secondary">
        AE sent one stop request to the business. The business has not confirmed the outcome yet.
      </Text>
      <Text type="supporting" color="secondary">
        Check again after {new Date(cancellation.nextCheckAt).toISOString()}. AE will not send the stop request twice.
      </Text>
    </div>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'unknown') {
    return <div className="grid gap-1">
      <Text type="supporting" color="secondary">
        AE cannot yet confirm whether the business received or accepted the stop request.
      </Text>
      <Text type="supporting" color="secondary">
        AE will not repeat it while the outcome is unknown. Check again after {new Date(cancellation.nextCheckAt).toISOString()}.
      </Text>
    </div>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'rejected') {
    return <div className="grid gap-1">
      <Text type="supporting" color="secondary">
        The business declined the stop request. The current work may continue.
      </Text>
      <Text type="supporting" color="secondary">
        AE recorded the response at {new Date(cancellation.observedAt).toISOString()} and will not send the stop request twice.
      </Text>
    </div>
  }
  if (typeof cancellation !== 'object' || cancellation.state !== 'not_available'
    || cancellation.reason !== 'business_step_released') return null
  return <div className="grid gap-1">
    <Text type="supporting" color="secondary">
      {cancellation.requestedAt === undefined
        ? 'This business step has started, so AE can no longer stop it before release.'
        : 'You asked AE to stop, but the business step had already started.'}
    </Text>
    {cancellation.requestedAt === undefined ? null : <Text type="supporting" color="secondary">
      AE recorded your stop request at {new Date(cancellation.requestedAt).toISOString()}.
    </Text>}
  </div>
}

function ConfirmationLoadingCard() {
  return <Card padding={5} className="mx-auto w-full max-w-4xl" aria-live="polite" aria-busy="true">
    <div className="grid gap-5">
      <Skeleton height="1rem" width="8rem" index={0} />
      <Skeleton height="2.25rem" width="72%" index={1} />
      <Skeleton height="1rem" width="55%" index={2} />
      <div className="grid gap-4 sm:grid-cols-2"><Skeleton height="4rem" width="100%" index={3} /><Skeleton height="4rem" width="100%" index={4} /></div>
      <Skeleton height="7rem" width="100%" index={5} />
      <Text color="secondary">Confirming your choice. Nothing is being purchased, booked, or started.</Text>
    </div>
  </Card>
}

function DecisionChanges({ changes, routes }: {
  changes: Extract<NonNullable<CustomerRequestView['decision']>['changes'], { kind: 'changed' }>['items']
  routes: NonNullable<CustomerRequestView['decision']>['routes']
}) {
  const resultNames = new Map(routes.map(({ result }) => [result.resultRef, result.summary]))
  for (const change of changes) {
    if (change.kind !== 'route_result') continue
    for (const result of [...change.before.results, ...change.after.results]) {
      resultNames.set(result.resultRef, result.summary)
    }
  }
  return <Card padding={4}>
    <div className="grid gap-2">
      <Heading level={3}>What changed</Heading>
      <ul className="grid gap-1 text-sm text-secondary">
        {changes.map((change) => <li key={change.kind}>{decisionChangeLabel(change, resultNames)}</li>)}
      </ul>
    </div>
  </Card>
}

function decisionChangeLabel(
  change: Extract<NonNullable<CustomerRequestView['decision']>['changes'], { kind: 'changed' }>['items'][number],
  resultNames: ReadonlyMap<string, string>,
): string {
  if (change.kind === 'maximum_cost' && change.before.length === 1 && change.after.length === 1
    && change.before[0]?.cost.kind === 'known' && change.after[0]?.cost.kind === 'known') {
    return `The maximum for ${resultName(change.after[0].resultRef, resultNames)} changed from ${formatMoney(change.before[0].cost.currency, change.before[0].cost.amountMinor)} to ${formatMoney(change.after[0].cost.currency, change.after[0].cost.amountMinor)}.`
  }
  if (change.kind === 'maximum_cost') {
    return `Maximum costs changed. Before: ${costList(change.before, resultNames)}. Now: ${costList(change.after, resultNames)}.`
  }
  if (change.kind === 'route_result') {
    return `Ways forward changed. Before: ${resultList(change.before.results)}. Now: ${resultList(change.after.results)}.`
  }
  if (change.kind === 'businesses') {
    return `Businesses changed. Before: ${routeBusinessList(change.before, resultNames)}. Now: ${routeBusinessList(change.after, resultNames)}.`
  }
  if (change.kind === 'step_shape') {
    return `The sequence changed. Before: ${shapeList(change.before, resultNames)}. Now: ${shapeList(change.after, resultNames)}.`
  }
  if (change.kind === 'data_use') {
    return `Information sharing changed. Before: ${recipientList(change.before, resultNames)}. Now: ${recipientList(change.after, resultNames)}.`
  }
  if (change.kind === 'effects') {
    return `Consequences changed. Before: ${effectsList(change.before, resultNames)}. Now: ${effectsList(change.after, resultNames)}.`
  }
  if (change.kind === 'evidence') {
    return `Required evidence changed. Before: ${evidenceList(change.before, resultNames)}. Now: ${evidenceList(change.after, resultNames)}.`
  }
  if (change.kind === 'uncertainty') {
    return `Uncertainty changed. Before: ${uncertaintyList(change.before, resultNames)}. Now: ${uncertaintyList(change.after, resultNames)}.`
  }
  if (change.kind === 'expiry') {
    return `Availability changed. Before: ${dateList(change.before, resultNames)}. Now: ${dateList(change.after, resultNames)}.`
  }
  if (change.kind === 'fallback') {
    return `Fallbacks changed. Before: ${fallbackList(change.before, resultNames)}. Now: ${fallbackList(change.after, resultNames)}.`
  }
  if (change.kind === 'recovery') {
    return `Recovery changed. Before: ${recoveryList(change.before, resultNames)}. Now: ${recoveryList(change.after, resultNames)}.`
  }
  return `Cancellation changed. Before: ${cancellationList(change.before, resultNames)}. Now: ${cancellationList(change.after, resultNames)}.`
}

function costList(
  costs: readonly { resultRef: string; cost: NonNullable<CustomerRequestView['decision']>['routes'][number]['maximumTotalCost'] }[],
  names: ReadonlyMap<string, string>,
): string {
  return costs.map(({ resultRef, cost }) => `${resultName(resultRef, names)}: ${cost.kind === 'known'
    ? formatMoney(cost.currency, cost.amountMinor)
    : 'price needs confirmation'}`).join(', ') || 'none'
}

function routeBusinessList(
  routes: readonly { resultRef: string; businesses: readonly { name: string }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, businesses }) => (
    `${resultName(resultRef, names)}: ${businessList(businesses.map(({ name }) => name))}`
  )).join('; ') || 'none'
}

function resultList(results: readonly { summary: string; position?: number | undefined }[]): string {
  return results.map((result) => result.position === undefined
    ? result.summary
    : `${result.summary} (position ${result.position})`).join('; ') || 'none'
}

function shapeList(
  shapes: readonly { resultRef: string; steps: number; dependencies: number }[],
  names: ReadonlyMap<string, string>,
): string {
  return shapes.map(({ resultRef, steps, dependencies }) => (
    `${resultName(resultRef, names)}: ${steps} ${steps === 1 ? 'step' : 'steps'}, ${dependencies} ${dependencies === 1 ? 'dependency' : 'dependencies'}`
  )).join('; ') || 'none'
}

function recipientList(
  routes: readonly { resultRef: string; recipients: readonly { name: string; purposes: readonly string[] }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, recipients }) => `${resultName(resultRef, names)}: ${recipients
    .map(({ name, purposes }) => `${name} for ${purposes.map(readableLabel).join(', ')}`).join(', ') || 'none'}`)
    .join('; ') || 'none'
}

function effectsList(
  routes: readonly { resultRef: string; effects: readonly { kind: 'information_shared' | 'financial_commitment' | 'external_change'; reversibility: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible' }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, effects }) => `${resultName(resultRef, names)}: ${effects
    .map(({ kind, reversibility }) => `${effectLabel(kind)} (${reversibilityLabel(reversibility)})`).join(', ') || 'none'}`)
    .join('; ') || 'none'
}

function evidenceList(
  routes: readonly { resultRef: string; evidence: readonly { label: string; purpose: 'comparison' | 'completion' | 'recovery' }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, evidence }) => `${resultName(resultRef, names)}: ${evidence
    .map(({ label, purpose }) => `${label} for ${readableLabel(purpose)}`).join(', ') || 'none'}`)
    .join('; ') || 'none'
}

function uncertaintyList(
  routes: readonly { resultRef: string; uncertainty: readonly 'price_needs_confirmation'[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, uncertainty }) => `${resultName(resultRef, names)}: ${uncertainty
    .map(uncertaintyLabel).join(', ') || 'none'}`).join('; ') || 'none'
}

function dateList(
  values: readonly { resultRef: string; validUntil: number }[],
  names: ReadonlyMap<string, string>,
): string {
  return values.map(({ resultRef, validUntil }) => `${resultName(resultRef, names)}: ${formatOptionTime(validUntil)}`)
    .join(', ') || 'none'
}

function fallbackList(
  values: readonly { resultRef: string; alternatives: readonly { summary: string }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return values.map(({ resultRef, alternatives }) => `${resultName(resultRef, names)}: ${alternatives
    .map(({ summary }) => summary).join(', ') || 'none'}`).join('; ') || 'none'
}

function recoveryList(
  values: readonly { resultRef: string; steps: readonly { step: number; businessName: string; posture: 'retry_safe' | 'reconcile_required' }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return values.map(({ resultRef, steps }) => `${resultName(resultRef, names)}: ${steps.map((step) => (
    `step ${step.step}, ${step.businessName}: ${step.posture === 'retry_safe' ? 'safe retry' : 'check before retry'}`
  )).join(', ') || 'none'}`).join('; ') || 'none'
}

function cancellationList(
  values: readonly { resultRef: string; cancellation: { summary: string } }[],
  names: ReadonlyMap<string, string>,
): string {
  return values.map(({ resultRef, cancellation }) => `${resultName(resultRef, names)}: ${cancellation.summary}`)
    .join('; ') || 'none'
}

function resultName(resultRef: string, names: ReadonlyMap<string, string>): string {
  return names.get(resultRef)?.replace(/[.!?]+$/u, '') ?? 'This way forward'
}

function effectLabel(kind: 'information_shared' | 'financial_commitment' | 'external_change'): string {
  if (kind === 'information_shared') return 'Information would be shared'
  if (kind === 'financial_commitment') return 'A financial commitment could be created'
  return 'An external change could be made'
}

function reversibilityLabel(value: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible'): string {
  if (value === 'not_applicable') return 'reversal does not apply'
  if (value === 'reversible') return 'reversible'
  if (value === 'conditional') return 'reversal depends on conditions'
  return 'cannot be reversed automatically'
}

function uncertaintyLabel(value: 'price_needs_confirmation'): string {
  return value === 'price_needs_confirmation' ? 'Price needs confirmation' : value
}

function businessList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? 'Registered business'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

function readableLabel(value: string): string {
  const words = value.replace(/[_-]+/gu, ' ').trim()
  return words.length === 0 ? value : `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`
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

function NoOptions({ projection, turns, edit, restart }: { projection: CustomerRequestView; turns: readonly ConversationTurn[]; edit: () => void; restart: () => void }) { return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={projection} correct={edit} /><Card padding={5}><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">No matching options right now</Text><Heading level={2}>Nothing available matched your request.</Heading><Text color="secondary">Your Request is preserved. You can change what matters, try again later, or stop; AE will not invent availability.</Text><Text type="supporting" color="secondary">Request revision {projection.revision}</Text><RecoveryActions edit={edit} restart={restart} /></div></Card></section> }
function ActionStatusCard({ projection, turns, refresh, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  refresh: () => Promise<void>
  edit: () => void
  restart: () => void
}) {
  const action = projection.action
  if (action === undefined) return null
  const unknown = action.state === 'unknown'
  const failed = action.state === 'failed'
  const notSent = failed && action.resolution === 'not_sent'
  const partialResult = unknown && isPartialResult(action.result)
  const multipleBusinesses = (projection.businesses?.length ?? 0) > 1
  const explanation = unknown
    ? multipleBusinesses
      ? 'The Request is preserved while AE checks evidence from the businesses. There will be no automatic retry.'
      : 'The Request is preserved while AE checks evidence from the business. There will be no automatic retry.'
    : notSent
      ? (projection.progress?.completed ?? 0) > 0
        ? 'No further business action occurred. Review the completed work before deciding what to do next.'
        : 'No business action occurred. Review or revise your request before trying another option.'
    : failed
      ? 'The failure is final for this action. AE did not send it again.'
      : action.resolution === 'reconciled'
        ? multipleBusinesses
          ? 'AE confirmed this from later evidence supplied by the same business connections.'
          : 'AE confirmed this from later evidence supplied by the same business connection.'
        : multipleBusinesses
          ? 'AE validated the result returned by the businesses.'
          : 'AE validated the result returned by the business.'
  return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <Card padding={5}>
      <div className="grid gap-4">
        <Text className="text-sm font-semibold text-accent">
          {unknown ? 'Still confirming' : failed ? 'Could not be completed' : 'Completed'}
        </Text>
        <Heading level={2}>{projection.summary}</Heading>
        <Text color="secondary">{explanation}</Text>
        {projection.activity === undefined ? null : <Text weight="semibold">
          {activityResponsibility(projection.activity.actor, projection.activity.certainty)}
        </Text>}
        {projection.businesses === undefined ? null : <Text color="secondary">
          Through {businessList(projection.businesses.map(({ name }) => name))}
        </Text>}
        {projection.progress === undefined || projection.progress.completed === 0 ? null : <div className="rounded-md border border-border bg-surface p-4">
          <Text weight="semibold">{projection.progress.completed} of {projection.progress.total} business steps completed.</Text>
          <Text type="supporting" color="secondary" className="mt-1">{unknown
            ? 'AE will not repeat the step whose result is still being confirmed.'
            : 'Completed steps remain recorded and will not be repeated automatically.'}</Text>
        </div>}
        {action.result === undefined || notSent ? null : <div className="rounded-md border border-border bg-surface p-4">
          <Text type="supporting" weight="semibold">{partialResult ? 'Partial result received' : 'Business result'}</Text>
          <Text color="secondary" className="mt-1">{readableResult(action.result)}</Text>
          {partialResult ? <Text type="supporting" color="secondary" className="mt-1">
            This is preserved evidence, not a completed result.
          </Text> : null}
        </div>}
        <Text type="supporting" color="secondary">
          Last checked {new Date(action.observedAt).toLocaleString()}
        </Text>
        {projection.activity?.nextCheckAt === undefined ? null : <Text type="supporting" color="secondary">
          Check again after {new Date(projection.activity.nextCheckAt).toLocaleString()}.
        </Text>}
        {unknown ? <Button label="Check again" variant="primary" clickAction={refresh} /> : null}
        <RequestRecordLinks requestRef={projection.requestRef} />
        {unknown
          ? <Text weight="semibold">Wait for confirmation before changing or starting this Request again.</Text>
          : <RecoveryActions edit={edit} restart={restart} />}
      </div>
    </Card>
  </section>
}

function CancelledStatusCard({ projection, turns, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  edit: () => void
  restart: () => void
}) {
  const progress = projection.progress
  return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <Card padding={5}>
      <div className="grid gap-4">
        <Text className="text-sm font-semibold text-accent">Stopped</Text>
        <Heading level={2}>{projection.summary}</Heading>
        {progress === undefined ? null : <>
          <Text weight="semibold">{progress.completed} of {progress.total} business steps completed.</Text>
          <Text color="secondary">Step {progress.current.step} did not begin. Completed work remains recorded and will not be repeated automatically.</Text>
        </>}
        <RequestRecordLinks requestRef={projection.requestRef} />
        <RecoveryActions edit={edit} restart={restart} />
      </div>
    </Card>
  </section>
}

function activityResponsibility(
  actor: NonNullable<CustomerRequestView['activity']>['actor'],
  certainty: NonNullable<CustomerRequestView['activity']>['certainty'],
): string {
  if (actor === 'business') {
    return certainty === 'unknown' ? 'Waiting on the business for evidence' : 'Waiting on the business'
  }
  if (actor === 'customer') return 'Waiting on you'
  if (actor === 'none') return 'No action is required'
  if (certainty === 'unknown') return 'AE is checking for evidence'
  return 'AE is handling the next step'
}

function RequestRecordLinks({ requestRef }: { requestRef: string }) {
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

function ProblemReplyForm({
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

function isPartialResult(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && 'kind' in value && value.kind === 'partial_result' && 'output' in value
}

function DisclosureReview({ projection, turns, authorize, edit, restart }: { projection: CustomerRequestView; turns: readonly ConversationTurn[]; authorize: () => Promise<void>; edit: () => void; restart: () => void }) { const review = projection.disclosureReview; if (review === undefined) return null; return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={projection} correct={edit} /><Card padding={5}><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">Before AE contacts businesses</Text><Heading level={2}>Review what would be shared</Heading><Text color="secondary">To {review.purpose.toLocaleLowerCase()}, AE would share the following with up to {review.maximumRecipients} matching {review.maximumRecipients === 1 ? 'business' : 'businesses'}.</Text><ul className="grid gap-2">{review.categories.map((category) => <li key={`${category.label}:${category.classification}`} className="rounded-md border border-border bg-surface px-3 py-2"><strong>{category.label}</strong> <span className="text-secondary">· {category.classification}</span></li>)}</ul><Text weight="semibold">Nothing has been shared. Explicit permission is required before preparation can continue.</Text><Button label="Allow this comparison" variant="primary" clickAction={authorize} /><RecoveryActions edit={edit} restart={restart} /></div></Card></section> }
function WorkingUnderstanding({ projection, correct }: { projection: CustomerRequestView; correct: () => void }) { const criteria = projection.criteria ?? []; if (criteria.length === 0) return null; return <Card padding={4}><div className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><Text className="text-sm font-semibold text-accent">AE’s working understanding</Text></div><button type="button" onClick={correct} className="min-h-11 text-sm font-semibold underline underline-offset-4">Correct</button></div><div className="grid gap-2">{criteria.map((criterion) => <div key={`${criterion.label}:${workingCriterionValue(criterion.value)}`} className="rounded-md border border-border bg-surface px-3 py-2 text-sm"><div><strong>{workingCriterionLabel(criterion.label, criterion.value, projection.summary)}:</strong> {workingCriterionValue(criterion.value)}</div><Text type="supporting" color="secondary">{criterion.basis === 'customer_provided' ? 'You said this.' : 'Understood from your request.'} Used to decide which options fit and how they compare.</Text></div>)}</div></div></Card> }

function workingCriterionValue(value: unknown): string {
  if (value === null) return 'Not specified'
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(workingCriterionValue).join(', ')
  const entries = Object.entries(value)
  const currency = entries.find(([key]) => key === 'currency')?.[1]
  const amountMinor = entries.find(([key]) => key === 'amountMinor')?.[1]
  if (typeof currency === 'string' && typeof amountMinor === 'number') return formatMoney(currency, amountMinor)
  return entries.map(([key, entry]) => `${key.replaceAll('_', ' ')}: ${workingCriterionValue(entry)}`).join(', ')
}

function workingCriterionLabel(label: string, value: unknown, requestSummary: string): string {
  if (!label.trim().endsWith('?')) return label
  return value === requestSummary ? 'Request' : 'Request detail'
}
function RecoveryActions({ edit, restart }: { edit: () => void; restart: () => void }) { return <div className="flex flex-wrap gap-3 border-t border-border pt-4"><Button label="Edit this Request" variant="secondary" clickAction={edit} /><Button label="Start a new Request" variant="ghost" clickAction={restart} /></div> }

function StartExamples() { return <div className="grid gap-2 border-t border-border pt-6 sm:grid-cols-4"><Example label="Place" value="Fremantle" /><Example label="Business type" value="Electrician" /><Example label="Situation" value="A quiet dinner with my parents" /><Example label="Detailed" value="Dog-friendly stay near the beach" /></div> }
function Example({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 rounded-md bg-surface p-4"><Text type="supporting" weight="semibold">{label}</Text><Text color="secondary">{value}</Text></div> }
function Conversation({ turns }: { turns: readonly ConversationTurn[] }) { return <div className="grid gap-3" aria-label="Request conversation">{turns.map((turn, index) => turn.speaker === 'customer' ? <div key={`${index}:${turn.text}`} className="ml-auto max-w-[85%] rounded-md bg-accent px-4 py-3 text-on-accent">{turn.text}</div> : <div key={`${index}:${turn.text}`} className="max-w-[90%] border-l-2 border-accent py-1 pl-4"><Text className="text-sm font-semibold text-accent">AE</Text><Heading level={2} className="mt-1">{customerFacingAeTurn(turn.text)}</Heading></div>)}</div> }
function Clarification({ prompt, answer, setAnswer, submit }: { prompt: string; answer: string; setAnswer: (answer: string) => void; submit: () => void }) { return <form className="border-t border-border pt-5" onSubmit={(event) => { event.preventDefault(); submit() }}><label htmlFor="clarification-answer" className="sr-only">{prompt}</label><div className="flex flex-col gap-2 sm:flex-row"><input id="clarification-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Add a detail…" className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 outline-none focus:ring-2 focus:ring-accent" /><button type="submit" disabled={!answer.trim()} className="min-h-11 rounded-md bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">Continue</button></div></form> }

function customerClarificationPrompt(clarification: CustomerClarification): string {
  return customerFacingAeTurn(clarification.prompt)
}

function customerFacingAeTurn(text: string): string {
  const prompt = text.trim()
  return prompt.endsWith('?') ? prompt : 'What else should AE know to find the right options?'
}
function statusLabel(state: CustomerRequestView['state']): string {
  if (state === 'ready_to_compare') return 'Ready to compare'
  if (state === 'needs_information') return 'More information needed'
  if (state === 'preparing_options') return 'Checking connected businesses'
  if (state === 'needs_attention') return 'Needs attention'
  if (state === 'outcome_unknown') return 'Still confirming'
  if (state === 'completed') return 'Completed'
  if (state === 'failed') return 'Could not be completed'
  if (state === 'no_options') return 'No matching options'
  if (state === 'needs_authorization') return 'Permission needed'
  return state === 'options_ready' ? 'Available options' : 'Not supported yet'
}

function readableResult(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if ('kind' in value && value.kind === 'partial_result' && 'output' in value) {
      return readableResult(value.output)
    }
    const first = Object.values(value).find((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
    if (first !== undefined) return String(first)
  }
  return 'Evidence is available for this result.'
}
function formatMoney(currency: string, amountMinor: number): string { return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amountMinor / 100) }
function formatOptionTime(timestamp: number): string { return optionTimeFormatter.format(timestamp) }
function errorState(status: number, message: string): WorkspaceState { return { kind: 'error', message: status === 401 ? 'Sign in so AE can keep this request private and resumable.' : message, authenticationRequired: status === 401 } }

function readStoredRequestIdentity(): BrowserRequestIdentity | undefined {
  try {
    const raw = window.localStorage.getItem(ACTIVE_REQUEST_STORAGE_KEY)
    if (raw === null) return undefined
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || !boundedIdentityPart(value.requestRef)) {
      forgetStoredRequestIdentity()
      return undefined
    }
    return { requestRef: value.requestRef, agentRef: `web:${crypto.randomUUID()}` }
  } catch { return undefined }
}

function rememberRequestIdentity(requestRef: string): void {
  try { window.localStorage.setItem(ACTIVE_REQUEST_STORAGE_KEY, JSON.stringify({ requestRef })) } catch { /* optional browser pointer */ }
}

function forgetStoredRequestIdentity(): void {
  try { window.localStorage.removeItem(ACTIVE_REQUEST_STORAGE_KEY) } catch { /* optional browser pointer */ }
}

function boundedIdentityPart(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
