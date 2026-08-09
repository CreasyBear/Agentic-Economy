import {
  createPublicOperationRef,
  isPublicOperationRef,
  resolveRegisteredOperationMappingRef,
  validateAdmittedOperationRef,
  type PublicOperationRef,
  type RegisteredOperationMapping,
} from '@/modules/capability-supply/public'
import {
  openCapabilityDecisionModel,
  parseCapabilityContractJson,
  projectCapabilityInputValueSchemas,
  sameCapabilityContractRef,
  type CapabilityContract,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { exactContractRefKey } from '@/modules/customer-request/contract-ref-key'
import { classifyDeclaredCapabilityDomain } from './capability-domain'
import { bindCustomerCapabilityDescriptor, type ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
import {
  requestRegistrySnapshotDigest,
  type RegisteredEvaluationBinding,
} from '@/modules/customer-request/evaluation'

import type {
  EligibleSupply,
  EligibleSupplyResult,
  ExactContractResult,
  RequestGraph,
  RequestGraphUnavailable,
} from './types'
export type LoadRequestGraphPorts = Readonly<{
  listRouteable: (networkId: string) => Promise<EligibleSupplyResult>
  getActiveExact: (ref: CapabilityContractRef) => Promise<ExactContractResult>
  listMappings: (networkId: string) => Promise<readonly RegisteredOperationMapping[]>
}>

export type RequestGraphLimits = Readonly<{
  maximumDescriptorBytes: number
  maximumContractProjectedInputSchemaBytes: number
}>

export async function loadRequestGraph(
  networkId: string,
  ports: LoadRequestGraphPorts,
  limits: RequestGraphLimits,
): Promise<RequestGraph | RequestGraphUnavailable> {
  const supply = await ports.listRouteable(networkId)
  if (supply.kind !== 'available') return { kind: 'unavailable', reason: 'graph_unreadable' }
  if (supply.supplies.length === 0) return { kind: 'unavailable', reason: 'no_routeable_supply' }
  const mappings = await ports.listMappings(networkId)
  return assembleRequestGraph(supply.supplies, ports.getActiveExact, limits, mappings)
}

export async function assembleRequestGraph(
  supplies: readonly EligibleSupply[],
  getActiveExact: (ref: CapabilityContractRef) => Promise<ExactContractResult>,
  limits: RequestGraphLimits,
  mappings: readonly RegisteredOperationMapping[] = [],
): Promise<RequestGraph | RequestGraphUnavailable> {
  const modelsByRef = new Map<string, CapabilityDecisionModel>()
  const contractsByRef = new Map<string, Readonly<{
    model: CapabilityDecisionModel
    name: string
    description: string
    inputSchema: CapabilityContract['inputSchema']
    inputExamples: CapabilityContract['inputExamples']
  }>>()
  const operationRefsByRef = new Map<string, Set<PublicOperationRef>>()
  // Registry discovery vocabulary (offering searchTerms), per exact contract. Surfaced to the
  // SERVER-side deterministic interpreter so it can match the same vocabulary discovery uses
  // (e.g. coingecko's 'bitcoin price' searchTerms), without expanding the model payload.
  const searchTermsByRef = new Map<string, Set<string>>()
  const bindings: RegisteredEvaluationBinding[] = []
  for (const mapping of mappings) {
    try {
      if (mapping.mappingRef !== resolveRegisteredOperationMappingRef(mapping)) {
        return { kind: 'unavailable', reason: 'graph_unreadable' }
      }
    } catch {
      return { kind: 'unavailable', reason: 'graph_unreadable' }
    }
  }
  for (const item of supplies) {
    const publication = item.publication
    if (publication === undefined
      || !isPublicOperationRef(publication.operationRef)
      || !validateAdmittedOperationRef(publication.admittedOperation)) {
      return { kind: 'unavailable', reason: 'graph_unreadable' }
    }
    const contractRef = {
      capabilityId: item.binding.capabilityId,
      version: item.binding.version,
      contractDigest: item.binding.contractDigest,
    }
    const admitted = publication.admittedOperation
    if (admitted.publicationRef !== publication.publicationRef
      || admitted.publicationRevision !== publication.revision
      || !sameCapabilityContractRef(admitted.contractRef, contractRef)
      || admitted.businessId !== String(item.offering.businessId)
      || admitted.offeringId !== item.offering.offeringId
      || admitted.bindingId !== item.binding.bindingId
      || admitted.offeringRegistrationHash !== item.offering.registrationHash
      || admitted.bindingRegistrationHash !== item.binding.registrationHash
      || admitted.readinessValidUntil !== publication.readinessValidUntil
      || createPublicOperationRef({
        operationId: admitted.operationId,
        publicationRef: publication.publicationRef,
        publicationRevision: publication.revision,
        contractRef,
      }) !== publication.operationRef) {
      return { kind: 'unavailable', reason: 'graph_unreadable' }
    }
    const key = exactContractRefKey(contractRef)
    let model = modelsByRef.get(key)
    if (model === undefined) {
      const stored = await getActiveExact(contractRef)
      if (stored.kind !== 'found') return { kind: 'unavailable', reason: 'graph_unreadable' }
      const contract = parseCapabilityContractJson(stored.documentJson)
      if (!sameCapabilityContractRef(contract.ref, contractRef)) return { kind: 'unavailable', reason: 'graph_unreadable' }
      model = openCapabilityDecisionModel(contract)
      modelsByRef.set(key, model)
      contractsByRef.set(key, {
        model,
        name: contract.name,
        description: contract.description,
        inputSchema: contract.inputSchema,
        inputExamples: contract.inputExamples,
      })
    }
    let operationRefs = operationRefsByRef.get(key)
    if (operationRefs === undefined) {
      operationRefs = new Set<PublicOperationRef>()
      operationRefsByRef.set(key, operationRefs)
    }
    operationRefs.add(publication.operationRef)
    if (item.offering.searchTerms !== undefined && item.offering.searchTerms.length > 0) {
      let searchTerms = searchTermsByRef.get(key)
      if (searchTerms === undefined) {
        searchTerms = new Set<string>()
        searchTermsByRef.set(key, searchTerms)
      }
      for (const term of item.offering.searchTerms) searchTerms.add(term)
    }
    bindings.push({
      operationRef: publication.operationRef,
      admittedOperation: publication.admittedOperation,
      businessId: String(item.offering.businessId),
      offeringId: item.offering.offeringId,
      bindingId: item.binding.bindingId,
      contractRef: model.contractRef,
      offeringRegistrationHash: item.offering.registrationHash,
      bindingRegistrationHash: item.binding.registrationHash,
      price: item.offering.presentation.price,
      commercialRelationship: {
        ...item.offering.presentation.commercialRelationship,
        evidenceRefs: [...item.offering.presentation.commercialRelationship.evidenceRefs],
      },
      cancellation: {
        ...item.binding.cancellation,
        evidenceRefs: [...item.binding.cancellation.evidenceRefs],
      },
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      readinessValidUntil: publication.readinessValidUntil,
    })
  }
  const descriptors: ServerCapabilityDescriptor[] = []
  let descriptorBytes = 0
  for (const [key, source] of contractsByRef) {
    const operationRefs = [...(operationRefsByRef.get(key) ?? [])].sort()
    const operationRef = operationRefs[0]
    if (operationRef === undefined) return { kind: 'unavailable', reason: 'graph_unreadable' }
    try {
      const domainFromCatalog = classifyDeclaredCapabilityDomain(
        searchTermsByRef.get(key) === undefined ? [] : [...searchTermsByRef.get(key) ?? []],
        source.name,
        source.description,
      )
      const descriptor = bindCustomerCapabilityDescriptor({
        operationRef: operationRef,
        operationRefs,
        contractRef: source.model.contractRef,
        selectionKey: source.model.selectionKey,
        name: source.name,
        description: source.description,
        inputs: source.model.inputs,
        valueSchemas: projectCapabilityInputValueSchemas(
          source.inputSchema,
          source.model.inputs,
          limits.maximumContractProjectedInputSchemaBytes,
        ),
        evidence: source.model.evidence.map(({ label, purpose, schemaIdentity, semanticIdentity, guaranteed }) => ({
          label, purpose, schemaIdentity, guaranteed,
          ...(semanticIdentity === undefined ? {} : { semanticIdentity }),
        })),
        ...(searchTermsByRef.get(key) === undefined ? {} : { searchTerms: [...searchTermsByRef.get(key) ?? []] }),
        // Declared, data-driven domain derived once from the capability's registry-taught surface
        // (the searchTerms declared on the curated catalog source) and stamped so the cross-cap
        // guard keys off declared domains rather than re-regexing free text on every request.
        domain: domainFromCatalog,
        ...(source.inputExamples === undefined ? {} : { inputExamples: source.inputExamples }),
      })
      descriptorBytes += new TextEncoder().encode(JSON.stringify(descriptor)).byteLength
      if (descriptorBytes > limits.maximumDescriptorBytes) return { kind: 'unavailable', reason: 'graph_unreadable' }
      descriptors.push(descriptor)
    } catch {
      return { kind: 'unavailable', reason: 'graph_unreadable' }
    }
  }
  const registrySnapshotDigest = requestRegistrySnapshotDigest(bindings)
  return {
    kind: 'available',
    models: [...modelsByRef.values()],
    descriptors,
    bindings,
    mappings,
    registrySnapshotDigest,
  }
}
