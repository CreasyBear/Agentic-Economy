import {
  openCapabilityDecisionModel,
  parseCapabilityContractJson,
  projectCapabilityInputValueSchemas,
  sameCapabilityContractRef,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { exactContractRefKey } from '@/modules/customer-request/contract-ref-key'
import { bindCustomerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
import { requestRegistrySnapshotDigest } from '@/modules/customer-request/evaluation'

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
  return assembleRequestGraph(supply.supplies, ports.getActiveExact, limits)
}

export async function assembleRequestGraph(
  supplies: readonly EligibleSupply[],
  getActiveExact: (ref: CapabilityContractRef) => Promise<ExactContractResult>,
  limits: RequestGraphLimits,
): Promise<RequestGraph | RequestGraphUnavailable> {
  const modelsByRef = new Map<string, CapabilityDecisionModel>()
  const descriptors: ReturnType<typeof bindCustomerCapabilityDescriptor>[] = []
  let descriptorBytes = 0
  const bindings = []
  for (const item of supplies) {
    const contractRef = {
      capabilityId: item.binding.capabilityId,
      version: item.binding.version,
      contractDigest: item.binding.contractDigest,
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
      let descriptor: ReturnType<typeof bindCustomerCapabilityDescriptor>
      try {
        descriptor = bindCustomerCapabilityDescriptor({
          contractRef: model.contractRef,
          selectionKey: model.selectionKey,
          name: contract.name,
          description: contract.description,
          inputs: model.inputs,
          valueSchemas: projectCapabilityInputValueSchemas(
            contract.inputSchema,
            model.inputs,
            limits.maximumContractProjectedInputSchemaBytes,
          ),
          evidence: model.evidence.map(({ label, purpose, schemaIdentity, semanticIdentity, guaranteed }) => ({
            label, purpose, schemaIdentity, guaranteed,
            ...(semanticIdentity === undefined ? {} : { semanticIdentity }),
          })),
        })
      } catch {
        return { kind: 'unavailable', reason: 'graph_unreadable' }
      }
      descriptorBytes += new TextEncoder().encode(JSON.stringify(descriptor)).byteLength
      if (descriptorBytes > limits.maximumDescriptorBytes) return { kind: 'unavailable', reason: 'graph_unreadable' }
      descriptors.push(descriptor)
    }
    bindings.push({
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
      ...(item.publication === undefined ? {} : {
        publicationRef: item.publication.publicationRef,
        publicationRevision: item.publication.revision,
        readinessValidUntil: item.publication.readinessValidUntil,
      }),
    })
  }
  const registrySnapshotDigest = requestRegistrySnapshotDigest(bindings)
  return {
    kind: 'available',
    models: [...modelsByRef.values()],
    descriptors,
    bindings,
    registrySnapshotDigest,
  }
}
