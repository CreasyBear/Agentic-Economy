import { CallMoneyFacts } from '@/components/ae/call-receipt/CallMoneyFacts'
import { CallReceiptTimeline } from '@/components/ae/call-receipt/CallReceiptTimeline'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import type { ChatModelCostSummary } from '@/modules/chat/model-cost'
import type { AdminCallObjectViewModel } from '../call-object.contracts'
import { ADMIN_CALL_OBJECT_COPY } from '../call-object.contracts'

export type AdminCallEvidenceProps = Readonly<{
  model: AdminCallObjectViewModel
}>

export function AdminCallEvidence({ model }: AdminCallEvidenceProps) {
  return (
    <div className="grid content-start gap-section">
      <AeSection
        title={ADMIN_CALL_OBJECT_COPY.factsTitle}
        description={ADMIN_CALL_OBJECT_COPY.factsDescription}
      >
        <AeFactList facts={model.facts} />
      </AeSection>
      {model.moneyTruth === null ? null : (
        <AeSection title={ADMIN_CALL_OBJECT_COPY.moneyTruthTitle}>
          <p className="text-sm text-muted-foreground">{model.moneyTruth}</p>
        </AeSection>
      )}
      <CallReceiptTimeline stages={model.view.receipt.stages} />
      {model.view.purchase.kind === 'uncertain' ? null : (
        <CallMoneyFacts view={model.view.receipt} />
      )}
      {model.view.answerModelCost === null ? null : (
        <AeSection title="Answer model cost" description="The cost of the originating chat answer, shared by all its Calls.">
          <p className="text-sm font-medium">{costSummary(model.view.answerModelCost.cost)}</p>
          <p className="mt-intra break-all text-xs text-muted-foreground">Answer: {model.view.answerModelCost.cost.turnRef}</p>
          <details className="mt-related">
            <summary className="min-h-touch cursor-pointer content-center text-sm font-medium">Request details</summary>
            <div className="ae-arc min-w-0">
              <SortableDataTable density="compact" mobileLayout="scroll" columns={requestColumns} rows={model.view.answerModelCost.cost.requests}
                rowKey="requestRef" caption="Answer model requests" />
            </div>
          </details>
          <details className="mt-related">
            <summary className="min-h-touch cursor-pointer content-center text-sm font-medium">Related Calls ({model.view.answerModelCost.callRefs.length}{model.view.answerModelCost.callsTruncated ? '+' : ''})</summary>
            <ul className="grid gap-intra text-sm">{model.view.answerModelCost.callRefs.map(ref => (
              <li key={ref} className="break-all"><a className="text-link underline" href={`/admin/calls/${encodeURIComponent(ref)}`}>{ref}</a></li>
            ))}</ul>
          </details>
        </AeSection>
      )}
    </div>
  )
}

const requestColumns: DataColumn<ChatModelCostSummary['requests'][number]>[] = [
  { key: 'requestRef', label: 'Request', sortable: false,
    render: (_value, request) => <div className="min-w-0">
      <span className="block">{request.source === 'jev' ? 'Jev' : 'OpenRouter'} · {request.purpose.replaceAll('_', ' ')}</span>
      <AeCopyReference compact label="Model request" value={request.providerGenerationId ?? request.requestRef} />
    </div> },
  { key: 'model', label: 'Model', sortable: false,
    render: (_value, request) => <div className="min-w-0">
      <span className="block truncate" title={request.model ?? request.requestedModel}>{request.model ?? request.requestedModel}</span>
      <span className="block text-xs text-muted-foreground">{request.model === undefined ? 'Requested model' : 'Reported model'}</span>
    </div> },
  { key: 'inputTokens', label: 'Tokens in / out', sortable: false, numeric: true,
    render: (_value, request) => <span className="whitespace-nowrap">{request.inputTokens ?? 'Unknown'} / {request.outputTokens ?? 'Unknown'}</span> },
  { key: 'accounting', label: 'USD cost', sortable: false, numeric: true,
    render: (_value, request) => request.accounting.status === 'priced'
      ? <>{request.accounting.amountUsd}<span className="block text-xs text-muted-foreground">{request.accounting.source === 'inline' ? 'Response usage' : 'Generation metadata'}</span></>
      : <>{request.accounting.status === 'pending' ? 'Pending' : 'Unknown'}{request.accounting.status === 'unpriced'
        ? <span className="block text-xs text-muted-foreground">{request.accounting.reason.replaceAll('_', ' ')}</span> : null}</> },
]

function costSummary(cost: ChatModelCostSummary): string {
  if (cost.status === 'untracked') return cost.requestCount === 0
    ? 'Cost tracking is unavailable for this answer.'
    : `Known subtotal US$${cost.knownCostUsd} · historical coverage unknown`
  if (cost.status === 'complete') return `US$${cost.knownCostUsd} · complete`
  if (cost.status === 'limit_exceeded') return `Known subtotal US$${cost.knownCostUsd} · request limit exceeded; total incomplete`
  return cost.unknownRequestCount === 0 ? `Known subtotal US$${cost.knownCostUsd} · answer in progress`
    : `Known subtotal US$${cost.knownCostUsd} · incomplete (${cost.unknownRequestCount} unpriced ${cost.unknownRequestCount === 1 ? 'request' : 'requests'})`
}
