import {
  capabilityBindingRegistrationHash,
  capabilityOperationId,
  capabilityOfferingRegistrationHash,
  createPublicOperationRef,
  type CapabilityOfferingOrigin,
} from '@/modules/capability-supply/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import { normalizePricingConfig, pricingConfigDigest, type PricingConfig } from '@/modules/money/public'

import { connectionAuthoritySnapshotMatches } from '../binding/registration'
import { bindingIntegrityIsValid } from '../binding/integrity'
import { offeringIntegrityIsValid } from '../offering/integrity'
import { beginOperation, replayOperationResult, succeedOperation } from '../operation-ledger/policy'
import { ensureSupplyAudit } from '../operation-ledger/replay'
import type { EligibilityInput } from '../eligibility'
import type { RegistrationContext, SupplyCommandActor } from '../shared/command-envelope'
import {
  capabilityPublicationProvenanceDigest,
  defineCapabilityPublicationProvenance,
  validCapabilityPublicationSourceRevision,
  type CapabilityPublicationAuthorityMode,
  type CapabilityPublicationProvenance,
} from './provenance'
import type { CapabilityPublicationImportRefusal } from '../publication-importers'
import { admitPublicationDraft, type PreparedPublicationMaterial } from './draft'
import { publicationProjection, type PublicationLifecycle } from './lifecycle'
import type { PublicationCommandPorts, PublicationCommandRow } from './ports'

export type PublishPreparedCapabilityCommandInput = RegistrationContext & Readonly<{
  businessId: string
  runtimeEnvironment: 'sandbox' | 'production'
  prepared: PreparedPublicationMaterial
  actor: SupplyCommandActor
  now: number
  origin?: CapabilityOfferingOrigin | undefined
  publicationMetadata?: Readonly<{
    sourceRevision: string
    authorityMode: CapabilityPublicationAuthorityMode
    publisherRef: string
    provenanceDigest: string
  }>
}>

export type PublishPreparedCapabilityRefusal =
  | CapabilityPublicationImportRefusal
  | 'authorization_denied'
  | 'registration_context_invalid'
  | 'source_revision_invalid'
  | 'pricing_config_invalid'
  | 'price_unavailable'
  | 'contract_too_large'
  | 'contract_invalid'
  | 'catalog_offering_origin_changed'
  | 'contract_identity_conflict'
  | 'contract_integrity_failure'
  | 'offering_identity_conflict'
  | 'offering_integrity_failure'
  | 'binding_identity_conflict'
  | 'binding_integrity_failure'
  | 'offering_invalid'
  | 'binding_invalid'
  | 'adapter_not_registered'
  | 'adapter_config_invalid'
  | 'adapter_config_too_large'
  | 'operation_key_conflict'
  | 'registration_changed'
  | 'connection_authority_stale'

export type PublishPreparedCapabilityCommandResult =
  | Readonly<{
      kind: 'published' | 'replayed'
      operationId?: string
      publicationRef: string
      publicationRevision: number
      operationRef: string
      contractRef: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
      offeringId: string
      bindingId: string
      sourceKind: PreparedPublicationMaterial['sourceKind']
      sourceSelector: PreparedPublicationMaterial['sourceSelector']
      sourceRevision: string
      sourceDigest: string
      priceDigest: string
      authorityMode: CapabilityPublicationAuthorityMode
      publisherRef: string
      provenanceDigest: string
      lifecycle: PublicationLifecycle
    }>
  | Readonly<{ kind: 'refused'; reason: PublishPreparedCapabilityRefusal }>

export type RepublishPreparedCapabilityCommandInput = RegistrationContext & Readonly<{
  businessId: string
  runtimeEnvironment: 'sandbox' | 'production'
  publication: PublicationCommandRow
  prepared: PreparedPublicationMaterial
  actor: SupplyCommandActor
  now: number
  origin?: CapabilityOfferingOrigin | undefined
}>
export type RepublishPreparedCapabilityRefusal = PublishPreparedCapabilityRefusal | 'revision_changed'
export type RepublishPreparedCapabilityCommandResult =
  | Exclude<PublishPreparedCapabilityCommandResult, { kind: 'refused'; reason: PublishPreparedCapabilityRefusal }>
  | Readonly<{ kind: 'refused'; reason: RepublishPreparedCapabilityRefusal }>

