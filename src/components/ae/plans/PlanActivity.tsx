import { Link } from '@tanstack/react-router'
import { AeSection } from '@/components/ae/layout/AeSection'
import { formatCurrencyAmount } from '@/modules/money/public'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import type { OwnerPlanSummary } from '@/modules/capability-execution/plan/owner.contracts'

export function PlanActivity({ plans }: Readonly<{ plans: readonly OwnerPlanSummary[] | undefined }>) {
  if (plans?.length === 0) return null
  return <AeSection title="Tool Plans" description="Your latest 50 Plans. Each node keeps its individual Call and receipt.">
    {plans === undefined ? <p role="status" className="text-sm text-muted-foreground">Plan history could not be read. Refresh this page to try again.</p>
      : <ul className="grid gap-3 p-0">{plans.map(plan => <li key={plan.planRef} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-card border border-border p-4">
        <div className="grid gap-1"><Link to="/plans/$planRef" params={{ planRef: plan.planRef }} className="font-medium underline">
          {plan.nodeCount} Tool {plan.nodeCount === 1 ? 'node' : 'nodes'} · {plan.state.replaceAll('_', ' ')}
        </Link><p className="m-0 text-xs text-muted-foreground">{formatUtcTimestamp(plan.createdAt)} UTC</p></div>
        <span className="text-sm">Maximum {formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: plan.approvedTotalAudUnits })}</span>
      </li>)}</ul>}
  </AeSection>
}
