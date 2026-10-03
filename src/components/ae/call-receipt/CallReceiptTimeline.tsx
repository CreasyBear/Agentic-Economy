import { Stepper } from '@/components/arc/stepper/stepper'
import type { CallReceiptStageView } from '@/modules/capability-execution/call-receipt-view'

import { machineLabel } from './call-receipt-format'
import './ReceiptComposition.css'

export function CallReceiptTimeline({ stages }: Readonly<{ stages: readonly CallReceiptStageView[] }>) {
  const currentStage = stages.findIndex((stage) => stage.state === 'current')
  const nextStage = stages.findIndex((stage) => stage.state === 'pending' || stage.state === 'attention')
  const current = currentStage >= 0 ? currentStage : nextStage >= 0 ? nextStage : stages.length
  const steps = stages.map((stage) => ({
    id: stage.id,
    label: stage.label,
    description: stage.detail,
    status: stageStatus(stage.state),
    statusLabel: `Stage state: ${machineLabel(stage.state)}`,
  }))

  return (
    <section className="arc-market arc-call-timeline" aria-labelledby="receipt-progress-title">
      <div className="grid gap-intra">
        <h2 id="receipt-progress-title" className="arc-call-heading">What happened</h2>
        <p className="arc-call-context">Recorded progress for this exact call. A pending stage is not claimed as complete.</p>
      </div>
      <Stepper
        steps={steps}
        current={current}
        orientation="vertical"
        details="all"
        label="Recorded call stages"
        completeLabel="Recorded call stages complete"
        announceLabel="Recorded progress for this exact call"
      />
    </section>
  )
}

function stageStatus(state: CallReceiptStageView['state']) {
  if (state === 'complete') return 'complete' as const
  if (state === 'current') return 'current' as const
  if (state === 'attention') return 'error' as const
  return 'upcoming' as const
}