type PreparedPublicationCommitInput = PublishPreparedCapabilityCommandInput & Readonly<{
  revision: number
  operationName: 'publishPreparedCapability' | 'republishPreparedCapability'
  previousPublication?: PublicationCommandRow
  allowExistingTargetForReplay?: boolean
}>

type PreparedValidation =
  | Readonly<{ kind: 'valid'; pricing: PricingConfig }>
  | Readonly<{ kind: 'refused'; reason: 'source_invalid' | 'pricing_config_invalid' }>

export async function publishPreparedCapabilityCommand(
  input: PublishPreparedCapabilityCommandInput,
  ports: PublicationCommandPorts,
): Promise<PublishPreparedCapabilityCommandResult> {
  return commitPreparedPublicationCommand({
    ...input,
    revision: 1,
    operationName: 'publishPreparedCapability',
  }, ports)
}

export async function republishPreparedCapabilityCommand(
  input: RepublishPreparedCapabilityCommandInput,
  ports: PublicationCommandPorts,
): Promise<RepublishPreparedCapabilityCommandResult> {
  const publication = input.publication
  if (publication.disposition !== 'withdrawn') {
    return { kind: 'refused', reason: 'revision_changed' }
  }
  if (publication.runtimeEnvironment !== input.runtimeEnvironment) {
    return { kind: 'refused', reason: 'revision_changed' }
  }
  if (
    publication.businessId !== input.businessId
    || input.actor.kind !== 'owner'
    || publication.publisherRef !== input.actor.ref
    || publication.authorityMode !== 'provider_owned'
    || !Number.isSafeInteger(publication.revision)
    || publication.revision < 1
  ) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }

  const persisted = await ports.loadPublicationAtRevision(publication.publicationRef, publication.revision)
  if (
    persisted === null
    || canonicalDigest(persisted) !== canonicalDigest(publication)
  ) {
    return { kind: 'refused', reason: 'revision_changed' }
  }
  const nextRevision = publication.revision + 1
  const existingOperation = await ports.findOperationKey({
    actorRef: input.actor.ref,
    operationName: 'republishPreparedCapability',
    key: input.operationKey,
  })
  const allowExistingTargetForReplay = existingOperation?.status === 'succeeded'
  if (
    await ports.loadPublicationAtRevision(publication.publicationRef, nextRevision) !== null
    && !allowExistingTargetForReplay
  ) {
    return { kind: 'refused', reason: 'revision_changed' }
  }
  if (publication.sourceDescriptorJson === undefined || publication.sourceSelector === undefined) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (
    publication.sourceKind !== input.prepared.sourceKind
    || stableStringify(publication.sourceSelector as StableHashValue) !== stableStringify(input.prepared.sourceSelector as StableHashValue)
    || publication.sourceDescriptorJson !== input.prepared.sourceDescriptorJson
    || publication.sourceRevision !== input.prepared.sourceRevision
    || publication.sourceDigest !== input.prepared.sourceDigest
  ) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (publication.pricingConfigJson === undefined || publication.priceDigest === undefined) {
    return { kind: 'refused', reason: 'pricing_config_invalid' }
  }
  if (
    publication.pricingConfigJson !== input.prepared.pricingConfigJson
    || publication.priceDigest !== input.prepared.priceDigest
  ) {
    return { kind: 'refused', reason: 'pricing_config_invalid' }
  }
  const expectedPreviousOperationRef = createPublicOperationRef({
    operationId: capabilityOperationId(publication.capabilityId),
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    contractRef: {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    },
  })
  if (publication.operationRef !== expectedPreviousOperationRef) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  const result = await commitPreparedPublicationCommand({
    businessId: input.businessId,
    runtimeEnvironment: input.runtimeEnvironment,
    prepared: input.prepared,
    actor: input.actor,
    now: input.now,
    origin: input.origin,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    reasonCode: input.reasonCode,
    evidenceRefs: input.evidenceRefs,
    publicationMetadata: {
      sourceRevision: publication.sourceRevision,
      authorityMode: publication.authorityMode,
      publisherRef: publication.publisherRef,
      provenanceDigest: publication.provenanceDigest,
    },
    revision: nextRevision,
    operationName: 'republishPreparedCapability',
    previousPublication: publication,
    allowExistingTargetForReplay,
  }, ports)
  return result
}

