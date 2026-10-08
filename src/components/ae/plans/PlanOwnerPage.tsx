import { useEffect, useState } from 'react'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Button } from '@/components/arc/button/button'
import { useTypedReverification } from '@/lib/client/useTypedReverification'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { activityReturnHref, buyerReturnDestination, type ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import { usePlanOwnerStatus } from './usePlanOwnerStatus'
import { mapPlanProgress, mapPlanQuoteResult } from '@/modules/capability-execution/plan.view-model'
import type { OwnerPlanDecision, OwnerPlanPageRead } from '@/modules/capability-execution/plan/owner.contracts'
import { cancelOwnerPlanServer, decideOwnerPlanServer } from '@/modules/capability-execution/plan/owner.functions'
import { PlanConfirmation } from './plan-confirmation/PlanConfirmation'
import { PlanRun } from './plan-run/PlanRun'
import { PlanReceipt } from './plan-receipt/PlanReceipt'

export function PlanOwnerPage({ initial, planRef, returnScope = {} }: Readonly<{ initial: OwnerPlanPageRead; planRef: string; returnScope?: ActivityReturnScope }>) {
  const destination = buyerReturnDestination(returnScope)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string>()
  const { result, stale, readPending, readProblem, authenticated, refresh, accept } = usePlanOwnerStatus(initial, planRef, pending)
  const [now, setNow] = useState(() => Date.now())
  const decide = useTypedReverification((data: OwnerPlanDecision) => decideOwnerPlanServer({ data }),
    value => value.kind === 'refused' && value.code === 'mfa_reverification_required' ? 'strict_mfa' : null)
  const approvalExpiresAt = result?.kind === 'available' && result.progress.state === 'awaiting_approval' ? result.progress.expiresAt : undefined
  useEffect(() => {
    if (approvalExpiresAt === undefined) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, approvalExpiresAt - Date.now() + 1))
    return () => clearTimeout(timer)
  }, [approvalExpiresAt])
  async function act(action: 'approve' | 'deny' | 'cancel'): Promise<void> {
    if (pending || readPending || stale || result?.kind !== 'available' || result.quote.kind !== 'quoted') return
    setPending(true)
    setProblem(undefined)
    try {
      const value = action === 'cancel' ? await cancelOwnerPlanServer({ data: { planRef } })
        : await decide({ planRef, planDigest: result.quote.planDigest, approvedTotalAudUnits: result.quote.approvedTotalAudUnits, decision: action })
      if (value.kind === 'refused') setProblem(`The Plan decision was refused: ${value.code.replaceAll('_', ' ')}. Check its current status before retrying.`)
      if (value.kind === 'refused' && ['plan_access_denied', 'plan_not_found', 'grant_changed'].includes(value.code)) accept(value)
      else await refresh()
    } catch (cause) {
      if (!isReverificationCancelledError(cause)) {
        captureClientExceptionOnClient(cause)
        setProblem('The decision could not be confirmed. Check this Plan’s status before trying again.')
      }
    } finally { setPending(false) }
  }
  const view = result?.kind === 'available' ? mapPlanProgress(result.progress, result.callStatuses) : undefined
  const cancellable = !stale && result?.kind === 'available' && ['running', 'reconciliation_required'].includes(result.progress.state)
    && result.progress.terminationIntent === undefined
  return <AeOperatorPage operatorRole="owner" title="Tool Plan" description="Review one approved maximum and each individual Call’s recorded outcome." currentPath="/activity">
    <div className="grid min-w-0 gap-8">
      <nav aria-label="Plan return" className="flex flex-wrap gap-4 text-sm">
        {destination === undefined ? null : <a href={destination.href} className="underline">{destination.label}</a>}
        <a href={activityReturnHref(returnScope)} className="underline">Back to Calls and Plans</a>
      </nav>
      {problem === undefined ? null : <p role="alert" className="text-sm">{problem}</p>}
      {readProblem === undefined ? null : <p role="alert" className="text-sm">{readProblem}</p>}
      {result?.kind !== 'available' || view === undefined ? <div role="status" className="grid gap-3"><p>{authenticated ? 'This Plan is unavailable for the current Account.' : 'Sign in to the correct Account to view this Plan.'}</p><Button type="button" variant="secondary" disabled={pending || readPending || !authenticated} onClick={() => void refresh()}>Check status</Button></div>
        : <>
          {result.progress.state === 'awaiting_approval' ? <PlanConfirmation
            view={mapPlanQuoteResult(result.quote, now, Object.fromEntries(result.progress.nodes.map(node => [node.nodeId, node.providerHost])), result.plan)}
            pending={pending || stale || readPending} onApprove={() => void act('approve')} onDeny={() => void act('deny')} /> : null}
          <PlanRun view={view} pending={pending || readPending} onRefresh={() => void refresh()} {...(cancellable ? { onCancel: () => void act('cancel') } : {})} />
          <PlanReceipt view={view} returnScope={{ ...returnScope, returnTo: 'plan', returnPlan: planRef }} />
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Plan reference</summary><p className="break-all font-mono">{planRef}</p></details>
        </>}
    </div>
  </AeOperatorPage>
}
