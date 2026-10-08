import { scopedCallHref, type ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import { CallReceiptTimeline } from '@/components/ae/call-receipt/CallReceiptTimeline'
import type { PlanProgressView } from '@/modules/capability-execution/plan.view-model'

export function PlanReceipt({ view, returnScope = {} }: Readonly<{ view: PlanProgressView; returnScope?: ActivityReturnScope }>) {
  return <section className="grid min-w-0 gap-6" aria-label="Plan results and credit movement">
    <div className="grid gap-3">
      <h2 className="text-lg font-semibold">Recorded credit movement</h2>
      <p className="text-sm text-muted-foreground">Held credit is reserved capacity. Charges and releases below require recorded financial evidence.</p>
      <dl className="grid gap-4 rounded-card border border-border p-4 sm:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">Still held</dt><dd className="m-0 font-mono tabular-nums">{view.money.held}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Settled Calls</dt><dd className="m-0 font-mono tabular-nums">{view.money.settled}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Released credit</dt><dd className="m-0 font-mono tabular-nums">{view.money.released}</dd></div>
      </dl>
      {view.money.uncertain ? <p role="status" className="text-sm">Some financial evidence is still being reconciled. These confirmed amounts do not establish that the remaining Hold was released.</p> : null}
    </div>
    <div className="grid gap-4">
      <h2 className="text-lg font-semibold">Individual Calls and results</h2>
      {view.nodes.map(node => <article key={node.nodeId} className="grid min-w-0 gap-3 rounded-card border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-medium">{node.nodeId}</h3><p className="break-all text-sm text-muted-foreground">{node.providerHost}</p></div><span className="text-sm">{node.stateLabel}</span></div>
        {node.callRef === undefined ? <p className="text-sm text-muted-foreground">No Call purchased{node.outcome === undefined ? '.' : ` · ${node.outcome.replaceAll('_', ' ')}`}</p>
          : <a href={scopedCallHref(`/calls/${encodeURIComponent(node.callRef)}`, returnScope)} className="text-sm underline">Open this Call’s receipt</a>}
        {node.outputJson === undefined ? null : <details><summary className="cursor-pointer text-sm font-medium">Result</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-card bg-muted p-3 text-xs">{node.outputJson}</pre></details>}
        {node.receipt === undefined ? null : <details><summary className="cursor-pointer text-sm">{node.receipt.statusLabel} · recorded Call stages</summary><CallReceiptTimeline stages={node.receipt.stages} /></details>}
      </article>)}
    </div>
  </section>
}