async function commitPreparedPublicationCommand(
  input: PreparedPublicationCommitInput,
  ports: PublicationCommandPorts,
): Promise<PublishPreparedCapabilityCommandResult> {
  const validation = validatePreparedPublication(input.prepared)
  if (validation.kind === 'refused') return validation
  const prepared = input.prepared
  if (
    typeof prepared.sourceRevision !== 'string'
    || !validCapabilityPublicationSourceRevision(prepared.sourceRevision)
  ) {
    return { kind: 'refused', reason: 'source_revision_invalid' }
  }
  const admitted = await admitPublicationDraft({
    prepared,
    businessId: input.businessId,
    origin: input.origin,
  })
  if (admitted.kind === 'refused') return { kind: 'refused', reason: mapAdmissionRefusal(admitted.reason) }
  const { encoded, offering, binding: originalBinding, admittedTransport } = admitted
  const sourceRevision = prepared.sourceRevision
  const sourceDigest = prepared.sourceDigest
  const derivedAuthorityMode: CapabilityPublicationAuthorityMode =
    input.actor.kind === 'owner' ? 'provider_owned' : 'ae_curated_external'
  const publicationMetadata: CapabilityPublicationProvenance = input.publicationMetadata === undefined
    ? defineCapabilityPublicationProvenance({
        actor: input.actor,
        authorityMode: derivedAuthorityMode,
        sourceRevision,
        sourceDigest,
      })
    : input.publicationMetadata
  if (
    publicationMetadata.publisherRef !== input.actor.ref
    || publicationMetadata.sourceRevision !== sourceRevision
    || publicationMetadata.provenanceDigest !== capabilityPublicationProvenanceDigest({
      publisherRef: publicationMetadata.publisherRef,
      authorityMode: publicationMetadata.authorityMode,
      sourceRevision,
      sourceDigest,
    })
  ) {
    return { kind: 'refused', reason: 'source_invalid' }
  }

  if (offering.origin?.kind === 'catalog_offering') {
    if (ports.catalogOriginIsCurrent === undefined
      || !await ports.catalogOriginIsCurrent(offering.origin, input.businessId)) {
      return { kind: 'refused', reason: 'catalog_offering_origin_changed' }
    }
  }

  const existingContractDigest = await ports.findContractDigest(
    encoded.contract.ref.capabilityId,
    encoded.contract.ref.version,
  )
  if (existingContractDigest !== null && existingContractDigest !== encoded.contract.ref.contractDigest) {
    return { kind: 'refused', reason: 'contract_identity_conflict' }
  }
  if (input.previousPublication !== undefined) {
    const exactContract = await ports.getExactRegisteredContract(encoded.contract.ref)
    if (exactContract.kind !== 'found'
      || canonicalDigest(exactContract.contract)
        !== canonicalDigest(encoded.contract)) {
      return { kind: 'refused', reason: 'contract_integrity_failure' }
    }
    if (
      input.previousPublication.capabilityId !== encoded.contract.ref.capabilityId
      || input.previousPublication.version !== encoded.contract.ref.version
      || input.previousPublication.contractDigest !== encoded.contract.ref.contractDigest
      || input.previousPublication.offeringId !== offering.offeringId
      || input.previousPublication.businessId !== input.businessId
    ) {
      return { kind: 'refused', reason: 'registration_changed' }
    }
  }

  const offeringHash = capabilityOfferingRegistrationHash(offering)
  const existingOffering = await ports.loadOfferingByOfferingId(offering.offeringId)
  if (input.previousPublication !== undefined && existingOffering === null) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  if (existingOffering !== null) {
    if (!offeringIntegrityIsValid(existingOffering)) return { kind: 'refused', reason: 'offering_integrity_failure' }
    if (existingOffering.registrationHash !== offeringHash) return { kind: 'refused', reason: 'offering_identity_conflict' }
  }

  const originalBindingHash = capabilityBindingRegistrationHash(originalBinding, admittedTransport.transport)
  const existingBinding = await ports.loadBindingByBindingId(originalBinding.bindingId)
  if (input.previousPublication !== undefined && existingBinding === null) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  if (existingBinding !== null) {
    if (!bindingIntegrityIsValid(existingBinding)) return { kind: 'refused', reason: 'binding_integrity_failure' }
    if (existingBinding.registrationHash !== originalBindingHash) return { kind: 'refused', reason: 'binding_identity_conflict' }
  }

  let binding = originalBinding
  if (input.previousPublication !== undefined) {
    const previousAuthority = input.previousPublication.connectionAuthority
    const persistedAuthority = existingBinding?.connectionAuthority
    if (
      (previousAuthority === undefined) !== (persistedAuthority === undefined)
      || (previousAuthority !== undefined && persistedAuthority !== undefined
        && canonicalDigest(previousAuthority as StableHashValue) !== canonicalDigest(persistedAuthority as StableHashValue))
    ) {
      return { kind: 'refused', reason: 'connection_authority_stale' }
    }
    if (persistedAuthority !== undefined) {
      if (
        ports.loadProviderConnection === undefined
        || !connectionAuthoritySnapshotMatches(
          persistedAuthority,
          await ports.loadProviderConnection(persistedAuthority.connectionRef),
          {
            businessId: input.businessId,
            operationRef: input.previousPublication.operationRef,
            adapterId: originalBinding.adapter.adapterId,
            now: input.now,
          },
        )
      ) {
        return { kind: 'refused', reason: 'connection_authority_stale' }
      }
      if (persistedAuthority.operationRef !== input.previousPublication.operationRef) {
        return { kind: 'refused', reason: 'connection_authority_stale' }
      }
      binding = {
        ...originalBinding,
        bindingId: revisionSpecificBindingId(originalBinding.bindingId, input.revision),
      }
      const nextExistingBinding = await ports.loadBindingByBindingId(binding.bindingId)
      if (nextExistingBinding !== null && !input.allowExistingTargetForReplay) {
        return { kind: 'refused', reason: 'binding_identity_conflict' }
      }
    }
  }
  const bindingHash = capabilityBindingRegistrationHash(binding, admittedTransport.transport)
  const targetBinding = binding.bindingId === originalBinding.bindingId
    ? existingBinding
    : await ports.loadBindingByBindingId(binding.bindingId)
  if (targetBinding !== null) {
    if (!bindingIntegrityIsValid(targetBinding)) return { kind: 'refused', reason: 'binding_integrity_failure' }
    if (targetBinding.registrationHash !== bindingHash) return { kind: 'refused', reason: 'binding_identity_conflict' }
  }

  const publicationRef = input.previousPublication?.publicationRef ?? offering.offeringId
  const targetPublication = await ports.loadPublicationAtRevision(publicationRef, input.revision)
  if (
    input.previousPublication !== undefined
    && targetPublication !== null
    && !input.allowExistingTargetForReplay
  ) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  if (input.previousPublication === undefined && targetPublication !== null && (
    targetPublication.runtimeEnvironment !== input.runtimeEnvironment
    || targetPublication.sourceDigest !== sourceDigest
    || targetPublication.offeringId !== offering.offeringId
    || targetPublication.bindingId !== binding.bindingId
    || targetPublication.priceDigest !== prepared.priceDigest
  )) {
    return { kind: 'refused', reason: 'offering_identity_conflict' }
  }

  const operationRef = createPublicOperationRef({
    operationId: capabilityOperationId(encoded.contract.ref.capabilityId),
    publicationRef,
    publicationRevision: input.revision,
    contractRef: encoded.contract.ref,
  })
  if (input.previousPublication === undefined && targetPublication !== null && targetPublication.operationRef !== operationRef) {
    throw new Error('capability_publication_operation_ref_invalid')
  }
  if (input.previousPublication !== undefined && targetPublication !== null) {
    const targetMatches = targetPublication.operationRef === operationRef
      && targetPublication.revision === input.revision
      && targetPublication.businessId === input.businessId
      && targetPublication.networkId === offering.networkId
      && targetPublication.runtimeEnvironment === input.runtimeEnvironment
      && targetPublication.capabilityId === encoded.contract.ref.capabilityId
      && targetPublication.version === encoded.contract.ref.version
      && targetPublication.contractDigest === encoded.contract.ref.contractDigest
      && targetPublication.offeringId === offering.offeringId
      && targetPublication.bindingId === binding.bindingId
      && targetPublication.disposition === 'current'
      && targetPublication.supersedesRevision === input.previousPublication.revision
      && targetPublication.sourceKind === prepared.sourceKind
      && targetPublication.sourceSelector !== undefined
      && stableStringify(targetPublication.sourceSelector as StableHashValue) === stableStringify(prepared.sourceSelector as StableHashValue)
      && targetPublication.sourceDescriptorJson === prepared.sourceDescriptorJson
      && targetPublication.sourceRevision === sourceRevision
      && targetPublication.sourceDigest === sourceDigest
      && targetPublication.pricingConfigJson === prepared.pricingConfigJson
      && targetPublication.priceDigest === prepared.priceDigest
      && targetPublication.publisherRef === publicationMetadata.publisherRef
      && targetPublication.authorityMode === publicationMetadata.authorityMode
      && targetPublication.provenanceDigest === publicationMetadata.provenanceDigest
    if (!targetMatches) return { kind: 'refused', reason: 'registration_changed' }
  }
  const expected = {
    ...publicationProjection(encoded.contract.ref, offering.offeringId, binding.bindingId),
    publicationRef,
    publicationRevision: input.revision,
    operationRef,
    contractRef: encoded.contract.ref,
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    runtimeEnvironment: input.runtimeEnvironment,
    sourceKind: prepared.sourceKind,
    sourceSelector: prepared.sourceSelector,
    sourceRevision,
    sourceDigest,
    priceDigest: prepared.priceDigest,
    authorityMode: publicationMetadata.authorityMode,
    publisherRef: publicationMetadata.publisherRef,
    provenanceDigest: publicationMetadata.provenanceDigest,
  }
  const requestMaterial: StableHashValue = {
    businessId: input.businessId,
    runtimeEnvironment: input.runtimeEnvironment,
    prepared: {
      sourceKind: prepared.sourceKind,
      sourceSelector: prepared.sourceSelector,
      sourceDescriptorJson: prepared.sourceDescriptorJson,
      sourceRevision,
      sourceDigest,
      documentJson: prepared.documentJson,
      offering: offering as StableHashValue,
      binding: binding as StableHashValue,
      pricingConfigJson: prepared.pricingConfigJson,
      priceDigest: prepared.priceDigest,
    },
    ...(input.previousPublication === undefined ? {} : {
      previousPublication: {
        publicationRef: input.previousPublication.publicationRef,
        revision: input.previousPublication.revision,
        operationRef: input.previousPublication.operationRef,
        bindingId: input.previousPublication.bindingId,
      },
    }),
    ...(input.publicationMetadata === undefined ? {} : { publicationMetadata: publicationMetadata as StableHashValue }),
  }
  const operation = await beginOperation(
    ports,
    input.actor,
    input.operationName,
    input,
    requestMaterial,
    input.now,
  )
  if (operation.kind === 'conflict') return { kind: 'refused', reason: 'operation_key_conflict' }
  if (operation.kind === 'replay') {
    const replayed = replayOperationResult(operation, expected)
    return { ...replayed, kind: 'replayed' }
  }

  const contractResult = await ports.registerContractDocument(encoded.documentJson, input.now)
  if (contractResult.kind === 'refused') throw new Error(`capability_publication_contract_${contractResult.reason}`)
  const offeringResult = await ports.registerOffering(offering, input.now)
  if (offeringResult.kind === 'refused') throw new Error(`capability_publication_offering_${offeringResult.reason}`)
  const bindingResult = await ports.registerBinding(binding, input.now, operationRef)
  if (bindingResult.kind === 'refused') throw new Error(`capability_publication_binding_${bindingResult.reason}`)

  const eligibilityInput: EligibilityInput = {
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    contractRef: encoded.contract.ref,
    decision: 'admit',
    expectedOfferingRegistrationHash: offeringResult.registrationHash,
    expectedBindingRegistrationHash: bindingResult.registrationHash,
    admissionEvidenceRefs: input.evidenceRefs,
    conformanceEvidenceRefs: input.evidenceRefs,
  }
  const eligibility = await ports.setEligibility(eligibilityInput, input.now)
  if (eligibility.kind === 'refused') {
    throw new Error(`capability_publication_eligibility_${eligibility.reason}`)
  }
  if (eligibility.kind !== 'eligible') throw new Error('capability_publication_eligibility_invariant')

  if (targetPublication === null) {
    await ports.insertPublication({
      operationRef,
      publicationRef,
      revision: input.revision,
      businessId: input.businessId,
      networkId: offering.networkId,
      runtimeEnvironment: input.runtimeEnvironment,
      sourceKind: prepared.sourceKind,
      sourceSelector: prepared.sourceSelector,
      sourceDescriptorJson: prepared.sourceDescriptorJson,
      sourceRevision,
      sourceDigest,
      pricingConfigJson: prepared.pricingConfigJson,
      priceDigest: prepared.priceDigest,
      publisherRef: publicationMetadata.publisherRef,
      authorityMode: publicationMetadata.authorityMode,
      provenanceDigest: publicationMetadata.provenanceDigest,
      ...encoded.contract.ref,
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      disposition: 'current',
      ...(input.previousPublication === undefined ? {} : { supersedesRevision: input.previousPublication.revision }),
      registrationEvidenceRefs: [...input.evidenceRefs],
      createdAt: input.now,
      updatedAt: input.now,
    })
  }
  const isRepublish = input.previousPublication !== undefined
  const auditId = await ensureSupplyAudit(ports, {
    eventType: 'capability_publication.published',
    action: 'publish_capability',
    targetType: 'capability_publication',
    targetRef: publicationRef,
    actor: input.actor,
    context: input,
    payload: {
      businessId: input.businessId,
      sourceKind: prepared.sourceKind,
      sourceDigest,
      priceDigest: prepared.priceDigest,
      contractRef: encoded.contract.ref,
      operationRef,
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      ...(isRepublish ? { supersedesRevision: input.previousPublication!.revision } : {}),
    },
    beforeState: isRepublish ? 'withdrawn' : 'absent',
    afterState: 'inactive',
    createdAt: input.now,
  })
  await succeedOperation(ports, operation.operationId, expected, [auditId], input.now)
  await ports.scheduleReadinessProbe(publicationRef, input.revision)
  return { ...expected, kind: 'published', operationId: operation.operationId }
}

