import { projectCallReceipt, type PublicCallStatusRead, type CallReceiptView } from './call-receipt-view'
import type { PlanGetResult } from './plan/runtime.schemas'
import { formatCurrencyAmount } from '@/modules/money/public'

import type {
  PlanJson,
  PlanNodeId,
  PlanNodeQuote,
  PlanQuoteResult,
  PlanRunRefusalCode,
  PlanRunResult,
  PlanState,
  PlanValidationRefusalCode,
} from './plan/contracts'

export type PlanNodeLineView = Readonly<{
  nodeId: PlanNodeId
  toolRef: string
  providerHost?: string
  inputJson?: string
  dependencies: readonly PlanNodeId[]
  dependenciesLabel: string
  inputMode: PlanNodeQuote['inputMode']
  inputModeLabel: string
  priceClass: PlanNodeQuote['priceClass']
  priceClassLabel: string
  ceilingAudUnits: string
  ceilingLabel: string
  rateToleranceLabel?: string
}>

export type PlanStageView = Readonly<{
  index: number
  label: string
  nodeIds: readonly PlanNodeId[]
  description: string
}>

export type PlanDataFlowView = Readonly<{
  from: PlanNodeId
  to: PlanNodeId
  destinationProviderHost: string
  validation: PlanNodeQuote['validation']
}>

export type PlanConfirmationQuoteView = Readonly<{
  kind: 'quoted'
  planRef: string
  planDigest: string
  totalAudUnits: string
  totalLabel: string
  expiresAt: number
  expired: boolean
  nodes: readonly PlanNodeLineView[]
  stages: readonly PlanStageView[]
  dataFlows: readonly PlanDataFlowView[]
}>

export type PlanQuoteRefusalView = Readonly<{
  kind: 'refused'
  code: PlanValidationRefusalCode
  nodeId?: PlanNodeId
  message: string
}>

export type PlanConfirmationView = PlanConfirmationQuoteView | PlanQuoteRefusalView

export type PlanRunView = Readonly<{
  kind: 'run'
  planRef: string
  state: PlanState
  stateLabel: string
  detail: string
  pendingApproval: boolean
  settlementUncertain: boolean
}> | Readonly<{
  kind: 'refused'
  code: PlanRunRefusalCode
  message: string
}>

const priceClassLabels: Readonly<Record<PlanNodeQuote['priceClass'], string>> = {
  fixed: 'Fixed price',
  cardinality_bounded: 'Bounded by item count',
  upto_bounded: 'Up to this ceiling',
  unknown: 'Price class unknown',
}

function exactAudLabel(units: string, exponent: number): string {
  return formatCurrencyAmount({ currency: 'AUD', units, exponent })
}

function nodeLineView(node: PlanNodeQuote, exponent: number): PlanNodeLineView {
  return {
    nodeId: node.nodeId,
    toolRef: node.toolRef,
    dependencies: node.dependsOn,
    dependenciesLabel: node.dependsOn.length === 0 ? 'None' : node.dependsOn.map(String).join(', '),
    inputMode: node.inputMode,
    inputModeLabel: node.inputMode === 'deferred' ? 'Uses an earlier Node result' : 'Provided with this Plan',
    priceClass: node.priceClass,
    priceClassLabel: priceClassLabels[node.priceClass],
    ceilingAudUnits: node.ceilingAudUnits,
    ceilingLabel: exactAudLabel(node.ceilingAudUnits, exponent),
    ...(node.rateToleranceBps === undefined ? {} : { rateToleranceLabel: `${node.rateToleranceBps / 100}% FX allowance included in this maximum` }),
  }
}

function stageView(nodeIds: readonly PlanNodeId[], index: number): PlanStageView {
  const names = nodeIds.map(String)
  return {
    index,
    label: `Stage ${index + 1}`,
    nodeIds,
    description: names.length > 1
      ? `${names.join(', ')} can run in parallel after approval.`
      : `${names[0] ?? 'No Nodes'} runs after approval.`,
  }
}

function quoteRefusalMessage(code: string, nodeId?: PlanNodeId): string {
  const target = nodeId === undefined ? '' : ` Node ${nodeId} is affected.`
  return `This Plan could not be quoted (${code}).${target}`
}

export function mapPlanQuoteResult(result: PlanQuoteResult, now: number, providerHosts: Readonly<Record<string, string>> = {}, plan?: PlanJson): PlanConfirmationView {
  if (result.kind === 'refused') {
    return {
      kind: 'refused',
      code: result.code,
      ...(result.nodeId === undefined ? {} : { nodeId: result.nodeId }),
      message: quoteRefusalMessage(result.code, result.nodeId),
    }
  }

  const quote = result
  const nodeById = new Map(quote.nodes.map((node) => [node.nodeId, node]))
  return {
    kind: 'quoted',
    planRef: quote.planRef,
    planDigest: quote.planDigest,
    totalAudUnits: quote.approvedTotalAudUnits,
    totalLabel: exactAudLabel(quote.approvedTotalAudUnits, quote.exponent),
    expiresAt: quote.expiresAt,
    expired: !Number.isSafeInteger(now) || quote.expiresAt <= now,
    nodes: quote.nodes.map((node) => ({ ...nodeLineView(node, quote.exponent), ...(providerHosts[node.nodeId] === undefined ? {} : { providerHost: providerHosts[node.nodeId] }),
      ...(plan?.nodes.find(item => item.id === node.nodeId) === undefined ? {} : { inputJson: JSON.stringify(plan.nodes.find(item => item.id === node.nodeId)?.input, null, 2) }) })),
    stages: quote.stages.map((nodeIds, index) => stageView(nodeIds, index)),
    dataFlows: quote.dataFlows.map((flow) => ({
      from: flow.from,
      to: flow.to,
      destinationProviderHost: flow.destinationProviderHost,
      validation: nodeById.get(flow.to)?.validation ?? 'untyped_ref',
    })),
  }
}

