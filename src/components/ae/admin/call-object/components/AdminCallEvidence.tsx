import { CallMoneyFacts } from '@/components/ae/call-receipt/CallMoneyFacts'
import { CallReceiptTimeline } from '@/components/ae/call-receipt/CallReceiptTimeline'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import type { ChatModelCostSummary } from '@/modules/chat/model-cost'
import type { AdminCallObjectViewModel } from '../call-object.contracts'
import { ADMIN_CALL_OBJECT_COPY } from '../call-object.contracts'
import '../../RecordWorkspaceComposition.css'

type AnswerModelRequest = ChatModelCostSummary['requests'][number]

const answerModelRequestColumns: DataColumn<AnswerModelRequest>[] = [
  {
    key: 'requestRef',
    label: 'Request',
    sortable: true,
    sortValue: (request) => request.providerGenerationId ?? request.requestRef,
    render: (_value, request) => {
      const identity = request.providerGenerationId ?? request.requestRef
      const sourceAndPurpose = `${request.source === 'jev' ? 'Jev' : 'OpenRouter'} · ${request.purpose.replaceAll('_', ' ')}`
      return <>
        <span className="arc-admin-model-request-ident" title={sourceAndPurpose}>{sourceAndPurpose}</span>
        <span className="arc-admin-model-request-secondary" title={identity}>{identity}</span>
      </>
    },
  },
  {
    key: 'model',
    label: 'Model',
    sortable: true,
    sortValue: (request) => request.model ?? request.requestedModel,
    render: (_value, request) => {
      const model = request.model ?? request.requestedModel
      return <>
        <span className="arc-admin-model-request-ident" title={model}>{model}</span>
        <span className="arc-admin-model-request-secondary" title={request.model === undefined ? 'Requested model' : 'Reported model'}>{request.model === undefined ? 'Requested model' : 'Reported model'}</span>
      </>
    },
  },
  {
    key: 'tokens',
    label: 'Tokens in / out',
    sortable: false,
    numeric: true,
    render: (_value, request) => `${request.inputTokens ?? 'Unknown'} / ${request.outputTokens ?? 'Unknown'}`,
  },
  {
    key: 'accounting',
    label: 'USD cost',
    sortable: false,
    numeric: true,
    render: (_value, request) => {
      const accounting = request.accounting
      if (accounting.status === 'priced') {
        return <>
          <span>{accounting.amountUsd}</span>
          <span className="arc-admin-model-request-secondary" title={accounting.source === 'inline' ? 'Response usage' : 'Generation metadata'}>{accounting.source === 'inline' ? 'Response usage' : 'Generation metadata'}</span>
        </>
      }
      if (accounting.status === 'pending') return 'Pending'
      return <>
        <span>Unknown</span>
        <span className="arc-admin-model-request-secondary" title={accounting.reason.replaceAll('_', ' ')}>{accounting.reason.replaceAll('_', ' ')}</span>
      </>
    },
  },
]

export type AdminCallEvidenceProps = Readonly<{
  model: AdminCallObjectViewModel
}>

export function AdminCallEvidence({ model }: AdminCallEvidenceProps) {
  return (
    <div className="arc-market arc-admin-evidence">
      <AeSection
        title={ADMIN_CALL_OBJECT_COPY.factsTitle}
        description={ADMIN_CALL_OBJECT_COPY.factsDescription}
      >
        <AeFactList facts={model.facts} />
      </AeSection>
      {model.moneyTruth === null ? null : (
        <AeSection title={ADMIN_CALL_OBJECT_COPY.moneyTruthTitle}>
          <p className="arc-admin-record-context">{model.moneyTruth}</p>
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
            <SortableDataTable
              rows={[...model.view.answerModelCost.cost.requests]}
              columns={answerModelRequestColumns}
              rowKey="requestRef"
              animateRows={false}
              ariaLabel="Answer model requests"
              caption="Answer model requests"
              emptyMessage="No model requests recorded for this answer."
            />
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

function costSummary(cost: ChatModelCostSummary): string {
  if (cost.status === 'untracked') return cost.requestCount === 0
    ? 'Cost tracking is unavailable for this answer.'
    : `Known subtotal US$${cost.knownCostUsd} · historical coverage unknown`
  if (cost.status === 'complete') return `US$${cost.knownCostUsd} · complete`
  if (cost.status === 'limit_exceeded') return `Known subtotal US$${cost.knownCostUsd} · request limit exceeded; total incomplete`
  return cost.unknownRequestCount === 0 ? `Known subtotal US$${cost.knownCostUsd} · answer in progress`
    : `Known subtotal US$${cost.knownCostUsd} · incomplete (${cost.unknownRequestCount} unpriced ${cost.unknownRequestCount === 1 ? 'request' : 'requests'})`
}
