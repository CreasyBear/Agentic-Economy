import type { PlanNodeLineView } from '@/modules/capability-execution/plan.view-model'

export type PlanNodeLineItemsProps = Readonly<{
  nodes: readonly PlanNodeLineView[]
}>

export function PlanNodeLineItems({ nodes }: PlanNodeLineItemsProps) {
  return (
    <section aria-label="Node ceilings" className="grid min-w-0 gap-3">
      <h3 className="text-sm font-medium">Node ceilings</h3>
      {nodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">This Quote contains no Nodes.</p>
      ) : (
        <ul className="grid min-w-0 gap-3 p-0">
          {nodes.map((node) => (
            <li key={node.nodeId} className="grid min-w-0 gap-3 rounded-card border border-border bg-muted/30 p-4">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="grid min-w-0 gap-1">
                  <h4 className="m-0 break-all font-mono text-sm font-medium">{node.nodeId}</h4>
                  <code className="break-all text-xs text-muted-foreground">{node.toolRef}</code>
                </div>
                <strong className="font-mono text-sm tabular-nums">{node.ceilingLabel}</strong>
              </div>
              <dl className="grid min-w-0 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                <div className="grid min-w-0 gap-1">
                  <dt className="text-muted-foreground">Input</dt>
                  <dd className="m-0 break-words">{node.inputModeLabel}</dd>
                </div>
                <div className="grid min-w-0 gap-1">
                  <dt className="text-muted-foreground">Price basis</dt>
                  <dd className="m-0 break-words">{node.priceClassLabel}</dd>
                </div>
                <div className="grid min-w-0 gap-1 sm:col-span-2">
                  <dt className="text-muted-foreground">Depends on</dt>
                  <dd className="m-0 break-words font-mono">{node.dependenciesLabel}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
