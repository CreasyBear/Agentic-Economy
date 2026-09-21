import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, Clock3Icon } from 'lucide-react'

import type { CallReceiptStageView } from '@/modules/capability-execution/call-receipt-view'

import { machineLabel } from './call-receipt-format'

export function CallReceiptTimeline({ stages }: Readonly<{ stages: readonly CallReceiptStageView[] }>) {
  return (
    <section className="grid gap-related border-t border-border pt-section" aria-labelledby="receipt-progress-title">
      <div className="grid gap-intra">
        <h2 id="receipt-progress-title" className="text-base font-medium leading-snug tracking-tight text-foreground">What happened</h2>
        <p className="text-sm text-muted-foreground">Recorded progress for this exact call. A pending stage is not claimed as complete.</p>
      </div>
      <ol className="grid overflow-hidden rounded-card border bg-card sm:grid-cols-2 lg:grid-cols-6">
        {stages.map((stageView, index) => (
          <li
            key={stageView.id}
            aria-current={stageView.state === 'current' ? 'step' : undefined}
            className="grid min-w-0 content-start gap-intra border-b p-gutter last:border-b-0 sm:border-e sm:[&:nth-child(even)]:border-e-0 lg:border-b-0 lg:[&:nth-child(even)]:border-e lg:last:border-e-0"
          >
            <div className="flex items-center gap-intra">
              <StageIcon state={stageView.state} />
              <span className="text-sm font-semibold text-foreground">{index + 1}. {stageView.label}</span>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{stageView.detail}</p>
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
