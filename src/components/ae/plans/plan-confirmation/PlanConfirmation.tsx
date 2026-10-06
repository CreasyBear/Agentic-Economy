import { useId } from 'react'
import { AeActionLink } from '@/components/ae/shared/action-link/AeActionLink'
import { DecisionPanel } from '@/components/ae/shared/arc-pro/chat/DecisionPanel'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import type { PlanConfirmationView } from '@/modules/capability-execution/plan.view-model'
import { PlanDataFlowDisclosures } from './components/PlanDataFlowDisclosures'
import { PlanNodeLineItems } from './components/PlanNodeLineItems'
import { PlanStageColumns } from './components/PlanStageColumns'
import type { PlanConfirmationActions } from './plan-confirmation.contracts'

export type PlanConfirmationProps = Readonly<{
  view: PlanConfirmationView
} & PlanConfirmationActions>

export function PlanConfirmation({ view, pending = false, onApprove, onDeny }: PlanConfirmationProps) {
  const headingId = useId()
  if (view.kind === 'refused') {
    return (
      <DecisionPanel role="region" aria-labelledby={headingId}>
        <header className="arc-decision-header">
          <h2 id={headingId} className="arc-decision-heading">Plan Quote unavailable</h2>
          <span className="arc-decision-status" data-tone="warning">Quote refused</span>
        </header>
        <p role="alert" className="m-0 text-sm">{view.message}</p>
      </DecisionPanel>
    )
  }

  return (
    <DecisionPanel role="region" data-plan-ref={view.planRef} aria-labelledby={headingId}>
      <header className="arc-decision-header">
        <h2 id={headingId} tabIndex={-1} className="arc-decision-heading">Review this Plan</h2>
        <span className="arc-decision-status" data-tone={view.expired ? 'warning' : 'neutral'}>
          {view.expired ? 'Quote expired' : 'Approval required'}
        </span>
      </header>
      <div className="arc-decision-body">
        <dl className="arc-decision-facts">
          <div>
            <dt>Maximum Plan total</dt>
            <dd className="font-mono tabular-nums">{view.totalLabel}</dd>
          </div>
          <div>
            <dt>Quote expires</dt>
            <dd><time>{formatUtcTimestamp(view.expiresAt)} UTC</time></dd>
          </div>
        </dl>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Plan reference and digest</summary>
          <p className="break-all font-mono">{view.planRef}</p><p className="break-all font-mono">{view.planDigest}</p>
        </details>
        <PlanStageColumns stages={view.stages} />
        <PlanNodeLineItems nodes={view.nodes} />
        <PlanDataFlowDisclosures flows={view.dataFlows} />
        <p className="m-0 text-sm text-muted-foreground">
          No Hold is created before approval. Approval reserves this exact Plan ceiling once; each Provider Call keeps its own outcome and receipt.
        </p>
      </div>
      <div className="arc-decision-actions" aria-busy={pending}>
        <AeActionLink
          labelLayout="wrap"
          disabled={pending || view.expired}
          onAction={() => onApprove(view.planRef, view.totalAudUnits)}
        >
          {pending ? 'Approving Plan…' : view.expired ? 'Quote expired' : 'Approve Plan'}
        </AeActionLink>
        <AeActionLink
          variant="secondary"
          labelLayout="wrap"
          disabled={pending}
          onAction={() => onDeny(view.planRef)}
        >
          Decline Plan
        </AeActionLink>
      </div>
    </DecisionPanel>
  )
}
