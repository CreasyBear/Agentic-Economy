import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import { offeringRegistrationFromRow, type CapabilityOfferingRegistration, type CapabilityPublicationBindingDraft, type PreparedPublicationMaterial, type PublicationCommandRow } from '@/modules/capability-supply/public'
import type { MutationCtx } from '../../../_generated/server'
import { publicationPorts } from '../../../capabilitySupply'

export async function reconstructPreparedRepublishMaterial(
  ctx: MutationCtx,
  publication: PublicationCommandRow,
  evidenceRefs: readonly string[],
): Promise<
  | Readonly<{
      kind: 'ready'
      prepared: PreparedPublicationMaterial
      origin?: CapabilityOfferingRegistration['origin']
    }>
  | Readonly<{ kind: 'refused'; reason: string }>
> {
  const ports = publicationPorts(ctx)
  const [offering, binding, exactContract] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
    ports.getExactRegisteredContract({
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    }),
  ])
  if (offering === null)
    return { kind: 'refused', reason: 'offering_integrity_failure' }
  let offeringRegistration: CapabilityOfferingRegistration
  try {
    offeringRegistration = offeringRegistrationFromRow(offering)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused', reason: 'offering_integrity_failure' }, { site: 'reconstructPreparedRepublishMaterial', reason: 'invalid_response' })
  }
  if (
    offeringRegistration.businessId !== publication.businessId ||
    offeringRegistration.contractRef.capabilityId !==
      publication.capabilityId ||
    offeringRegistration.contractRef.version !== publication.version ||
    offeringRegistration.contractRef.contractDigest !==
      publication.contractDigest
  ) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  if (binding === null)
    return { kind: 'refused', reason: 'binding_integrity_failure' }
  let adapterConfig: CapabilityPublicationBindingDraft['adapter']['config']
  try {
    adapterConfig = JSON.parse(binding.configJson)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused', reason: 'binding_integrity_failure' }, { site: 'reconstructPreparedRepublishMaterial', reason: 'invalid_response' })
  }
  if (
    stableStringify(adapterConfig) !== binding.configJson ||
    canonicalDigest(adapterConfig) !== binding.configDigest
  ) {
    return { kind: 'refused', reason: 'binding_integrity_failure' }
  }
  if (
    binding.offeringId !== publication.offeringId ||
    binding.capabilityId !== publication.capabilityId ||
    binding.version !== publication.version ||
    binding.contractDigest !== publication.contractDigest
  ) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  if (exactContract.kind !== 'found')
    return { kind: 'refused', reason: 'contract_integrity_failure' }
  if (
    exactContract.contract.ref.capabilityId !== publication.capabilityId ||
    exactContract.contract.ref.version !== publication.version ||
    exactContract.contract.ref.contractDigest !== publication.contractDigest
  ) {
    return { kind: 'refused', reason: 'contract_integrity_failure' }
  }
  if (
    publication.pricingConfigJson === undefined ||
    publication.priceDigest === undefined
  ) {
    return { kind: 'refused', reason: 'pricing_config_invalid' }
  }
  if (
    publication.sourceDescriptorJson === undefined ||
    publication.sourceSelector === undefined
  ) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const {
    businessId: _businessId,
    contractRef: _offeringContractRef,
    ...offeringDraft
  } = offeringRegistration
  const bindingDraft: CapabilityPublicationBindingDraft = {
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
    adapter: {
      adapterId: binding.adapterId,
      config: adapterConfig,
    },
    registrationEvidenceRefs: [...binding.registrationEvidenceRefs],
  }
  const { ref: _contractRef, ...contractDocument } = exactContract.contract
  return {
    kind: 'ready',
    origin: offeringRegistration.origin,
    prepared: {
      sourceKind: publication.sourceKind,
      sourceSelector: publication.sourceSelector,
      sourceDescriptorJson: publication.sourceDescriptorJson,
      sourceRevision: publication.sourceRevision,
      documentJson: stableStringify(contractDocument as StableHashValue),
      offering: offeringDraft,
      binding: bindingDraft,
      evidenceRefs: [...(publication.registrationEvidenceRefs ?? evidenceRefs)],
      pricingConfigJson: publication.pricingConfigJson,
      priceDigest: publication.priceDigest,
      sourceDigest: publication.sourceDigest,
      sourceRouteRef: publication.sourceRouteRef ?? publication.sourceDigest,
    },
  }
}
