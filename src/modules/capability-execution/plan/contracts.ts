import type { JsonValue } from '@/modules/common/bounded-json'
import type { Brand } from '@/modules/common/ids'

export type PlanRef = Brand<string, 'PlanRef'>
export type PlanNodeId = Brand<string, 'PlanNodeId'>
export type FlowRef = Brand<string, 'FlowRef'>
export type ToolRef = Brand<string, 'ToolRef'>
export type AudUnits = Brand<string, 'AudUnits'>
export type JsonPointer = Brand<string, 'JsonPointer'>
export type { JsonValue }

export type PlanNodePriceClass = 'fixed' | 'cardinality_bounded' | 'upto_bounded' | 'unknown'
export type PlanNodeBounds = Readonly<Record<JsonPointer, Readonly<{ maxItems: number }>>>
export type PlanTransform =
  | Readonly<{ $map: Readonly<{ from: FlowRef; path?: JsonPointer }> }>
  | Readonly<{ $concat: readonly (string | FlowRef | readonly JsonValue[])[] }>
export type PlanInput = JsonValue | FlowRef | PlanTransform
export type PlanNode = Readonly<{
  id: PlanNodeId
  toolRef: ToolRef
  input: Readonly<Record<string, PlanInput>>
  dependsOn: readonly PlanNodeId[]
  bounds?: PlanNodeBounds
}>
export type MercatorNode = Readonly<{
  id: PlanNodeId
  serviceId: string
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  path: string
  input: Readonly<Record<string, PlanInput>>
  dependsOn: readonly PlanNodeId[]
}>
export type PlanJson = Readonly<{ nodes: readonly PlanNode[] }>
export type PlanRateEvidence = Readonly<{ source: string; observedAt: number; digest: string }>

export type PlanNodeQuote = Readonly<{
  nodeId: PlanNodeId
  toolRef: ToolRef
  inputMode: 'literal' | 'deferred'
  priceClass: PlanNodePriceClass
  pricingDigest: string
  bounds?: PlanNodeBounds
  ceilingAudUnits: AudUnits
  rateEvidence?: PlanRateEvidence
  rateToleranceBps?: number
  validation: 'typed' | 'untyped_ref'
  dependsOn: readonly PlanNodeId[]
}>
export type PlanState = 'quoted' | 'awaiting_approval' | 'running' | 'succeeded' | 'partially_succeeded' | 'failed' | 'cancelled' | 'expired' | 'reconciliation_required'
export type NodeState = 'waiting' | 'ready' | 'admitted' | 'succeeded' | 'failed' | 'skipped'
export type NoCallOutcome = 'skipped' | 'input_invalid' | 'ref_type_mismatch' | 'input_exceeds_bound' | 'price_exceeded_ceiling' | 'cancelled'
export type PlanAuthority = Readonly<{
  format: 'plan'
  planRef: PlanRef
  planDigest: string
  approvedTotalAudUnits: AudUnits
  nodeCeilings: readonly Readonly<{ nodeId: PlanNodeId; ceilingAudUnits: AudUnits }>[]
  grantRef: string
  grantGeneration: number
  grantDigest: string
  expiresAt: number
}>
export type PlanNodeAuthority = Readonly<{
  format: 'plan_node'
  planRef: PlanRef
  planAuthorityDigest: string
  nodeId: PlanNodeId
  resolvedInputDigest: string
  ceilingAudUnits: AudUnits
}>
export type PlanNodeAuthorityBasis = Readonly<{
  kind: 'plan_node'
  planRef: PlanRef
  planAuthorityDigest: string
  nodeId: PlanNodeId
  resolvedInputDigest: string
  ceilingAudUnits: AudUnits
}>
export type PlanQuote = Readonly<{
  kind: 'quoted'
  planRef: PlanRef
  planDigest: string
  nodes: readonly PlanNodeQuote[]
  stages: readonly (readonly PlanNodeId[])[]
  approvedTotalAudUnits: AudUnits
  currency: 'AUD'
  exponent: 6
  expiresAt: number
  rateEvidence?: PlanRateEvidence
  dataFlows: readonly Readonly<{ from: PlanNodeId; to: PlanNodeId; destinationProviderHost: string }>[]
}>
export type PlanQuoteInput = Readonly<{ plan: PlanJson }>
export type PlanRunInput = Readonly<{ planRef: PlanRef; approvedTotalAudUnits: AudUnits; idempotencyKey: string }>
export type PlanValidationRefusalCode =
  | 'plan_empty' | 'plan_too_large' | 'duplicate_node_id' | 'unknown_dependency' | 'cycle'
  | 'duplicate_dependency' | 'plan_too_deep'
  | 'ref_not_in_depends_on' | 'bad_pointer' | 'tool_not_admitted' | 'input_schema_mismatch'
  | 'ref_type_mismatch' | 'deferred_node_dynamic_price' | 'bound_missing_for_cardinality_price'
  | 'probe_failed' | 'ceiling_exceeds_per_call_cap' | 'total_exceeds_available'
export type PlanRunRefusalCode =
  | 'plan_quote_expired' | 'plan_changed' | 'approved_total_mismatch' | 'grant_changed'
  | 'approval_required' | 'total_exceeds_available' | 'hold_unavailable'
  | 'idempotency_key_reused' | 'plan_not_found' | 'plan_access_denied' | 'plan_not_cancellable'
  | 'mfa_reverification_required'
export type NodeRefusalCode =
  | 'input_invalid' | 'ref_type_mismatch' | 'input_exceeds_bound'
  | 'price_exceeded_ceiling' | 'tool_not_ready' | 'reconciliation_required'
export type PlanValidationRefusal = Readonly<{ kind: 'refused'; code: PlanValidationRefusalCode; nodeId?: PlanNodeId }>
export type PlanQuoteResult = PlanQuote | PlanValidationRefusal
export type PlanRunResult =
  | Readonly<{ kind: 'running' | 'awaiting_approval' | 'replayed'; planRef: PlanRef; state: PlanState }>
  | Readonly<{ kind: 'refused'; code: PlanRunRefusalCode }>
