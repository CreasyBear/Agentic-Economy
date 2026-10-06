import type { PlanDataFlowView } from '@/modules/capability-execution/plan.view-model'

export type PlanDataFlowDisclosuresProps = Readonly<{
  flows: readonly PlanDataFlowView[]
}>

export function PlanDataFlowDisclosures({ flows }: PlanDataFlowDisclosuresProps) {
  return (
    <section aria-label="Data sent between Providers" className="grid min-w-0 gap-3">
      <h3 className="text-sm font-medium">Data sent between Providers</h3>
      {flows.length === 0 ? (
        <p className="text-sm text-muted-foreground">This Plan Quote discloses no cross-Node data flows.</p>
      ) : (
        <ul className="grid min-w-0 gap-2 p-0">
          {flows.map((flow, index) => (
            <li key={`${flow.from}:${flow.to}:${index}`} className="grid min-w-0 gap-2 rounded-card border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <p className="m-0 min-w-0 break-words text-sm">
                <span className="font-mono">{flow.from}</span>
                <span aria-hidden="true" className="px-2 text-muted-foreground">→</span>
                <span className="font-mono">{flow.to}</span>
                <span className="block pt-1 text-xs text-muted-foreground">Destination Provider</span>
                <code className="block break-all text-xs">{flow.destinationProviderHost}</code>
              </p>
              <span
                className="inline-flex min-h-7 w-fit items-center rounded-full border border-border px-2 text-xs"
                data-validation={flow.validation}
              >
                {flow.validation}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-xs text-muted-foreground">
        An <code>untyped_ref</code> badge follows the destination Node’s Quote validation and means at least one reference to that Node has unproven type compatibility.
      </p>
    </section>
  )
}
