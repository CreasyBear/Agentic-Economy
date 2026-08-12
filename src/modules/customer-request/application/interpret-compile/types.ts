import type { CapabilityContractRef, CapabilityDecisionModel } from '@/modules/capability-contract/public'
import type {
  AdmittedOperationRef,
  PublicOperationRef,
  RegisteredOperationMapping,
} from '@/modules/capability-supply/public'
import type {
  CompileCustomerRequestResult,
  CustomerReportedRouteExclusion,
} from '@/modules/customer-request/compiler'
import type {
  RegisteredEvaluationBinding,
  RegisteredSupplyPrice,
  RequestFact,
} from '@/modules/customer-request/evaluation'
import type { PricingConfig } from '@/modules/money/public'
import type { CustomerRequestSemanticProposal } from '@/modules/customer-request/semantic-interpreter'
import type { ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
export type EligibleSupply = Readonly<{
  offering: Readonly<{
    offeringId: string
    businessId: string
    networkId: string
    capabilityId: string
    version: number
    contractDigest: string
    presentation: Readonly<{
      label: string
      summary: string
      price: RegisteredSupplyPrice
      commercialRelationship: Readonly<{
        kind: 'none' | 'direct' | 'affiliate' | 'ownership'
        summary: string
        influencesEligibility: boolean
        influencesInclusion: boolean
        influencesOrder: boolean
        evidenceRefs: readonly string[]
      }>
    }>
    searchTerms?: readonly string[]
    registrationHash: string
  }>
  publication?: Readonly<{
    operationRef: PublicOperationRef
    admittedOperation: AdmittedOperationRef
    publicationRef: string
    revision: number
    readinessValidUntil: number
    pricingConfig: PricingConfig
    priceDigest: string
  }>
  binding: Readonly<{
    bindingId: string
    offeringId: string
    networkId: string
    capabilityId: string
    version: number
    contractDigest: string
    registrationHash: string
    cancellation: Readonly<{
      kind: 'unsupported' | 'adapter_managed'
      evidenceRefs: readonly string[]
    }>
  }>
}>

export type EligibleSupplyResult = Readonly<
  | { kind: 'available'; supplies: readonly EligibleSupply[] }
  | { kind: 'unavailable'; reason: string }
>

export type ExactContractResult = Readonly<
  | { kind: 'found'; ref: CapabilityContractRef; documentJson: string; registeredAt: number }
  | { kind: 'unavailable'; reason: string }
>

export type RequestGraph = Readonly<{
  kind: 'available'
  models: readonly CapabilityDecisionModel[]
  descriptors: readonly ServerCapabilityDescriptor[]
  bindings: readonly RegisteredEvaluationBinding[]
  mappings: readonly RegisteredOperationMapping[]
  registrySnapshotDigest: string
}>
/**
 * `no_routeable_supply` is a fact about the world: no registered business is currently routeable
 * on this network, so retrying cannot change the answer. `graph_unreadable` is an AE-side fault
 * where supply exists but its contracts could not be assembled, which a retry may clear.
 */
export type RequestGraphUnavailable = Readonly<{
  kind: 'unavailable'
  reason: 'no_routeable_supply' | 'graph_unreadable'
}>

export type CompileCommitInput = Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  expectedRevision: number
  expectedRouteGeneration: number
  principalId: string
  delegatedAgentId: string
  intent: string
  networkId: string
  priorFacts: readonly RequestFact[]
  routeExclusions?: readonly CustomerReportedRouteExclusion[]
  proposal: CustomerRequestSemanticProposal
  interpreterId: string
  graph: RequestGraph
  now: number
  compiledResult?: Extract<CompileCustomerRequestResult, { kind: 'compiled' }>
}>

export type CommitResult = Readonly<
  | { kind: 'stored' | 'replayed'; requestId: string; revision: number }
  | {
      kind: 'revision_conflict' | 'route_generation_conflict' | 'identity_conflict'
        | 'command_conflict' | 'aggregate_invalid' | 'context_stale'
    }
>

export type CommandReplayResult = Readonly<
  | { kind: 'not_found' }
  | { kind: 'conflict' }
  | {
      kind: 'resubmit_required'
      requestId: string
      revision: number
      reason: 'legacy_embedded_route'
    }
  | { kind: 'replayed'; aggregate: unknown; routeGenerationRef?: string; noEffect: boolean }
>
