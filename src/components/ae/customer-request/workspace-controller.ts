import { useEffect, useRef, useState } from 'react'
import {
  customerRequestAgentResultSchema,
  customerRequestConflictSchema,
  type CustomerRequestAgentResult,
} from '@/modules/customer-request/agent-contract'
import { customerFacingAeTurn } from './panels/shared/prompts'
import { isRecord } from '@/modules/common/is-record'
import {
  resolveReplacementCommandKey,
  type ReplacementCommandIdentity,
} from '@/modules/customer-request/replacement-command-key'
import { fetchBrowserRequestWithInterpreterRecovery } from '@/modules/customer-request/browser-submit-recovery'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import type {
  BrowserRequestIdentity,
  ConversationTurn,
  SubmitResponse,
  WorkspaceState,
} from './workspace-types'

const ACTIVE_REQUEST_STORAGE_KEY = 'ae.customer-request.active:v1'

/** A saved Request stops being offered after this, so a stale pointer cannot
 * keep greeting someone who has moved on. */
const RESUME_OFFER_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000

type StoredRequestPointer = Readonly<{ requestRef: string; summary?: string }>

type CustomerRequestWorkspaceControllerProps = Readonly<{
  initialNeed: string
}>

export function useCustomerRequestWorkspaceController({
  initialNeed,
}: CustomerRequestWorkspaceControllerProps) {
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
        : [{ speaker: 'ae', text: customerFacingAeTurn(result.clarification.prompt) }])
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
          speaker: 'ae' as const, text: customerFacingAeTurn(result.clarification.prompt),
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
        ...current, { speaker: 'ae', text: customerFacingAeTurn(nextClarification.prompt) },
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
      if (!response.ok) {
        const body = await readJsonBody(response)
        const conflict = customerRequestConflictSchema.safeParse(body)
        if (conflict.success) {
          setState({ kind: 'conflict', projection, reason: conflict.data.reason })
        } else {
          setState(errorState(
            response.status,
            readProblemDetail(body, response.status)
              ?? 'AE could not prepare comparable options for this request.',
          ))
        }
        return
      }
      const result = customerRequestAgentResultSchema.safeParse(await readJsonBody(response))
      if (result.success && result.data.kind === 'request') {
        setState({ kind: 'request', projection: result.data })
      } else {
        setState(errorState(response.status, 'AE could not prepare comparable options for this request.'))
      }
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
      if (!response.ok) {
        const body = await readJsonBody(response)
        const conflict = customerRequestConflictSchema.safeParse(body)
        if (conflict.success) {
          setState({ kind: 'conflict', projection, reason: conflict.data.reason })
        } else {
          setState(errorState(
            response.status,
            readProblemDetail(body, response.status)
              ?? 'AE could not confirm this choice. Nothing was started.',
          ))
        }
        return
      }
      const result = customerRequestAgentResultSchema.safeParse(await readJsonBody(response))
      if (result.success && result.data.kind === 'request') {
        setState({ kind: 'request', projection: result.data })
      } else {
        setState(errorState(response.status, 'AE could not confirm this choice. Nothing was started.'))
      }
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

  return {
    need,
    setNeed,
    answer,
    setAnswer,
    state,
    turns,
    editingRevision,
    routeFeedback,
    setRouteFeedback,
    resumeOffer,
    dismissResumeOffer,
    resumeStoredRequest,
    submit,
    compare,
    reviewRoute,
    leaveRouteReview,
    reportRouteUnavailable,
    continueRequest,
    authorize,
    confirmRoute,
    refresh,
    actOnRoute,
    edit,
    restart,
  }
}

function errorState(status: number, message: string): WorkspaceState {
  return {
    kind: 'error',
    message: status === 401 ? 'Sign in so AE can keep this request private and resumable.' : message,
    authenticationRequired: status === 401,
  }
}

async function readJsonBody(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await response.json()
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function readProblemDetail(value: unknown, status: number): string | undefined {
  if (
    !isRecord(value)
    || value.type !== 'about:blank'
    || value.status !== status
    || typeof value.code !== 'string'
    || typeof value.detail !== 'string'
  ) return undefined
  const detail = value.detail.trim()
  return detail.length === 0 ? undefined : detail
}

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
