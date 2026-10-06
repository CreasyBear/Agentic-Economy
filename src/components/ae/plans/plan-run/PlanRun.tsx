import { AgentRun } from '@/components/arc/blocks/agent-run/agent-run'
import { Stepper } from '@/components/arc/stepper/stepper'
import { Button } from '@/components/arc/button/button'
import type { PlanProgressView } from '@/modules/capability-execution/plan.view-model'

export function PlanRun({ view, pending, onRefresh, onCancel }: Readonly<{
  view: PlanProgressView; pending: boolean; onRefresh: () => void; onCancel?: () => void;
}>) {
  return <AgentRun title={`Plan ${view.stateLabel.toLowerCase()}`} description={view.detail}
    byline={<span className="text-sm">{view.nodes.length} Tool nodes · one approved maximum</span>}
    status={{ phase: view.phase, label: view.stateLabel, announcement: `Plan ${view.stateLabel.toLowerCase()}.` }} facts={view.facts}
    actions={<><Button type="button" variant="secondary" disabled={pending} onClick={onRefresh}>{pending ? 'Checking…' : 'Check status'}</Button>
      {onCancel === undefined ? null : <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Stop new Calls</Button>}</>}>
    <Stepper steps={view.stages} current={view.currentStage} orientation="vertical" details="all"
      label="Recorded Plan stages" completeLabel="All Plan stages complete" announceLabel="Recorded Plan progress" />
  </AgentRun>
}
