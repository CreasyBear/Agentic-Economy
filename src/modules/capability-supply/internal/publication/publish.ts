import {
  capabilityBindingRegistrationHash,
  capabilityOperationId,
  capabilityOfferingRegistrationHash,
  createPublicOperationRef,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'
import { type StableHashValue } from '@/modules/common/stable-hash'

import { bindingIntegrityIsValid } from '../binding/integrity'
import { offeringIntegrityIsValid } from '../offering/integrity'
import {
  beginOperation,
  replayOperationResult,
  succeedOperation,
} from '../operation-ledger/policy'
import { ensureSupplyAudit } from '../operation-ledger/replay'
import type { RegistrationContext, SupplyCommandActor } from '../shared/command-envelope'
import {
  capabilityPublicationProvenanceDigest,
  defineCapabilityPublicationProvenance,
  type CapabilityPublicationAuthorityMode,
  type CapabilityPublicationProvenance,
} from './provenance'

import { admitPublicationDraft } from './draft'
import { publicationProjection } from './lifecycle'
import type { PublicationCommandPorts } from './ports'

export type PublishCapabilityCommandInput = RegistrationContext & Readonly<{
  businessId: string
  source: unknown
  offering?: CapabilityPublicationOfferingDraft | undefined
  binding?: CapabilityPublicationBindingDraft | undefined
  actor: SupplyCommandActor
  now: number
  publicationMetadata?: Readonly<{
    sourceRevision: string
    authorityMode: CapabilityPublicationAuthorityMode
    publisherRef: string
    provenanceDigest: string
  }>
}>

export async function publishCapabilityCommand(
  input: PublishCapabilityCommandInput,
  ports: PublicationCommandPorts,
) {
  const admitted = admitPublicationDraft({
    source: input.source,
    offering: input.offering,
    binding: input.binding,
    evidenceRefs: input.evidenceRefs,
    businessId: input.businessId,
  })
  if (admitted.kind === 'refused') {
    return { kind: 'refused' as const, reason: admitted.reason }
  }
  const { draft, encoded, offering, binding, admittedTransport } = admitted
  const derivedAuthorityMode: CapabilityPublicationAuthorityMode =
    input.actor.kind === 'owner' ? 'provider_owned' : 'ae_curated_external'
  const publicationMetadata: CapabilityPublicationProvenance = input.publicationMetadata === undefined
    ? defineCapabilityPublicationProvenance({
        actor: input.actor,
        authorityMode: derivedAuthorityMode,
        sourceRevision: draft.source.descriptorDigest,
        sourceDigest: draft.source.descriptorDigest,
      })
    : input.publicationMetadata
  if (
    publicationMetadata.publisherRef !== input.actor.ref
    || publicationMetadata.sourceRevision.trim().length === 0
    || publicationMetadata.provenanceDigest !== capabilityPublicationProvenanceDigest({
      publisherRef: publicationMetadata.publisherRef,
      authorityMode: publicationMetadata.authorityMode,
      sourceRevision: publicationMetadata.sourceRevision,
      sourceDigest: draft.source.descriptorDigest,
    })
  ) {
    return { kind: 'refused' as const, reason: 'source_invalid' as const }
  }

  const existingContractDigest = await ports.findContractDigest(
    encoded.contract.ref.capabilityId,
    encoded.contract.ref.version,
  )
  if (
    existingContractDigest !== null
    && existingContractDigest !== encoded.contract.ref.contractDigest
  ) {
    return { kind: 'refused' as const, reason: 'contract_identity_conflict' as const }
  }

  const offeringHash = capabilityOfferingRegistrationHash(offering)
  const existingOffering = await ports.loadOfferingByOfferingId(offering.offeringId)
  if (existingOffering !== null) {
    if (!offeringIntegrityIsValid(existingOffering)) {
      return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
    }
    if (existingOffering.registrationHash !== offeringHash) {
      return { kind: 'refused' as const, reason: 'offering_identity_conflict' as const }
    }
  }

  const bindingHash = capabilityBindingRegistrationHash(
    binding,
    admittedTransport.transport,
  )
  const existingBinding = await ports.loadBindingByBindingId(binding.bindingId)
  if (existingBinding !== null) {
    if (!bindingIntegrityIsValid(existingBinding)) {
      return { kind: 'refused' as const, reason: 'binding_integrity_failure' as const }
    }
    if (existingBinding.registrationHash !== bindingHash) {
      return { kind: 'refused' as const, reason: 'binding_identity_conflict' as const }
    }
  }

  const existingPublication = await ports.loadPublicationAtRevision(
    draft.offering.offeringId,
    1,
  )
  if (existingPublication !== null && (
    existingPublication.sourceDigest !== draft.source.descriptorDigest
    || existingPublication.offeringId !== draft.offering.offeringId
    || existingPublication.bindingId !== draft.binding.bindingId
  )) {
    return { kind: 'refused' as const, reason: 'offering_identity_conflict' as const }
  }
  const expected = {
    ...publicationProjection(
      encoded.contract.ref,
      draft.offering.offeringId,
      draft.binding.bindingId,
    ),
    ...(input.publicationMetadata === undefined
      ? {}
      : {
        publisherRef: publicationMetadata.publisherRef,
        authorityMode: publicationMetadata.authorityMode,
        provenanceDigest: publicationMetadata.provenanceDigest,
        sourceRevision: publicationMetadata.sourceRevision,
        sourceDigest: draft.source.descriptorDigest,
      }),
  }
  const operationRef = createPublicOperationRef({
    operationId: capabilityOperationId(encoded.contract.ref.capabilityId),
    publicationRef: draft.offering.offeringId,
    publicationRevision: 1,
    contractRef: encoded.contract.ref,
  })
  const expectedWithOperationRef = { ...expected, operationRef }
  if (existingPublication !== null && existingPublication.operationRef !== operationRef) {
    throw new Error('capability_publication_operation_ref_invalid')
  }
  const requestMaterial: StableHashValue = {
    businessId: input.businessId,
    source: draft.source,
    offering: draft.offering as StableHashValue,
    binding: draft.binding,
    ...(input.publicationMetadata === undefined
      ? {}
      : { publicationMetadata: publicationMetadata as StableHashValue }),
  }
  const operation = await beginOperation(
    ports,
    input.actor,
    'publishCapability',
    input,
    requestMaterial,
    input.now,
  )
  if (operation.kind === 'conflict') {
    return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  }
  if (operation.kind === 'replay') {
    const replayed = replayOperationResult(operation, expectedWithOperationRef)
    const { operationRef: _operationRef, ...publicResult } = replayed
    return input.publicationMetadata === undefined
      ? publicResult
      : { ...publicResult, kind: 'replayed' as const, operationId: operation.operationId }
  }

  const contractResult = await ports.registerContractDocument(
    encoded.documentJson,
    input.now,
  )
  if (contractResult.kind === 'refused') {
    throw new Error(`capability_publication_contract_${contractResult.reason}`)
  }
  const offeringResult = await ports.registerOffering(offering, input.now)
  if (offeringResult.kind === 'refused') {
    throw new Error(`capability_publication_offering_${offeringResult.reason}`)
  }
  const bindingResult = await ports.registerBinding(binding, input.now)
  if (bindingResult.kind === 'refused') {
    throw new Error(`capability_publication_binding_${bindingResult.reason}`)
  }
  if (existingPublication === null) {
    await ports.insertPublication({
      operationRef,
      publicationRef: draft.offering.offeringId,
      revision: 1,
      businessId: input.businessId,
      networkId: draft.offering.networkId,
      sourceKind: draft.source.kind,
      sourceRevision: publicationMetadata.sourceRevision,
      sourceDigest: draft.source.descriptorDigest,
      publisherRef: publicationMetadata.publisherRef,
      authorityMode: publicationMetadata.authorityMode,
      provenanceDigest: publicationMetadata.provenanceDigest,
      ...encoded.contract.ref,
      offeringId: draft.offering.offeringId,
      bindingId: draft.binding.bindingId,
      disposition: 'current',
      registrationEvidenceRefs: [...input.evidenceRefs],
      createdAt: input.now,
      updatedAt: input.now,
    })
  }
  const auditId = await ensureSupplyAudit(ports, {
    eventType: 'capability_publication.published',
    action: 'publish_capability',
    targetType: 'capability_publication',
    targetRef: draft.offering.offeringId,
    actor: input.actor,
    context: input,
    payload: {
      businessId: input.businessId,
      sourceKind: draft.source.kind,
      sourceDigest: draft.source.descriptorDigest,
      contractRef: encoded.contract.ref,
      operationRef,
      offeringId: draft.offering.offeringId,
      bindingId: draft.binding.bindingId,
    },
    beforeState: 'absent',
    afterState: 'inactive',
    createdAt: input.now,
  })
  await succeedOperation(ports, operation.operationId, expectedWithOperationRef, [auditId], input.now)
  await ports.scheduleReadinessProbe(draft.offering.offeringId, 1)
  const { operationRef: _operationRef, ...publicResult } = expectedWithOperationRef
  return input.publicationMetadata === undefined
    ? publicResult
    : { ...publicResult, operationId: operation.operationId }
}
