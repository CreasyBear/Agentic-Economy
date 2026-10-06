import { ArcAgentRunTimeline } from '@/components/ae/shared/arc-pro/agent-run/agent-run'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { WorkDisclosureView } from '@/components/ae/chat/generative/generative.contracts'

const statusLabel = { working: 'Working', complete: 'Done', attention: getStatusPresentation('needs_attention').label } as const

export function AgentRun({ view }: Readonly<{ view: WorkDisclosureView }>) {
  return (
    <ArcAgentRunTimeline
      summary={view.summary}
      steps={view.steps.map((step) => ({
        id: step.id,
        label: step.label,
        phase: step.status,
        phaseLabel: statusLabel[step.status],
      }))}
    />
  )
}
