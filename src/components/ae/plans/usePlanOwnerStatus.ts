import { useAuth } from '@clerk/tanstack-react-start'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { readOwnerPlanServer } from '@/modules/capability-execution/plan/owner.functions'
import type { OwnerPlanPageRead } from '@/modules/capability-execution/plan/owner.contracts'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

type PlanReadState = Readonly<{
  scope: string | null
  result?: OwnerPlanPageRead
  stale: boolean
  pending: boolean
  problem?: string
}>
const READ_FAILURE = 'The latest status could not be read. Last confirmed results remain visible. Check status before making another decision.'

function isAccessDenial(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : ''
  return /plan_access_denied|authentication_required|unauthenticated|unauthorized|forbidden|sign in/iu.test(message)
}

/** Retained facts are display-only after a failed read, never approval/cancellation authority. */
export function usePlanOwnerStatus(initial: OwnerPlanPageRead, planRef: string, decisionPending: boolean) {
  const auth = useAuth()
  const scope = auth.isLoaded && auth.isSignedIn
    ? JSON.stringify([planRef, auth.userId, auth.sessionId, auth.orgId ?? null]) : null
  const [state, setState] = useState<PlanReadState>(() => ({
    scope, ...(scope === null ? {} : { result: initial }), stale: false, pending: false,
  }))
  const activeScope = useRef(scope)
  useLayoutEffect(() => { activeScope.current = scope }, [scope])
  const requests = useRef(new Set<string>())
  const loaderResult = useRef(initial)
  const current = state.scope === scope && scope !== null ? state : undefined
  const result = current?.result

  const accept = useCallback((value: OwnerPlanPageRead) => {
    if (scope === null || activeScope.current !== scope) return
    if (value.kind === 'available' && value.progress.planRef !== planRef) {
      setState({ scope, stale: true, pending: false, problem: 'This response belongs to another Plan. Check this exact Plan again.' })
      return
    }
    // All explicit refusals replace retained data, including not-found/access denial.
    setState({ scope, result: value, stale: false, pending: false })
  }, [scope, planRef])

  const refresh = useCallback(async (): Promise<void> => {
    if (scope === null || activeScope.current !== scope || requests.current.has(scope)) return
    requests.current.add(scope)
    setState(previous => previous.scope === scope
      ? { ...previous, pending: true } : { scope, stale: false, pending: true })
    try { accept(await readOwnerPlanServer({ data: { planRef } })) }
    catch (cause) {
      captureClientExceptionOnClient(cause)
      if (activeScope.current !== scope) return
      setState(previous => {
        const retained = previous.scope === scope && !isAccessDenial(cause) && previous.result?.kind === 'available'
          ? previous.result : undefined
        return {
          scope, ...(retained === undefined ? {} : { result: retained }), stale: true, pending: false,
          problem: isAccessDenial(cause)
            ? 'Access to this Plan could not be confirmed. Sign in to the correct Account before checking again.'
            : retained === undefined ? 'The latest status could not be read. Check this exact Plan again.' : READ_FAILURE,
        }
      })
    } finally { requests.current.delete(scope) }
  }, [scope, planRef, accept])

  useEffect(() => {
    if (scope === null) { setState({ scope: null, stale: false, pending: false }); return }
    if (state.scope !== scope) void refresh()
  }, [scope, state.scope, refresh])

  useEffect(() => {
    if (loaderResult.current === initial) return
    loaderResult.current = initial
    void refresh()
  }, [initial, refresh])

  const followsProgress = result?.kind === 'available'
    && ['awaiting_approval', 'running', 'reconciliation_required'].includes(result.progress.state)
  useEffect(() => {
    if (!followsProgress || decisionPending || scope === null) return
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh()
    }, 3_000)
    return () => clearInterval(timer)
  }, [followsProgress, decisionPending, scope, refresh])

  return {
    result, stale: current?.stale ?? false, readPending: current?.pending ?? false,
    readProblem: current?.problem, authenticated: scope !== null, refresh, accept,
  }
}
