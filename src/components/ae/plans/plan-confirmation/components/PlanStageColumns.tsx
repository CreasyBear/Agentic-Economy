import { Stepper } from '@/components/arc/stepper/stepper'
import type { PlanStageView } from '@/modules/capability-execution/plan.view-model'

export type PlanStageColumnsProps = Readonly<{
  stages: readonly PlanStageView[]
}>

export function PlanStageColumns({ stages }: PlanStageColumnsProps) {
  return (
    <section aria-label="Planned stages" className="grid min-w-0 gap-3">
      <h3 className="text-sm font-medium">Planned stages</h3>
      {stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No execution stages are available.</p>
      ) : (
        <Stepper
          steps={stages.map((stage) => ({
            id: `stage-${stage.index + 1}`,
            label: stage.label,
            description: stage.description,
            status: 'upcoming',
            statusLabel: 'Planned; not started',
          }))}
          current={0}
          details="all"
          label="Planned Plan stages"
          announceLabel="Plan has not started"
        />
      )}
    </section>
  )
}
