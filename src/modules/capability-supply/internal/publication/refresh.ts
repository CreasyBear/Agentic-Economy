import { canonicalDigest } from '@/modules/common/canonical-digest'
import { normalizePricingConfig, pricingConfigDigest, type PricingConfig } from '@/modules/money/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  capabilityToolId,
  capabilityOfferingRegistrationHash,
  capabilityBindingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  admitRegisteredTransport,
  createPublicToolRef,
  type CapabilityOfferingRegistration,
  type CapabilityTransportBindingRegistration,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'
import { contractRefFromRow } from '../offering/registration'
import type { CapabilityPublicationImport } from '../publication-importers'
import type { RegistrationContext } from '../shared/command-envelope'
import { connectionAuthoritySnapshotsEqual, transportAdmissionInput } from '../binding/registration'

import { preparePublicationDraft } from './draft'
import { INITIAL_PUBLICATION_LIFECYCLE } from './lifecycle'
import type { PublicationCommandPorts, PublicationCommandRow } from './ports'
import {
  capabilityPublicationProvenanceDigest,
  type CapabilityPublicationProvenance,
} from './provenance'

export type RefreshCapabilityCommandInput = RegistrationContext & Readonly<{
  publication: PublicationCommandRow
  source: CapabilityPublicationImport
  offering?: CapabilityPublicationOfferingDraft | undefined
  binding?: CapabilityPublicationBindingDraft | undefined
  now: number
  publicationMetadata?: CapabilityPublicationProvenance
}>