function validatePreparedPublication(prepared: PreparedPublicationMaterial): PreparedValidation {
  if (!isCanonicalDigest(prepared.sourceDigest) || !isCanonicalDigest(prepared.priceDigest)) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const expectedSourceDigest = canonicalDigest({
    sourceKind: prepared.sourceKind,
    selector: prepared.sourceSelector,
    descriptorJson: prepared.sourceDescriptorJson,
  } as StableHashValue)
  if (prepared.sourceDigest !== expectedSourceDigest) return { kind: 'refused', reason: 'source_invalid' }
  let parsedPricing: Readonly<
    | { kind: 'valid'; config: PricingConfig }
    | { kind: 'invalid'; code: 'pricing_config_invalid' }
  >
  try {
    parsedPricing = normalizePricingConfig(JSON.parse(prepared.pricingConfigJson))
  } catch {
    return { kind: 'refused', reason: 'pricing_config_invalid' }
  }
  if (parsedPricing.kind === 'invalid' || pricingConfigDigest(parsedPricing.config) !== prepared.priceDigest) {
    return { kind: 'refused', reason: 'pricing_config_invalid' }
  }
  return { kind: 'valid', pricing: parsedPricing.config }
}

function revisionSpecificBindingId(bindingId: string, revision: number): string {
  const suffix = `:revision:${revision}`
  return bindingId.length + suffix.length <= 200
    ? `${bindingId}${suffix}`
    : `${bindingId.slice(0, 200 - suffix.length)}${suffix}`
}

function mapAdmissionRefusal(reason: string): PublishPreparedCapabilityRefusal {
  switch (reason) {
    case 'source_revision_invalid':
      return 'source_revision_invalid'
    case 'source_invalid':
    case 'pricing_config_invalid':
    case 'contract_too_large':
    case 'contract_invalid':
      return 'source_invalid'
    case 'offering_invalid':
    case 'binding_invalid':
    case 'adapter_not_registered':
    case 'adapter_config_invalid':
    case 'adapter_config_too_large':
      return reason
    default:
      return 'source_invalid'
  }
}
