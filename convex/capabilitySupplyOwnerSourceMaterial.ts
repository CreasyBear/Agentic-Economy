import {
  admitPublicationDraft,
  offeringRegistrationFromRow,
  type CapabilityOfferingRegistration,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationSourceSelector,
  type PreparedPublicationMaterial,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import type { QueryCtx, MutationCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import {
  toCapabilityBindingRow,
  toCapabilityOfferingRow,
} from './capabilitySupplyRowMappers'

type OwnerSourcePublication = Readonly<{
  businessId: string
  offeringId: string
  bindingId: string
  capabilityId: string
  version: number
  contractDigest: string
  sourceKind: PreparedPublicationMaterial['sourceKind']
  sourceSelector?: CapabilityPublicationSourceSelector
  sourceDescriptorJson?: string
  sourceRevision: string
  sourceDigest: string
  pricingConfigJson?: string
  priceDigest?: string
  registrationEvidenceRefs?: readonly string[]
}>

export async function reconstructOwnerSourceMaterial(
  db: QueryCtx['db'] | MutationCtx['db'],
  publication: OwnerSourcePublication,
  fallbackEvidenceRefs: readonly string[],
): Promise<
  | Readonly<{
      kind: 'ready'
      prepared: PreparedPublicationMaterial
      origin?: CapabilityOfferingRegistration['origin']
    }>
  | Readonly<{ kind: 'refused'; reason: string }>
> {
  const [offeringDoc, bindingDoc, exactContract] = await Promise.all([
    db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (query) =>
        query.eq('offeringId', publication.offeringId),
      )
      .unique(),
    db
      .query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) =>
        query.eq('bindingId', publication.bindingId),
      )
      .unique(),
    getExactRegisteredCapabilityContract(db, {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    }),
  ])
  if (offeringDoc === null)
    return { kind: 'refused', reason: 'offering_integrity_failure' }
  let offeringRegistration: CapabilityOfferingRegistration
  try {
    offeringRegistration = offeringRegistrationFromRow(
      toCapabilityOfferingRow(offeringDoc),
    )
  } catch {
    return { kind: 'refused', reason: 'offering_integrity_failure' }
  }
  if (
    offeringRegistration.businessId !== String(publication.businessId)
    || offeringRegistration.contractRef.capabilityId !== publication.capabilityId
    || offeringRegistration.contractRef.version !== publication.version
    || offeringRegistration.contractRef.contractDigest !== publication.contractDigest
  ) return { kind: 'refused', reason: 'registration_changed' }

  if (bindingDoc === null)
    return { kind: 'refused', reason: 'binding_integrity_failure' }
  const binding = toCapabilityBindingRow(bindingDoc)
  let adapterConfig: CapabilityPublicationBindingDraft['adapter']['config']
  try {
    adapterConfig = JSON.parse(binding.configJson)
  } catch {
    return { kind: 'refused', reason: 'binding_integrity_failure' }
  }
  if (
    stableStringify(adapterConfig) !== binding.configJson
    || canonicalDigest(adapterConfig) !== binding.configDigest
  ) return { kind: 'refused', reason: 'binding_integrity_failure' }
  if (
    binding.offeringId !== publication.offeringId
    || binding.capabilityId !== publication.capabilityId
    || binding.version !== publication.version
    || binding.contractDigest !== publication.contractDigest
  ) return { kind: 'refused', reason: 'registration_changed' }

  if (exactContract.kind !== 'found')
    return { kind: 'refused', reason: 'contract_integrity_failure' }
  if (
    exactContract.contract.ref.capabilityId !== publication.capabilityId
    || exactContract.contract.ref.version !== publication.version
    || exactContract.contract.ref.contractDigest !== publication.contractDigest
  ) return { kind: 'refused', reason: 'contract_integrity_failure' }
  if (
    publication.pricingConfigJson === undefined
    || publication.priceDigest === undefined
  ) return { kind: 'refused', reason: 'pricing_config_invalid' }
  if (
    publication.sourceDescriptorJson === undefined
    || publication.sourceSelector === undefined
  ) return { kind: 'refused', reason: 'source_invalid' }

  const {
    businessId: _businessId,
    contractRef: _offeringContractRef,
    ...offering
  } = offeringRegistration
  const { ref: _contractRef, ...contractDocument } = exactContract.contract
  const prepared: PreparedPublicationMaterial = {
    sourceKind: publication.sourceKind,
    sourceSelector: publication.sourceSelector,
    sourceDescriptorJson: publication.sourceDescriptorJson,
    sourceRevision: publication.sourceRevision,
    sourceDigest: publication.sourceDigest,
    documentJson: stableStringify(contractDocument as StableHashValue),
    offering,
    binding: {
      bindingId: binding.bindingId,
      endpointUrl: binding.endpointUrl,
      authority: binding.authority,
      continuation: {
        ...binding.continuation,
        evidenceRefs: [...binding.continuation.evidenceRefs],
      },
      cancellation: {
        ...binding.cancellation,
        evidenceRefs: [...binding.cancellation.evidenceRefs],
      },
      adapter: { adapterId: binding.adapterId, config: adapterConfig },
      registrationEvidenceRefs: [...binding.registrationEvidenceRefs],
    },
    evidenceRefs: [
      ...(publication.registrationEvidenceRefs ?? fallbackEvidenceRefs),
    ],
    pricingConfigJson: publication.pricingConfigJson,
    priceDigest: publication.priceDigest,
  }
  const admitted = await admitPublicationDraft({
    prepared,
    businessId: String(publication.businessId),
    ...(offeringRegistration.origin === undefined
      ? {}
      : { origin: offeringRegistration.origin }),
  })
  if (admitted.kind === 'refused') return admitted
  return {
    kind: 'ready',
    prepared,
    ...(offeringRegistration.origin === undefined
      ? {}
      : { origin: offeringRegistration.origin }),
  }
}