const planStateLabels: Readonly<Record<PlanState, string>> = {
  quoted: 'Quoted',
  awaiting_approval: 'Awaiting approval',
  running: 'Running',
  succeeded: 'Succeeded',
  partially_succeeded: 'Partially succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  reconciliation_required: 'Reconciliation required',
}

function runDetail(state: PlanState): string {
  if (state === 'awaiting_approval') return 'No Hold or Provider Call is created while owner approval is pending.'
  if (state === 'quoted') return 'This Quote has not created a Hold or Provider Call.'
  if (state === 'reconciliation_required') return 'A financial outcome is uncertain; do not assume settlement or release.'
  return 'Plan status does not replace the individual Call receipts or their financial evidence.'
}

export function mapPlanRunResult(result: PlanRunResult): PlanRunView {
  if (result.kind === 'refused') {
    return {
      kind: 'refused',
      code: result.code,
      message: `The Plan could not be started (${result.code}).`,
    }
  }
  return {
    kind: 'run',
    planRef: result.planRef,
    state: result.state,
    stateLabel: planStateLabels[result.state],
    detail: runDetail(result.state),
    pendingApproval: result.state === 'awaiting_approval',
    settlementUncertain: result.state === 'reconciliation_required',
  }
}

export type PlanProgressView = Readonly<{
  planRef: string
  stateLabel: string
  phase: 'running' | 'waiting' | 'done' | 'stopped'
  detail: string
  facts: readonly Readonly<{ label: string; value: string }>[]
  stages: readonly Readonly<{ id: string; label: string; description: string; status: 'complete' | 'current' | 'error' | 'upcoming'; statusLabel: string }>[]
  currentStage: number
  money: Readonly<{ settled: string; released: string; held: string; uncertain: boolean }>
  nodes: readonly Readonly<{ nodeId: string; providerHost: string; stateLabel: string; callRef?: string; outcome?: string; receipt?: CallReceiptView; outputJson?: string }>[]
}>

export function mapPlanProgress(result: Extract<PlanGetResult, { kind: 'available' }>, callStatuses: readonly PublicCallStatusRead[]): PlanProgressView {
  const phase = result.state === 'running' ? 'running' : result.state === 'succeeded' ? 'done'
    : ['quoted', 'awaiting_approval', 'reconciliation_required'].includes(result.state) ? 'waiting' : 'stopped'
  const stages: PlanProgressView['stages'] = result.stages.map((ids, index) => {
    const nodes = result.nodes.filter(node => ids.includes(node.nodeId))
    const state = nodes.every(node => node.state === 'succeeded') ? 'complete' : nodes.some(node => node.state === 'admitted' || node.state === 'ready') ? 'current'
      : nodes.some(node => node.state === 'failed' || node.state === 'skipped') ? 'error' : 'upcoming'
    return { id: `stage-${index}`, label: `Stage ${index + 1}`, description: ids.join(', '), status: state,
      statusLabel: state === 'complete' ? 'Completed' : state === 'current' ? 'In progress' : state === 'error' ? 'Stopped or skipped' : 'Waiting' }
  })
  const firstActive = stages.findIndex(stage => stage.status !== 'complete')
  return { planRef: result.planRef, stateLabel: planStateLabels[result.state], phase, detail: runDetail(result.state),
    facts: [{ label: 'Maximum authorized', value: exactAudLabel(result.approvedTotalAudUnits, 6) },
      { label: 'Nodes completed', value: `${result.nodes.filter(node => node.state === 'succeeded').length} of ${result.nodes.length}` },
      { label: 'Held credit', value: result.hold.heldAudUnits === undefined ? result.hold.status === 'none' ? 'No Hold' : 'Unconfirmed' : exactAudLabel(result.hold.heldAudUnits, 6) }],
    stages, currentStage: firstActive === -1 ? stages.length : firstActive,
    money: { settled: exactAudLabel(result.hold.settledAudUnits, 6), released: exactAudLabel(result.hold.releasedAudUnits, 6),
      held: result.hold.heldAudUnits === undefined ? result.hold.status === 'none' ? 'No Hold' : 'Unconfirmed' : exactAudLabel(result.hold.heldAudUnits, 6),
      uncertain: result.hold.status === 'uncertain' },
    nodes: result.nodes.map(node => {
      const status = node.callRef === undefined ? undefined : callStatuses.find(item => item.callRef === node.callRef)
      return { nodeId: node.nodeId, providerHost: node.providerHost,
        stateLabel: ({ waiting: 'Waiting', ready: 'Ready', admitted: 'Call in progress', succeeded: 'Succeeded', failed: 'Failed', skipped: 'Skipped' } as const)[node.state],
        ...(node.callRef === undefined ? {} : { callRef: node.callRef }), ...(node.outcome === undefined ? {} : { outcome: node.outcome }),
        ...(status === undefined ? {} : { receipt: projectCallReceipt(status) }),
        ...(node.result?.kind === 'completed' ? { outputJson: JSON.stringify(node.result.output, undefined, 2) } : {}),
      }
    }),
  }
}
