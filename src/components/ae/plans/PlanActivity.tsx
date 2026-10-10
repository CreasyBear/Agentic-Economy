import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { formatCurrencyAmount } from '@/modules/money/public'
import { formatTimestamp } from '@/lib/ui/format-time'
import { scopedCallHref, type ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import type { OwnerPlanSummary } from '@/modules/capability-execution/plan/owner.contracts'

export function PlanActivity({ plans, returnScope = {}, agentFiltered = false, onShowAccountPlans, pending = false }: Readonly<{
  plans: readonly OwnerPlanSummary[] | undefined; returnScope?: ActivityReturnScope
  agentFiltered?: boolean; onShowAccountPlans?: () => void; pending?: boolean
}>) {
  return <AeSection title="Tool Plans" description="Your latest 50 Account Plans. Each node keeps its individual Call and receipt.">
    <p className="text-xs text-muted-foreground">Call date and status filters do not filter this Account Plan history.</p>
    {agentFiltered ? <div className="grid justify-items-start gap-3"><p className="text-sm text-muted-foreground">Plan history is not included in an individual Agent view. Clear the Agent filter to review Account Plans.</p>
      {onShowAccountPlans === undefined ? null : <Button type="button" variant="secondary" disabled={pending} onClick={onShowAccountPlans}>Show Account Plans</Button>}</div>
      : plans === undefined ? <p role="status" className="text-sm text-muted-foreground">Plan history could not be read. Refresh this page to try again.</p>
      : plans.length === 0 ? <p className="text-sm text-muted-foreground">No Plans recorded for this Account.</p>
      : <ul className="grid gap-3 p-0">{plans.map(plan => <li key={plan.planRef} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
        <div className="grid min-w-0 gap-1"><a href={scopedCallHref(`/plans/${encodeURIComponent(plan.planRef)}`, returnScope)} className="font-medium underline">
          {plan.nodeCount} Tool {plan.nodeCount === 1 ? 'node' : 'nodes'} · {plan.state.replaceAll('_', ' ')}
        </a><p className="m-0 text-xs text-muted-foreground">{formatTimestamp(plan.createdAt, 'UTC')} UTC</p></div>
        <span className="text-sm">Maximum {formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: plan.approvedTotalAudUnits })}</span>
      </li>)}</ul>}
  </AeSection>
}
