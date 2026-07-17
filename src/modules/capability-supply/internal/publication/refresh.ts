import { canonicalDigest } from '@/modules/common/canonical-digest'
import { type StableHashValue } from '@/modules/common/stable-hash'
import type {
  CapabilityPublicationBindingDraft,
  CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'

import { contractRefFromRow } from '../offering'
import type { RegistrationContext } from '../shared'

import { preparePublicationDraft } from './draft'
import { INITIAL_PUBLICATION_LIFECYCLE } from './lifecycle'
import type { PublicationCommandPorts, PublicationCommandRow } from './ports'

export type RefreshCapabilityCommandInput = RegistrationContext & Readonly<{
  publication: PublicationCommandRow
  source: unknown
  offering?: CapabilityPublicationOfferingDraft | undefined
  binding?: CapabilityPublicationBindingDraft | undefined
  now: number
}>

export async function refreshCapabilityCommand(
  input: RefreshCapabilityCommandInput,
  ports: PublicationCommandPorts,
) {
  const { publication } = input
  if (publication.disposition !== 'current') {
    return { kind: 'refused' as const, reason: 'revision_changed' as const }
  }

  const prepared = preparePublicationDraft({
    source: input.source,
    offering: input.offering,
    binding: input.binding,
    evidenceRefs: input.evidenceRefs,
  })
  if (prepared.kind === 'refused') {
    return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
  }
  const { draft, encoded } = prepared

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
      publicationRef: publication.publicationRef,
      revision,
      businessId: publication.businessId,
      networkId: draft.offering.networkId,
      sourceKind: draft.source.kind,
      sourceDigest: draft.source.descriptorDigest,
      ...encoded.contract.ref,
      offeringId: draft.offering.offeringId,
      bindingId: draft.binding.bindingId,
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
  const nextOffering = {
    ...draft.offering,
    businessId: publication.businessId,
    contractRef: encoded.contract.ref,
  }
  const nextBinding = {
    ...draft.binding,
    offeringId: draft.offering.offeringId,
    networkId: draft.offering.networkId,
    contractRef: encoded.contract.ref,
  }
  const offeringResult = await ports.registerOffering(nextOffering, input.now)
  if (offeringResult.kind === 'refused') {
    throw new Error(`capability_publication_refresh_${offeringResult.reason}`)
  }
  const bindingResult = await ports.registerBinding(nextBinding, input.now)
  if (bindingResult.kind === 'refused') {
    throw new Error(`capability_publication_refresh_${bindingResult.reason}`)
  }
  await ports.insertPublication({
    publicationRef: publication.publicationRef,
    revision,
    businessId: publication.businessId,
    networkId: draft.offering.networkId,
    sourceKind: draft.source.kind,
    sourceDigest: draft.source.descriptorDigest,
    ...encoded.contract.ref,
    offeringId: draft.offering.offeringId,
    bindingId: draft.binding.bindingId,
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
