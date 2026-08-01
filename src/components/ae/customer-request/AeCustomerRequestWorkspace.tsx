import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { projectCustomerRequestDecisionRecords } from '@/modules/customer-request/application/public'
import { CUSTOMER_REQUEST_HUMAN_COMPREHENSION } from '@/modules/customer-request/public-comprehension'
import { DIALOG_WELCOME } from '@/content/brand-copy'
import { cn } from '@/lib/utils'
import {
  resolveReplacementCommandKey,
  type ReplacementCommandIdentity,
} from '@/modules/customer-request/replacement-command-key'
import { fetchBrowserRequestWithInterpreterRecovery } from '@/modules/customer-request/browser-submit-recovery'
import { AeDecisionTrail } from '../plan/AeDecisionTrail'
import { RequestResult } from './panels'
import { customerClarificationPrompt } from './panels/shared'
import type {
  CustomerRequestProjection,
  CustomerRequestView,
} from '@/modules/customer-request/customer-projection'
import type {
  BrowserRequestIdentity,
  ConversationTurn,
  SubmitResponse,
  WorkspaceState,
} from './workspace-types'

const ACTIVE_REQUEST_STORAGE_KEY = 'ae.customer-request.active:v1'

/** A saved Request stops being offered after this, so a stale pointer cannot
 *  keep greeting someone who has moved on. */
const RESUME_OFFER_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000

