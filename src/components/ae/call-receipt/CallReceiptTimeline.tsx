import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, Clock3Icon } from 'lucide-react'

import type { CallReceiptStageView } from '@/modules/capability-execution/call-receipt-view'

import { machineLabel } from './call-receipt-format'
import './ReceiptComposition.css'

export function CallReceiptTimeline({ stages }: Readonly<{ stages: readonly CallReceiptStageView[] }>) {
  return (
    <section className="arc-market arc-call-timeline" aria-labelledby="receipt-progress-title">
      <div className="grid gap-intra">
        <h2 id="receipt-progress-title" className="arc-call-heading">What happened</h2>
        <p className="arc-call-context">Recorded progress for this exact call. A pending stage is not claimed as complete.</p>
      </div>
      <ol className="arc-call-stage-list">
        {stages.map((stageView, index) => (
          <li
            key={stageView.id}
            aria-current={stageView.state === 'current' ? 'step' : undefined}
            className="arc-call-stage"
          >
            <div className="arc-call-stage-name">
              <StageIcon state={stageView.state} />
              <span>{index + 1}. {stageView.label}</span>
            </div>
            <p className="arc-call-context">{stageView.detail}</p>
            <span className="sr-only">Stage state: {machineLabel(stageView.state)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function StageIcon({ state }: Readonly<{ state: CallReceiptStageView['state'] }>) {
  if (state === 'complete') return <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0 text-success" />
  if (state === 'attention') return <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
  if (state === 'current') return <Clock3Icon aria-hidden="true" className="size-4 shrink-0 text-brand" />
  return <CircleIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
}
