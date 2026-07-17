import { useEffect, useRef, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Link } from '@astryxdesign/core/Link'
import { Heading, Text } from '@astryxdesign/core/Text'

import type { CustomerRequestProjection, CustomerRequestView } from '@/modules/customer-request/customer-projection'
import { CUSTOMER_REQUEST_PUBLIC_COMPREHENSION } from '@/modules/customer-request/public-comprehension'
import {
  resolveReplacementCommandKey,
  type ReplacementCommandIdentity,
} from '@/modules/customer-request/replacement-command-key'
import { fetchBrowserRequestWithInterpreterRecovery } from '@/modules/customer-request/browser-submit-recovery'
import { RequestResult } from './panels'
import { customerClarificationPrompt } from './panels/shared'
import type {
  BrowserRequestIdentity,
  ConversationTurn,
  SubmitResponse,
  WorkspaceState,
} from './workspace-types'

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
  const [routeFeedback, setRouteFeedback] = useState('')
  const requestIdentityRef = useRef<BrowserRequestIdentity | undefined>(undefined)
  const replacementCommandRef = useRef<ReplacementCommandIdentity | undefined>(undefined)
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
      const requestBody = replacing
        ? (() => {
            const replacementCommand = resolveReplacementCommandKey(replacementCommandRef.current, {
              requestRef: identity.requestRef,
              expectedRevision: editingRevision,
              message: need.trim(),
              mode: 'replace',
            }, () => crypto.randomUUID())
            replacementCommandRef.current = replacementCommand
            return {
              idempotencyKey: replacementCommand.idempotencyKey,
              expectedRevision: editingRevision, message: need.trim(), mode: 'replace' as const,
            }
          })()
        : {
            idempotencyKey: `submit:${identity.requestRef}:0`, requestRef: identity.requestRef,
            agentRef: identity.agentRef, request: need.trim(), routing: { network: 'ae:public' },
          }
      const requestInit = {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
      const response = await fetchBrowserRequestWithInterpreterRecovery(endpoint, requestInit)
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
      if (replacing && result.revision !== editingRevision) replacementCommandRef.current = undefined
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
    replacementCommandRef.current = undefined
    requestIdentityRef.current = undefined
    forgetStoredRequestIdentity()
    setState({ kind: 'idle' })
  }

  function reviewRoute(projection: CustomerRequestView, routeRef: string) {
    setRouteFeedback('')
    setState({ kind: 'reviewing', projection, routeRef })
  }

  function leaveRouteReview(projection: CustomerRequestView) {
    setRouteFeedback('')
    setState({ kind: 'request', projection })
  }

  async function reportRouteUnavailable(projection: CustomerRequestView, routeRef: string) {
    const message = routeFeedback.trim()
    if (message.length === 0) return
    setState({ kind: 'submitting' })
    try {
      const response = await fetchBrowserRequestWithInterpreterRecovery(
        `/api/requests/${encodeURIComponent(projection.requestRef)}/messages`,
        {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `report-option:${projection.requestRef}:${projection.revision}:${crypto.randomUUID()}`,
          expectedRevision: projection.revision,
          message,
          reportedRouteRef: routeRef,
        }),
        },
      )
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        setState(errorState(response.status, 'AE could not record why this option does not work. Nothing was confirmed or shared.'))
        return
      }
      setRouteFeedback('')
      setTurns((current) => [...current, { speaker: 'customer', text: message }])
      setState({ kind: 'request', projection: result })
    } catch {
      setState({
        kind: 'error',
        message: 'AE could not be reached. The option remains unconfirmed and nothing was shared.',
        authenticationRequired: false,
      })
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
      const isContractFact = clarification.kind === 'contract_fact'
      const endpoint = `/api/requests/${encodeURIComponent(projection.requestRef)}/${isContractFact ? 'facts' : 'messages'}`
      const requestInit = {
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
        }
      const response = isContractFact
        ? await fetch(endpoint, requestInit)
        : await fetchBrowserRequestWithInterpreterRecovery(endpoint, requestInit)
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
        <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">What do you need to make happen?</Heading>
        <Text type="large" color="secondary">{CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.situation}</Text>
        <Text color="secondary">{CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.examples}</Text>
        <Text type="supporting" color="secondary">{CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.support}</Text>
        <Text type="supporting" color="secondary">{CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.sandboxBoundary}</Text>
        <Text type="supporting" color="secondary">{CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.authority}</Text>
        <Link href="/for-agents" className="mx-auto min-h-11 py-2 font-semibold">Use AE with your AI</Link>
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
          <textarea id="customer-need" value={need} onChange={(event) => setNeed(event.target.value)} rows={2} maxLength={2_000} required placeholder="Describe the outcome, constraints, and timing you already know" className="min-h-16 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-lg text-primary outline-none focus:ring-2 focus:ring-accent" />
          <button type="submit" disabled={need.trim().length === 0} className="min-h-11 self-end rounded-md bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">Start my Request</button>
        </form>
        <Text type="supporting" color="secondary" className="text-center">No budget or full specification required. Keep contact, payment, and account details until AE asks for them.</Text>
        {editingRevision !== undefined ? <Text type="supporting" color="secondary">Editing revision {editingRevision} of this Request.</Text> : null}
        {state.kind === 'error' ? <RequestResult state={state} compare={compare} reviewRoute={reviewRoute} leaveRouteReview={leaveRouteReview} reportRouteUnavailable={reportRouteUnavailable} confirmRoute={confirmRoute} actOnRoute={actOnRoute} authorize={authorize} refresh={refresh} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} routeFeedback={routeFeedback} setRouteFeedback={setRouteFeedback} turns={turns} /> : null}
      </section> : <RequestResult state={state} compare={compare} reviewRoute={reviewRoute} leaveRouteReview={leaveRouteReview} reportRouteUnavailable={reportRouteUnavailable} confirmRoute={confirmRoute} actOnRoute={actOnRoute} authorize={authorize} refresh={refresh} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} routeFeedback={routeFeedback} setRouteFeedback={setRouteFeedback} turns={turns} />}
    </main>
  )
}

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