export async function refreshCapabilityCommand(
  input: RefreshCapabilityCommandInput,
  ports: PublicationCommandPorts,
) {
  const { publication } = input
  if (publication.disposition !== 'current') {
    return { kind: 'refused' as const, reason: 'revision_changed' as const }
  }
  const currentPricing = verifiedPublicationPricing(publication)
  if (currentPricing === undefined) {
    return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
  }
  // Pricing is owner-declared only at the ingest boundary (preparePublicationDraft's
  // first call, or admitPublicationDraft). A refresh carries forward the publication's
  // already-verified pricing config rather than re-deriving it from the offering draft,
  // whose display price is not the source of truth (Well 4 D7).
  const prepared = await preparePublicationDraft({
    source: input.source,
    sourceRevision: publication.sourceRevision,
    pricingConfig: currentPricing,
    offering: input.offering,
    binding: input.binding,
    evidenceRefs: input.evidenceRefs,
  })
  if (prepared.kind === 'refused') {
    return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
  }
  const { draft, encoded, prepared: material } = prepared
  const publicationMetadata: CapabilityPublicationProvenance = input.publicationMetadata === undefined
    ? {
      publisherRef: publication.publisherRef,
      authorityMode: publication.authorityMode,
      sourceRevision: publication.sourceRevision,
      provenanceDigest: capabilityPublicationProvenanceDigest({
        publisherRef: publication.publisherRef,
        authorityMode: publication.authorityMode,
        sourceRevision: publication.sourceRevision,
        sourceDigest: material.sourceDigest,
      }),
    }
    : input.publicationMetadata

  const repeatsExactContract = encoded.contract.ref.version === publication.version
    && encoded.contract.ref.contractDigest === publication.contractDigest
  if (
    encoded.contract.ref.capabilityId !== publication.capabilityId
    || encoded.contract.ref.version < publication.version
    || (encoded.contract.ref.version === publication.version && !repeatsExactContract)
  ) {
    return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
  }

  const previousContract = await ports.getExactRegisteredContract(
    contractRefFromRow(publication),
  )
  if (previousContract.kind !== 'found') {
    throw new Error('capability_publication_contract_integrity_failure')
  }
  const compatible = canonicalDigest({
    inputSchema: previousContract.contract.inputSchema,
    outputSchema: previousContract.contract.outputSchema,
    customerAnnotations: previousContract.contract.customerAnnotations,
    dataUse: previousContract.contract.dataUse,
    effects: previousContract.contract.effects,
    evidence: previousContract.contract.evidence,
    lifecycle: previousContract.contract.lifecycle,
  } as StableHashValue) === canonicalDigest({
    inputSchema: encoded.contract.inputSchema,
    outputSchema: encoded.contract.outputSchema,
    customerAnnotations: encoded.contract.customerAnnotations,
    dataUse: encoded.contract.dataUse,
    effects: encoded.contract.effects,
    evidence: encoded.contract.evidence,
    lifecycle: encoded.contract.lifecycle,
  } as StableHashValue)

  const revision = publication.revision + 1
  const toolRef = createPublicToolRef({
    operationId: capabilityToolId(encoded.contract.ref.capabilityId),
    publicationRef: publication.publicationRef,
    publicationRevision: revision,
    contractRef: encoded.contract.ref,
  })
  const [currentOffering, currentBinding] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
  ])
  if (currentOffering === null || currentBinding === null) {
    throw new Error('capability_publication_supply_integrity_failure')
  }
  const revoked = await ports.setEligibility({
    offeringId: currentOffering.offeringId,
    bindingId: currentBinding.bindingId,
    contractRef: contractRefFromRow(publication),
    decision: 'revoke',
    expectedOfferingRegistrationHash: currentOffering.registrationHash,
    expectedBindingRegistrationHash: currentBinding.registrationHash,
    admissionEvidenceRefs: input.evidenceRefs,
    conformanceEvidenceRefs: input.evidenceRefs,
  }, input.now)
  if (revoked.kind === 'refused') {
    throw new Error(`capability_publication_refresh_${revoked.reason}`)
  }
  await ports.patchPublicationSuperseded(publication.id, input.now)

  if (!compatible) {
    await ports.insertPublication({
      toolRef,
      publicationRef: publication.publicationRef,
      revision,
      businessId: publication.businessId,
      networkId: draft.offering.networkId,
      runtimeEnvironment: publication.runtimeEnvironment,
      sourceKind: material.sourceKind,
      sourceSelector: material.sourceSelector,
      sourceDescriptorJson: material.sourceDescriptorJson,
      sourceRevision: material.sourceRevision,
      sourceDigest: material.sourceDigest,
      sourceRouteRef: publication.sourceRouteRef ?? material.sourceRouteRef,
      pricingConfigJson: material.pricingConfigJson,
      priceDigest: material.priceDigest,
      publisherRef: publicationMetadata.publisherRef,
      authorityMode: publicationMetadata.authorityMode,
      provenanceDigest: publicationMetadata.provenanceDigest,
      ...encoded.contract.ref,
      offeringId: publication.offeringId,
      bindingId: publication.bindingId,
      disposition: 'incompatible',
      supersedesRevision: publication.revision,
      registrationEvidenceRefs: [...input.evidenceRefs],
      createdAt: input.now,
      updatedAt: input.now,
    })
    return {
      kind: 'refreshed' as const,
      publicationRef: publication.publicationRef,
      revision,
      disposition: 'incompatible' as const,
      lifecycle: { state: 'incompatible' as const, reasons: ['incompatible_revision' as const] },
    }
  }

  const contractResult = await ports.registerContractDocument(
    encoded.documentJson,
    input.now,
  )
  if (contractResult.kind === 'refused') {
    throw new Error(`capability_publication_refresh_${contractResult.reason}`)
  }
  const nextOffering = refreshedOffering({
    ...draft.offering,
    businessId: publication.businessId,
    contractRef: encoded.contract.ref,
  }, currentOffering, publication.publicationRef, revision)
  const nextBinding = refreshedBinding({
    ...draft.binding,
    offeringId: nextOffering.offeringId,
    networkId: draft.offering.networkId,
    contractRef: encoded.contract.ref,
  }, currentBinding, publication.publicationRef, revision)
  const offeringResult = await ports.registerOffering(nextOffering, input.now)
  if (offeringResult.kind === 'refused') {
    throw new Error(`capability_publication_refresh_${offeringResult.reason}`)
  }
  if (nextBinding.bindingId === currentBinding.bindingId && currentBinding.authority.kind === 'provider_connection') {
    const nextAuthority = nextBinding.authority
    if (
      nextAuthority.kind !== 'provider_connection'
      || publication.connectionAuthority === undefined
      || !connectionAuthoritySnapshotsEqual(
        publication.connectionAuthority,
        currentBinding.connectionAuthority,
      )
      || ports.rotateProviderConnectionBindingAuthority === undefined
    ) {
      throw new Error('capability_publication_refresh_connection_authority_stale')
    }
    const rotated = await ports.rotateProviderConnectionBindingAuthority({
      bindingId: currentBinding.bindingId,
      offeringId: currentBinding.offeringId,
      businessId: String(currentOffering.businessId),
      registrationHash: currentBinding.registrationHash,
      connectionRef: nextAuthority.connectionRef,
      providerRef: nextAuthority.providerRef,
      adapterId: nextBinding.adapter.adapterId,
      previousAuthority: publication.connectionAuthority,
      previousToolRef: publication.toolRef,
      nextToolRef: toolRef,
    }, input.now)
    if (rotated.kind === 'refused') {
      throw new Error(`capability_publication_refresh_${rotated.reason}`)
    }
  }
  const bindingResult = await ports.registerBinding(nextBinding, input.now, toolRef)
  if (bindingResult.kind === 'refused') {
    throw new Error(`capability_publication_refresh_${bindingResult.reason}`)
  }
  await ports.insertPublication({
    toolRef,
    publicationRef: publication.publicationRef,
    revision,
    businessId: publication.businessId,
    networkId: draft.offering.networkId,
    runtimeEnvironment: publication.runtimeEnvironment,
    sourceKind: material.sourceKind,
    sourceSelector: material.sourceSelector,
    sourceDescriptorJson: material.sourceDescriptorJson,
    sourceRevision: material.sourceRevision,
    sourceDigest: material.sourceDigest,
    sourceRouteRef: material.sourceRouteRef,
    pricingConfigJson: material.pricingConfigJson,
    priceDigest: material.priceDigest,
    publisherRef: publicationMetadata.publisherRef,
    authorityMode: publicationMetadata.authorityMode,
    provenanceDigest: publicationMetadata.provenanceDigest,
    ...encoded.contract.ref,
    offeringId: nextOffering.offeringId,
    bindingId: nextBinding.bindingId,
    disposition: 'current',
    supersedesRevision: publication.revision,
    registrationEvidenceRefs: [...input.evidenceRefs],
    createdAt: input.now,
    updatedAt: input.now,
  })
  await ports.scheduleReadinessProbe(publication.publicationRef, revision)
  return {
    kind: 'refreshed' as const,
    publicationRef: publication.publicationRef,
    revision,
    disposition: 'current' as const,
    lifecycle: INITIAL_PUBLICATION_LIFECYCLE,
  }
}

