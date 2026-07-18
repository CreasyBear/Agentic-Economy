import type { CapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { CapabilityBindingRow } from '../binding'
import { bindingIntegrityIsValid } from '../binding'
import {
  bindingEligibilityIsValid,
  MAX_ELIGIBLE_SUPPLY,
  offeringEligibilityIsValid,
} from '../eligibility'
import type { CapabilityOfferingRow } from '../offering'
import { contractRefFromRow, offeringIntegrityIsValid } from '../offering'
import {
  publicationLifecycle,
  type PublicationLifecycle,
} from '../publication'
import { MAX_CONTEXT_VALUE_LENGTH, boundedTrimmed } from '../shared'

import type {
  CapabilityGraphPorts,
  GraphPublicationRow,
  GraphPublishedBusiness,
} from './ports'

export type CapabilityGraphNode = Readonly<{
  publicationRef: string
  revision: number
  businessId: string
  contractRef: ReturnType<typeof contractRefFromRow>
  offeringId: string
  bindingId: string
  source: Readonly<{ kind: GraphPublicationRow['sourceKind']; digest: string }>
  semantic: Readonly<{
    capabilityId: string
    name: string
    description: string
    inputSchemaDigest: string
    outputSchemaDigest: string
    customerAnnotations: readonly Readonly<{
      annotationId: string
      document: 'input' | 'output'
      pointer: string
      label: string
      role: CapabilityContract['customerAnnotations'][number]['role']
      semanticIdentity?: string
      inference?: 'allowed' | 'customer_required'
    }>[]
    searchTerms: readonly string[]
  }>
  policy: Readonly<{
    effects: CapabilityContract['effects']
    dataUse: CapabilityContract['dataUse']
    lifecycle: CapabilityContract['lifecycle']
  }>
  cost: Readonly<{
    price: CapabilityOfferingRow['presentation']['price']
    commercialRelationship: CapabilityOfferingRow['presentation']['commercialRelationship']
  }>
  trust: Readonly<{ tier: string; publicStatus: string }>
  liveness: Readonly<{
    credentialState: GraphPublicationRow['credentialState']
    healthState: GraphPublicationRow['healthState']
    observedAt?: number
    validUntil?: number
    stale: boolean
  }>
  routability: Readonly<{ eligible: boolean; reasons: readonly string[] }>
  evidenceRefs: readonly string[]
}>

export type CapabilityGraphEdge = Readonly<{
  kind: 'published_by' | 'bound_to' | 'schema_compatible'
  from: string
  to: string
}>

export type QueryCapabilityGraphResult =
  | Readonly<{ kind: 'available'; nodes: CapabilityGraphNode[]; edges: CapabilityGraphEdge[] }>
  | Readonly<{
    kind: 'unavailable'
    reason:
      | 'query_invalid'
      | 'graph_limit_exceeded'
      | 'graph_integrity_failure'
  }>

export async function queryCapabilityGraph(
  ports: CapabilityGraphPorts,
  args: Readonly<{
    networkId: string
    includeInactive: boolean
    limit: number
    now?: number
  }>,
): Promise<QueryCapabilityGraphResult> {
  if (
    !boundedTrimmed(args.networkId, MAX_CONTEXT_VALUE_LENGTH)
    || !Number.isSafeInteger(args.limit)
    || args.limit < 1
    || args.limit > MAX_ELIGIBLE_SUPPLY
  ) {
    return { kind: 'unavailable' as const, reason: 'query_invalid' as const }
  }
  const publications = await ports.listCurrentPublicationsByNetwork(
    args.networkId,
    args.limit + 1,
  )
  if (publications.length > args.limit) {
    return { kind: 'unavailable' as const, reason: 'graph_limit_exceeded' as const }
  }
  const now = args.now ?? Date.now()
  const nodes: CapabilityGraphNode[] = []
  for (const publication of [...publications].sort((left, right) => (
    left.publicationRef.localeCompare(right.publicationRef)
  ))) {
    const offering = await ports.loadOfferingByOfferingId(publication.offeringId)
    const binding = await ports.loadBindingByBindingId(publication.bindingId)
    const business = await ports.loadPublishedBusiness(publication.businessId)
    const contract = await ports.getExactRegisteredCapabilityContract(
      contractRefFromRow(publication),
    )
    if (
      offering === null
      || binding === null
      || business === null
      || contract.kind !== 'found'
      || !offeringIntegrityIsValid(offering)
      || !bindingIntegrityIsValid(binding)
      || !offeringEligibilityIsValid(offering)
      || !bindingEligibilityIsValid(binding)
    ) {
      return { kind: 'unavailable' as const, reason: 'graph_integrity_failure' as const }
    }
    const lifecycle = publicationLifecycle(publication, offering, binding, now)
    if (!args.includeInactive && lifecycle.state !== 'active') continue
    nodes.push(projectGraphNode({
      publication,
      offering,
      binding,
      contract: contract.contract,
      business,
      now,
      lifecycle,
    }))
  }
  return { kind: 'available' as const, nodes, edges: projectGraphEdges(nodes) }
}

function projectGraphNode(input: Readonly<{
  publication: GraphPublicationRow
  offering: CapabilityOfferingRow
  binding: CapabilityBindingRow
  contract: CapabilityContract
  business: GraphPublishedBusiness
  now: number
  lifecycle: PublicationLifecycle
}>): CapabilityGraphNode {
  const { publication, offering, binding, contract, business, now, lifecycle } = input
  return {
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    businessId: publication.businessId,
    contractRef: contractRefFromRow(publication),
    offeringId: publication.offeringId,
    bindingId: publication.bindingId,
    source: { kind: publication.sourceKind, digest: publication.sourceDigest },
    semantic: {
      capabilityId: contract.capabilityId,
      name: contract.name,
      description: contract.description,
      inputSchemaDigest: canonicalDigest(contract.inputSchema as StableHashValue),
      outputSchemaDigest: canonicalDigest(contract.outputSchema as StableHashValue),
      customerAnnotations: contract.customerAnnotations.map((annotation) => ({
        annotationId: annotation.annotationId,
        document: annotation.document,
        pointer: annotation.pointer,
        label: annotation.label,
        role: annotation.role,
        ...(annotation.semanticIdentity === undefined
          ? {}
          : { semanticIdentity: annotation.semanticIdentity }),
        ...(annotation.inference === undefined ? {} : { inference: annotation.inference }),
      })),
      searchTerms: offering.searchTerms,
    },
    policy: {
      effects: contract.effects,
      dataUse: contract.dataUse,
      lifecycle: contract.lifecycle,
    },
    cost: {
      price: offering.presentation.price,
      commercialRelationship: offering.presentation.commercialRelationship,
    },
    trust: { tier: business.trustTier, publicStatus: business.publicStatus },
    liveness: {
      credentialState: publication.credentialState,
      healthState: publication.healthState,
      ...(publication.readinessObservedAt === undefined
        ? {}
        : { observedAt: publication.readinessObservedAt }),
      ...(publication.readinessValidUntil === undefined
        ? {}
        : { validUntil: publication.readinessValidUntil }),
      stale: publication.readinessValidUntil !== undefined
        && publication.readinessValidUntil < now,
    },
    routability: { eligible: lifecycle.state === 'active', reasons: lifecycle.reasons },
    evidenceRefs: [...new Set([
      ...publication.registrationEvidenceRefs,
      ...publication.readinessEvidenceRefs,
      ...offering.registrationEvidenceRefs,
      ...binding.registrationEvidenceRefs,
    ])].sort(),
  }
}

function projectGraphEdges(nodes: readonly CapabilityGraphNode[]): CapabilityGraphEdge[] {
  const edges: CapabilityGraphEdge[] = nodes.flatMap((node) => [
    { kind: 'published_by' as const, from: node.publicationRef, to: `business:${node.businessId}` },
    { kind: 'bound_to' as const, from: node.publicationRef, to: node.bindingId },
  ])
  for (const upstream of nodes) {
    for (const downstream of nodes) {
      if (
        upstream.publicationRef !== downstream.publicationRef
        && upstream.semantic.outputSchemaDigest === downstream.semantic.inputSchemaDigest
      ) {
        edges.push({
          kind: 'schema_compatible' as const,
          from: upstream.publicationRef,
          to: downstream.publicationRef,
        })
      }
    }
  }
  return edges
}
