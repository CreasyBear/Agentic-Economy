import { formatCurrencyAmount } from '@/modules/money/public'

import type {
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
  dependencies: readonly PlanNodeId[]
  dependenciesLabel: string
  inputMode: PlanNodeQuote['inputMode']
  inputModeLabel: string
  priceClass: PlanNodeQuote['priceClass']
  priceClassLabel: string
  ceilingAudUnits: string
  ceilingLabel: string
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

/** A run status is not an aggregate financial receipt; amounts remain owned by each Call receipt. */
export type PlanReceiptView = Readonly<{
  kind: 'status_only'
  planRef: string
  state: PlanState
  title: string
  detail: string
  callReceiptsAvailable: false
}> | Readonly<{
  kind: 'unavailable'
  title: string
  detail: string
  callReceiptsAvailable: false
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

export function mapPlanQuoteResult(result: PlanQuoteResult, now: number): PlanConfirmationView {
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
    nodes: quote.nodes.map((node) => nodeLineView(node, quote.exponent)),
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

export function mapPlanReceiptResult(result: PlanRunResult): PlanReceiptView {
  if (result.kind === 'refused') {
    return {
      kind: 'unavailable',
      title: 'Plan receipt unavailable',
      detail: `No Plan receipt is available because the run was refused (${result.code}).`,
      callReceiptsAvailable: false,
    }
  }
  const stateLabel = planStateLabels[result.state]
  return {
    kind: 'status_only',
    planRef: result.planRef,
    state: result.state,
    title: `Plan ${stateLabel.toLowerCase()}`,
    detail: result.state === 'reconciliation_required'
      ? 'Financial outcome is uncertain. Individual Call receipts and reconciliation evidence are required before claiming settlement or release.'
      : result.state === 'awaiting_approval'
        ? 'Approval is pending. No Hold or Provider Call is created yet.'
        : 'This Plan status contains no individual Call receipts or settled amounts. Use each Call receipt as the financial record.',
    callReceiptsAvailable: false,
  }
}