// Registrations are immutable. Changed material gets new internal identities
// while the publication retains its revision chain and old evidence.
function refreshedOffering(
  candidate: CapabilityOfferingRegistration,
  current: Readonly<{ offeringId: string; registrationHash: string }>,
  publicationRef: string,
  revision: number,
): CapabilityOfferingRegistration {
  const registration = defineCapabilityOfferingRegistration(candidate)
  return registration.offeringId === current.offeringId
    && capabilityOfferingRegistrationHash(registration) !== current.registrationHash
    ? { ...registration, offeringId: `${publicationRef}:offering:${revision}` }
    : registration
}

function refreshedBinding(
  candidate: CapabilityTransportBindingRegistration,
  current: Readonly<{ bindingId: string; registrationHash: string }>,
  publicationRef: string,
  revision: number,
): CapabilityTransportBindingRegistration {
  const registration = defineCapabilityTransportBindingRegistration(candidate)
  const transport = admitRegisteredTransport(transportAdmissionInput(registration))
  if (transport.kind === 'refused') throw new Error('capability_publication_refresh_binding_invalid')
  return registration.bindingId === current.bindingId
    && capabilityBindingRegistrationHash(registration, transport.transport) !== current.registrationHash
    ? { ...registration, bindingId: `${publicationRef}:binding:${revision}` }
    : registration
}

function verifiedPublicationPricing(publication: PublicationCommandRow): PricingConfig | undefined {
  if (publication.pricingConfigJson === undefined || publication.priceDigest === undefined) return undefined
  let value: unknown
  try { value = JSON.parse(publication.pricingConfigJson) } catch { return undefined }
  const pricing = normalizePricingConfig(value)
  return pricing.kind === 'valid' && pricingConfigDigest(pricing.config) === publication.priceDigest
    ? pricing.config : undefined
}
