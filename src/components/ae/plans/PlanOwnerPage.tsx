import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Button } from '@/components/arc/button/button'
import { useTypedReverification } from '@/lib/client/useTypedReverification'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { mapPlanProgress, mapPlanQuoteResult } from '@/modules/capability-execution/plan.view-model'
import type { OwnerPlanDecision, OwnerPlanPageRead } from '@/modules/capability-execution/plan/owner.contracts'
import { cancelOwnerPlanServer, decideOwnerPlanServer, readOwnerPlanServer } from '@/modules/capability-execution/plan/owner.functions'
import { PlanConfirmation } from './plan-confirmation/PlanConfirmation'
import { PlanRun } from './plan-run/PlanRun'
import { PlanReceipt } from './plan-receipt/PlanReceipt'

export function PlanOwnerPage({ initial, planRef }: Readonly<{ initial: OwnerPlanPageRead; planRef: string }>) {
  const [result, setResult] = useState(initial)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string>()
  const [now, setNow] = useState(() => Date.now())
  const decide = useTypedReverification((data: OwnerPlanDecision) => decideOwnerPlanServer({ data }),
    value => value.kind === 'refused' && value.code === 'mfa_reverification_required' ? 'strict_mfa' : null)
  const running = result.kind === 'available' && result.progress.state === 'running'
  const approvalExpiresAt = result.kind === 'available' && result.progress.state === 'awaiting_approval' ? result.progress.expiresAt : undefined
  useEffect(() => {
    if (approvalExpiresAt === undefined) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, approvalExpiresAt - Date.now() + 1))
    return () => clearTimeout(timer)
  }, [approvalExpiresAt])
  useEffect(() => {
    if (!running || pending) return
    let disposed = false
    let loading = false
    const timer = setInterval(() => {
      if (loading) return
      loading = true
      void readOwnerPlanServer({ data: { planRef } }).then(value => {
        if (!disposed) { setResult(value); setProblem(undefined) }
      }).catch(cause => {
        captureClientExceptionOnClient(cause)
        if (!disposed) { setProblem('The latest status could not be read. The recorded results remain below.'); clearInterval(timer) }
      }).finally(() => { loading = false })
    }, 3_000)
    return () => { disposed = true; clearInterval(timer) }
  }, [running, pending, planRef])

  async function refresh(): Promise<void> {
    if (pending) return
    setPending(true)
    try { setResult(await readOwnerPlanServer({ data: { planRef } })); setProblem(undefined) }
    catch (cause) { captureClientExceptionOnClient(cause); setProblem('The latest status could not be read. Try Check status again.') }
    finally { setPending(false) }
  }
  async function act(action: 'approve' | 'deny' | 'cancel'): Promise<void> {
    if (pending || result.kind !== 'available' || result.quote.kind !== 'quoted') return
    setPending(true)
    setProblem(undefined)
    try {
      const value = action === 'cancel' ? await cancelOwnerPlanServer({ data: { planRef } })
        : await decide({ planRef, planDigest: result.quote.planDigest, approvedTotalAudUnits: result.quote.approvedTotalAudUnits, decision: action })
      if (value.kind === 'refused') setProblem(`The Plan decision was refused: ${value.code.replaceAll('_', ' ')}. Check its current status before retrying.`)
      setResult(await readOwnerPlanServer({ data: { planRef } }))
    } catch (cause) {
      if (!isReverificationCancelledError(cause)) {
        captureClientExceptionOnClient(cause)
        setProblem('The decision could not be confirmed. Check this Plan’s status before trying again.')
      }
    } finally { setPending(false) }
  }
  const view = result.kind === 'available' ? mapPlanProgress(result.progress, result.callStatuses) : undefined
  const cancellable = result.kind === 'available' && ['running', 'reconciliation_required'].includes(result.progress.state)
    && result.progress.terminationIntent === undefined
  return <AeOperatorPage operatorRole="owner" title="Tool Plan" description="Review one approved maximum and each individual Call’s recorded outcome." currentPath="/activity">
    <div className="grid min-w-0 gap-8">
      <Link to="/activity" className="text-sm underline">Back to Calls and Plans</Link>
      {problem === undefined ? null : <p role="alert" className="text-sm">{problem}</p>}
      {result.kind !== 'available' || view === undefined ? <div role="status" className="grid gap-3"><p>This Plan is unavailable for the current Account.</p><Button type="button" variant="secondary" disabled={pending} onClick={() => void refresh()}>Check status</Button></div>
        : <>
          {result.progress.state === 'awaiting_approval' ? <PlanConfirmation
            view={mapPlanQuoteResult(result.quote, now, Object.fromEntries(result.progress.nodes.map(node => [node.nodeId, node.providerHost])), result.plan)}
            pending={pending} onApprove={() => void act('approve')} onDeny={() => void act('deny')} /> : null}
          <PlanRun view={view} pending={pending} onRefresh={() => void refresh()} {...(cancellable ? { onCancel: () => void act('cancel') } : {})} />
          <PlanReceipt view={view} />
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Plan reference</summary><p className="break-all font-mono">{planRef}</p></details>
        </>}
    </div>
  </AeOperatorPage>
}