type StoredRequestPointer = Readonly<{ requestRef: string; summary?: string }>

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

  // Arriving is not a request to resume. The front door renders immediately and
  // a saved Request is offered, never reopened on the visitor's behalf.
  const [resumeOffer, setResumeOffer] = useState<StoredRequestPointer | undefined>(undefined)
  useEffect(() => {
    if (initialNeed.trim().length > 0) return
    setResumeOffer(readStoredRequest())
  }, [initialNeed])

  function dismissResumeOffer() {
    setResumeOffer(undefined)
    forgetStoredRequestIdentity()
  }

  async function resumeStoredRequest(pointer: StoredRequestPointer) {
    const identity = browserIdentityFor(pointer.requestRef)
    requestIdentityRef.current = identity
    setResumeOffer(undefined)
    setState({ kind: 'resuming' })
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(identity.requestRef)}`, {
        method: 'GET', headers: { Accept: 'application/json' },
      })
      const result: SubmitResponse = await response.json()
      if (!response.ok || !('kind' in result) || result.kind !== 'request') {
        if (response.status === 404) {
          requestIdentityRef.current = undefined
          forgetStoredRequestIdentity()
        }
        // The composer sits above this message, so do not send the reader down.
        setState(errorState(response.status, 'AE could not reopen this Request. Start a new one above.'))
        return
      }
      setNeed(result.summary)
      setTurns(result.clarification === undefined
        ? []
        : [{ speaker: 'ae', text: customerClarificationPrompt(result.clarification) }])
      setState({ kind: 'request', projection: result })
    } catch {
      setState({
        kind: 'error', message: 'AE could not be reached. Your Request is still saved in this browser.',
        authenticationRequired: false,
      })
    }
  }

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
        setState(errorState(response.status, 'AE could not start this request. Try again from the form above.'))
        return
      }
      setTurns([
        { speaker: 'customer', text: need.trim() },
        ...(result.clarification === undefined ? [] : [{
          speaker: 'ae' as const, text: customerClarificationPrompt(result.clarification),
        }]),
      ])
      rememberRequestIdentity(result.requestRef, result.summary)
      if (replacing && result.revision !== editingRevision) replacementCommandRef.current = undefined
      setEditingRevision(undefined)
      setState({ kind: 'request', projection: result })
    } catch {
      setState({ kind: 'error', message: 'AE could not be reached. Try submitting again.', authenticationRequired: false })
    } finally {
      submittingRef.current = false
    }
  }

  function edit(projection: CustomerRequestView) {
    setEditingRevision(projection.revision)
    setState({ kind: 'idle' })
  }

  function restart() {
    setResumeOffer(undefined)
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
        setState(errorState(response.status, 'AE could not record why this option does not work. Your request is unchanged.'))
        return
      }
      setRouteFeedback('')
      setTurns((current) => [...current, { speaker: 'customer', text: message }])
      setState({ kind: 'request', projection: result })
    } catch {
      setState({
        kind: 'error',
        message: 'AE could not be reached. Your request is unchanged. Try again.',
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
      setState({ kind: 'error', message: 'AE could not be reached. No option was selected. Try again.', authenticationRequired: false })
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
        setState(errorState(response.status, 'AE could not record that permission. Try again.'))
        return
      }
      setState({ kind: 'request', projection: result })
    } catch {
      setState({ kind: 'error', message: 'AE could not record that permission. Try again.', authenticationRequired: false })
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

  const showStartHeader = state.kind === 'idle' || state.kind === 'error'

  // Idle is the front door and gets the whole viewport; once there is a Request
  // to read, the surface becomes a document and starts at the top.
  return (
    <main className={cn('mx-auto grid min-w-0 w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:py-14', showStartHeader ? 'min-h-[calc(100dvh-9rem)] content-center' : 'content-start')}>
      {showStartHeader ? <header className="mx-auto grid max-w-3xl gap-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{DIALOG_WELCOME.heading}</h1>
        <p className="block text-lg text-muted-foreground">{CUSTOMER_REQUEST_HUMAN_COMPREHENSION.situation}</p>
      </header> : null}

      {showStartHeader && resumeOffer !== undefined ? <Card className="mx-auto w-full max-w-3xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="block font-semibold">You have a Request saved on this device.</p>
            {resumeOffer.summary === undefined
              ? null
              : <p className="mt-1 block text-sm text-muted-foreground">{resumeOffer.summary}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => void resumeStoredRequest(resumeOffer)}>Pick it up</Button>
            <Button type="button" variant="ghost" onClick={dismissResumeOffer}>Discard</Button>
          </div>
        </div>
      </Card> : null}

      {state.kind === 'request' && state.projection.recovery?.state === 'restored'
        ? <Card className="mx-auto w-full max-w-4xl p-3" aria-live="polite">
            <p className="text-muted-foreground">{state.projection.recovery.reason === 'choice_expired'
              ? 'AE restored this Request. The earlier choice expired, so no work was authorized or restarted.'
              : 'AE restored the latest saved state for this Request. Checking it did not restart the work.'}</p>
          </Card>
        : null}

      {state.kind === 'idle' || state.kind === 'error' ? <section className="mx-auto grid w-full max-w-3xl gap-5" aria-label="Start a request">
        {/* The composer is the object on this surface, not a field beside a
            button. Controls live inside the field the way an answer-engine
            input does, so nothing competes with the one thing to do. */}
        <form
          onSubmit={(event) => { event.preventDefault(); void submit() }}
          className="grid min-w-0 gap-3 rounded-2xl border border-border bg-card p-4 shadow-low transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:shadow-medium"
        >
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel className="sr-only" htmlFor="customer-need">What are you looking for?</FieldLabel>
              <Textarea
                id="customer-need"
                value={need}
                onChange={(event) => setNeed(event.target.value)}
                rows={2}
                maxLength={2_000}
                required
                placeholder="A burst pipe in Parramatta, someone today, under $500"
                className="min-h-16 min-w-0 resize-none"
              />
            </Field>
            <Field orientation="horizontal" className="justify-end">
              <Button type="submit" variant="default" disabled={need.trim().length === 0} className="min-h-11 rounded-full px-6">
                Find options
              </Button>
            </Field>
          </FieldGroup>
        </form>
        {editingRevision !== undefined ? <p className="block text-sm text-muted-foreground">Editing revision {editingRevision} of this Request.</p> : null}
        {/* The terms stay reachable and complete, one click away, instead of
            forming a wall of qualifiers between the promise and the input. The
            trigger hugs its label; a full-width row strands the chevron. */}
        <div className="mx-auto max-w-md">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="text-sm font-semibold">How AE works</CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="grid gap-2 pt-3 text-start">
                {[
                  CUSTOMER_REQUEST_HUMAN_COMPREHENSION.examples,
                  CUSTOMER_REQUEST_HUMAN_COMPREHENSION.support,
                  CUSTOMER_REQUEST_HUMAN_COMPREHENSION.authority,
                  'AE asks for details only when the option needs them.',
                ].map((line) => <li key={line}>
                  <p className="text-sm text-muted-foreground">{line}</p>
                </li>)}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </div>
        {state.kind === 'error' ? <RequestResult state={state} compare={compare} reviewRoute={reviewRoute} leaveRouteReview={leaveRouteReview} reportRouteUnavailable={reportRouteUnavailable} confirmRoute={confirmRoute} actOnRoute={actOnRoute} authorize={authorize} refresh={refresh} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} routeFeedback={routeFeedback} setRouteFeedback={setRouteFeedback} turns={turns} /> : null}
      </section> : <><RequestResult state={state} compare={compare} reviewRoute={reviewRoute} leaveRouteReview={leaveRouteReview} reportRouteUnavailable={reportRouteUnavailable} confirmRoute={confirmRoute} actOnRoute={actOnRoute} authorize={authorize} refresh={refresh} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} routeFeedback={routeFeedback} setRouteFeedback={setRouteFeedback} turns={turns} /><RequestDecisionTrail state={state} /></>}
    </main>
  )
}

function RequestDecisionTrail({ state }: Readonly<{ state: WorkspaceState }>) {
  if (!('projection' in state)) return null
  return <AeDecisionTrail decisions={projectCustomerRequestDecisionRecords(state.projection)} />
}

function errorState(status: number, message: string): WorkspaceState { return { kind: 'error', message: status === 401 ? 'Sign in so AE can keep this request private and resumable.' : message, authenticationRequired: status === 401 } }
/**
 * The stored pointer carries enough to *offer* a continuation without asking
 * the network: the reference, a short label, and when it was saved. Arriving at
 * AE must never spend a request, or start work, on something the visitor did
 * not ask for.
 */
function readStoredRequest(): StoredRequestPointer | undefined {
  try {
    const raw = window.localStorage.getItem(ACTIVE_REQUEST_STORAGE_KEY)
    if (raw === null) return undefined
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || !boundedIdentityPart(value.requestRef)) {
      forgetStoredRequestIdentity()
      return undefined
    }
    const savedAt = typeof value.savedAt === 'number' ? value.savedAt : 0
    if (savedAt > 0 && Date.now() - savedAt > RESUME_OFFER_LIFETIME_MS) {
      forgetStoredRequestIdentity()
      return undefined
    }
    return {
      requestRef: value.requestRef,
      ...(boundedIdentityPart(value.summary) ? { summary: value.summary } : {}),
    }
  } catch { return undefined }
}
function browserIdentityFor(requestRef: string): BrowserRequestIdentity {
  return { requestRef, agentRef: `web:${crypto.randomUUID()}` }
}
function rememberRequestIdentity(requestRef: string, summary: string): void {
  try {
    window.localStorage.setItem(ACTIVE_REQUEST_STORAGE_KEY, JSON.stringify({
      requestRef, summary: summary.slice(0, 200), savedAt: Date.now(),
    }))
  } catch { /* optional browser pointer */ }
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

