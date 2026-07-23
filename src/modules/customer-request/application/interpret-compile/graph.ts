import {
  type CapabilityContractRef,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import {
  openDurableCapabilityDecisionProjection,
} from '@/modules/capability-contract-registry/public'
import { requestRegistrySnapshotDigest } from '@/modules/customer-request/evaluation'
import { bindCustomerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'

import type {
  EligibleSupply,
  EligibleSupplyResult,
  ExactContractResult,
  RequestGraph,
} from './types'

export function exactRefKey(ref: CapabilityContractRef): string {
  return `${ref.capabilityId}\u0000${ref.version}\u0000${ref.contractDigest}`
}

export type LoadRequestGraphPorts = Readonly<{
  listEligible: (networkId: string) => Promise<EligibleSupplyResult>
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
): Promise<RequestGraph | Readonly<{ kind: 'unavailable' }>> {
  const supply = await ports.listEligible(networkId)
  if (supply.kind !== 'available' || supply.supplies.length === 0) return { kind: 'unavailable' }
  return assembleRequestGraph(supply.supplies, ports.getActiveExact, limits)
}

export async function assembleRequestGraph(
  supplies: readonly EligibleSupply[],
  getActiveExact: (ref: CapabilityContractRef) => Promise<ExactContractResult>,
  limits: RequestGraphLimits,
): Promise<RequestGraph | Readonly<{ kind: 'unavailable' }>> {
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
    const key = exactRefKey(contractRef)
    let model = modelsByRef.get(key)
    if (model === undefined) {
      const stored = await getActiveExact(contractRef)
      if (stored.kind !== 'found') return { kind: 'unavailable' }
      const opened = openDurableCapabilityDecisionProjection({
        ref: contractRef,
        documentJson: stored.documentJson,
        maximumProjectedInputSchemaBytes: limits.maximumContractProjectedInputSchemaBytes,
      })
      if (opened.kind !== 'found') return { kind: 'unavailable' }
      model = opened.model
      modelsByRef.set(key, model)
      let descriptor: ReturnType<typeof bindCustomerCapabilityDescriptor>
      try {
        descriptor = bindCustomerCapabilityDescriptor({
          contractRef: model.contractRef,
          selectionKey: model.selectionKey,
          name: opened.name,
          description: opened.description,
          inputs: model.inputs,
          valueSchemas: opened.valueSchemas,
          evidence: model.evidence.map(({ label, purpose, schemaIdentity, semanticIdentity, guaranteed }) => ({
            label, purpose, schemaIdentity, guaranteed,
            ...(semanticIdentity === undefined ? {} : { semanticIdentity }),
          })),
        })
      } catch {
        return { kind: 'unavailable' }
      }
      descriptorBytes += new TextEncoder().encode(JSON.stringify(descriptor)).byteLength
      if (descriptorBytes > limits.maximumDescriptorBytes) return { kind: 'unavailable' }
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
