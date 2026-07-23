import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'

import { bindingIntegrityIsValid } from '../binding'
import { offeringIntegrityIsValid } from '../offering'
import {
  beginOperation,
  replayOperationResult,
  succeedOperation,
} from '../operation-ledger/policy'
import { ensureSupplyAudit } from '../operation-ledger/replay'
import type { RegistrationContext, SupplyCommandActor } from '../shared'

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

  const expected = publicationProjection(
    encoded.contract.ref,
    draft.offering.offeringId,
    draft.binding.bindingId,
  )
  const operation = await beginOperation(
    ports,
    input.actor,
    'publishCapability',
    input,
    {
      businessId: input.businessId,
      sourceKind: draft.source.kind,
      sourceDigest: draft.source.descriptorDigest,
      contractRef: {
        capabilityId: encoded.contract.ref.capabilityId,
        version: encoded.contract.ref.version,
        contractDigest: encoded.contract.ref.contractDigest,
      },
      offeringId: draft.offering.offeringId,
      offeringRegistrationHash: offeringHash,
      bindingId: draft.binding.bindingId,
      bindingRegistrationHash: bindingHash,
    },
    input.now,
  )
  if (operation.kind === 'conflict') {
    return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  }
  if (operation.kind === 'replay') return replayOperationResult(operation, expected)

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
      publicationRef: draft.offering.offeringId,
      revision: 1,
      businessId: input.businessId,
      networkId: draft.offering.networkId,
      sourceKind: draft.source.kind,
      sourceDigest: draft.source.descriptorDigest,
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
      offeringId: draft.offering.offeringId,
      bindingId: draft.binding.bindingId,
    },
    beforeState: 'absent',
    afterState: 'inactive',
    createdAt: input.now,
  })
  await succeedOperation(ports, operation.operationId, expected, [auditId], input.now)
  await ports.scheduleReadinessProbe(draft.offering.offeringId, 1)
  return expected
}
