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

import {
  connectionAuthoritySnapshotMatches,
  type CapabilityConnectionAuthoritySnapshot,
} from '../binding/registration'
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
import {
  admitPublicationDraft,
  type AdmittedPublicationDraft,
  type PreparedPublicationMaterial,
} from './draft'
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

const allPublicationFacts = (facts: readonly boolean[]): boolean =>
  facts.every(Boolean)

function publicationMetadataMatches(input: Readonly<{
  metadata: CapabilityPublicationProvenance
  actor: SupplyCommandActor
  sourceRevision: string
  sourceDigest: string
}>): boolean {
  const { metadata, actor, sourceRevision, sourceDigest } = input
  return allPublicationFacts([
    metadata.publisherRef === actor.ref,
    metadata.sourceRevision === sourceRevision,
    metadata.provenanceDigest === capabilityPublicationProvenanceDigest({
      publisherRef: metadata.publisherRef,
      authorityMode: metadata.authorityMode,
      sourceRevision,
      sourceDigest,
    }),
  ])
}

function previousPublicationMatchesRegistration(
  previous: PublicationCommandRow,
  admitted: AdmittedPublicationDraft,
  businessId: string,
): boolean {
  return allPublicationFacts([
    previous.capabilityId === admitted.encoded.contract.ref.capabilityId,
    previous.version === admitted.encoded.contract.ref.version,
    previous.contractDigest === admitted.encoded.contract.ref.contractDigest,
    previous.offeringId === admitted.offering.offeringId,
    previous.businessId === businessId,
  ])
}

function connectionAuthoritySnapshotsAgree(
  previous: PublicationCommandRow['connectionAuthority'],
  persisted: CapabilityConnectionAuthoritySnapshot | undefined,
): boolean {
  if (previous === undefined || persisted === undefined) {
    return previous === persisted
  }
  return canonicalDigest(previous as StableHashValue)
    === canonicalDigest(persisted as StableHashValue)
}

function initialTargetPublicationMatches(input: Readonly<{
  target: PublicationCommandRow
  runtimeEnvironment: PublishPreparedCapabilityCommandInput['runtimeEnvironment']
  sourceDigest: string
  offeringId: string
  bindingId: string
  priceDigest: string
}>): boolean {
  return allPublicationFacts([
    input.target.runtimeEnvironment === input.runtimeEnvironment,
    input.target.sourceDigest === input.sourceDigest,
    input.target.offeringId === input.offeringId,
    input.target.bindingId === input.bindingId,
    input.target.priceDigest === input.priceDigest,
  ])
}

function republishTargetMatches(input: Readonly<{
  target: PublicationCommandRow
  previous: PublicationCommandRow
  admitted: AdmittedPublicationDraft
  prepared: PreparedPublicationMaterial
  bindingId: string
  businessId: string
  runtimeEnvironment: PublishPreparedCapabilityCommandInput['runtimeEnvironment']
  revision: number
  operationRef: string
  metadata: CapabilityPublicationProvenance
}>): boolean {
  const {
    target,
    previous,
    admitted,
    prepared,
    bindingId,
    businessId,
    runtimeEnvironment,
    revision,
    operationRef,
    metadata,
  } = input
  const { encoded, offering } = admitted
  return allPublicationFacts([
    target.operationRef === operationRef,
    target.revision === revision,
    target.businessId === businessId,
    target.networkId === offering.networkId,
    target.runtimeEnvironment === runtimeEnvironment,
    target.capabilityId === encoded.contract.ref.capabilityId,
    target.version === encoded.contract.ref.version,
    target.contractDigest === encoded.contract.ref.contractDigest,
    target.offeringId === offering.offeringId,
    target.bindingId === bindingId,
    target.disposition === 'current',
    target.supersedesRevision === previous.revision,
    target.sourceKind === prepared.sourceKind,
    target.sourceSelector !== undefined,
    target.sourceSelector !== undefined
      && stableStringify(target.sourceSelector as StableHashValue)
        === stableStringify(prepared.sourceSelector as StableHashValue),
    target.sourceDescriptorJson === prepared.sourceDescriptorJson,
    target.sourceRevision === prepared.sourceRevision,
    target.sourceDigest === prepared.sourceDigest,
    target.pricingConfigJson === prepared.pricingConfigJson,
    target.priceDigest === prepared.priceDigest,
    target.publisherRef === metadata.publisherRef,
    target.authorityMode === metadata.authorityMode,
    target.provenanceDigest === metadata.provenanceDigest,
  ])
}

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

type PublicationCommitRefusal = Readonly<{
  kind: 'refused'
  reason: PublishPreparedCapabilityRefusal
}>

async function validatePublicationContractContinuity(
  input: PreparedPublicationCommitInput,
  ports: PublicationCommandPorts,
  admitted: AdmittedPublicationDraft,
): Promise<PublicationCommitRefusal | undefined> {
  const { offering, encoded } = admitted
  if (offering.origin?.kind === 'catalog_offering') {
    if (
      ports.catalogOriginIsCurrent === undefined
      || !await ports.catalogOriginIsCurrent(offering.origin, input.businessId)
    ) return { kind: 'refused', reason: 'catalog_offering_origin_changed' }
  }
  const existingContractDigest = await ports.findContractDigest(
    encoded.contract.ref.capabilityId,
    encoded.contract.ref.version,
  )
  if (
    existingContractDigest !== null
    && existingContractDigest !== encoded.contract.ref.contractDigest
  ) return { kind: 'refused', reason: 'contract_identity_conflict' }
  if (input.previousPublication === undefined) return undefined
  const exactContract = await ports.getExactRegisteredContract(encoded.contract.ref)
  if (
    exactContract.kind !== 'found'
    || canonicalDigest(exactContract.contract) !== canonicalDigest(encoded.contract)
  ) return { kind: 'refused', reason: 'contract_integrity_failure' }
  if (!previousPublicationMatchesRegistration(
    input.previousPublication,
    admitted,
    input.businessId,
  )) return { kind: 'refused', reason: 'registration_changed' }
  return undefined
}

async function validatePublicationOfferingIdentity(
  ports: PublicationCommandPorts,
  admitted: AdmittedPublicationDraft,
  previousPublication: PublicationCommandRow | undefined,
): Promise<PublicationCommitRefusal | undefined> {
  const offeringHash = capabilityOfferingRegistrationHash(admitted.offering)
  const existing = await ports.loadOfferingByOfferingId(admitted.offering.offeringId)
  if (previousPublication !== undefined && existing === null) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  if (existing === null) return undefined
  if (!offeringIntegrityIsValid(existing)) {
    return { kind: 'refused', reason: 'offering_integrity_failure' }
  }
  return existing.registrationHash === offeringHash
    ? undefined
    : { kind: 'refused', reason: 'offering_identity_conflict' }
}

async function preparePublicationBinding(input: Readonly<{
  command: PreparedPublicationCommitInput
  ports: PublicationCommandPorts
  admitted: AdmittedPublicationDraft
}>): Promise<
  | PublicationCommitRefusal
  | Readonly<{ kind: 'valid'; binding: AdmittedPublicationDraft['binding'] }>
> {
  const { command, ports, admitted } = input
  const { binding: originalBinding, admittedTransport } = admitted
  const originalBindingHash = capabilityBindingRegistrationHash(
    originalBinding,
    admittedTransport.transport,
  )
  const existingBinding = await ports.loadBindingByBindingId(originalBinding.bindingId)
  if (command.previousPublication !== undefined && existingBinding === null) {
    return { kind: 'refused', reason: 'registration_changed' }
  }
  if (existingBinding !== null) {
    if (!bindingIntegrityIsValid(existingBinding)) {
      return { kind: 'refused', reason: 'binding_integrity_failure' }
    }
    if (existingBinding.registrationHash !== originalBindingHash) {
      return { kind: 'refused', reason: 'binding_identity_conflict' }
    }
  }
  let binding = originalBinding
  if (command.previousPublication !== undefined) {
    const previousAuthority = command.previousPublication.connectionAuthority
    const persistedAuthority = existingBinding?.connectionAuthority
    if (!connectionAuthoritySnapshotsAgree(previousAuthority, persistedAuthority)) {
      return { kind: 'refused', reason: 'connection_authority_stale' }
    }
    if (persistedAuthority !== undefined) {
      if (ports.loadProviderConnection === undefined) {
        return { kind: 'refused', reason: 'connection_authority_stale' }
      }
      const connection = await ports.loadProviderConnection(persistedAuthority.connectionRef)
      if (!connectionAuthoritySnapshotMatches(
        persistedAuthority,
        connection,
        {
          businessId: command.businessId,
          operationRef: command.previousPublication.operationRef,
          adapterId: originalBinding.adapter.adapterId,
          now: command.now,
        },
      )) return { kind: 'refused', reason: 'connection_authority_stale' }
      if (persistedAuthority.operationRef !== command.previousPublication.operationRef) {
        return { kind: 'refused', reason: 'connection_authority_stale' }
      }
      binding = {
        ...originalBinding,
        bindingId: revisionSpecificBindingId(originalBinding.bindingId, command.revision),
      }
      const nextExisting = await ports.loadBindingByBindingId(binding.bindingId)
      if (nextExisting !== null && !command.allowExistingTargetForReplay) {
        return { kind: 'refused', reason: 'binding_identity_conflict' }
      }
    }
  }
  const bindingHash = capabilityBindingRegistrationHash(
    binding,
    admittedTransport.transport,
  )
  const targetBinding = binding.bindingId === originalBinding.bindingId
    ? existingBinding
    : await ports.loadBindingByBindingId(binding.bindingId)
  if (targetBinding !== null) {
    if (!bindingIntegrityIsValid(targetBinding)) {
      return { kind: 'refused', reason: 'binding_integrity_failure' }
    }
    if (targetBinding.registrationHash !== bindingHash) {
      return { kind: 'refused', reason: 'binding_identity_conflict' }
    }
  }
  return { kind: 'valid', binding }
}

async function preparePublicationTarget(input: Readonly<{
  command: PreparedPublicationCommitInput
  ports: PublicationCommandPorts
  admitted: AdmittedPublicationDraft
  binding: AdmittedPublicationDraft['binding']
  metadata: CapabilityPublicationProvenance
}>): Promise<
  | PublicationCommitRefusal
  | Readonly<{
      kind: 'valid'
      publicationRef: string
      targetPublication: PublicationCommandRow | null
      operationRef: ReturnType<typeof createPublicOperationRef>
    }>
> {
  const { command, ports, admitted, binding, metadata } = input
  const { offering, encoded } = admitted
  const prepared = command.prepared
  const publicationRef = command.previousPublication?.publicationRef
    ?? offering.offeringId
  const targetPublication = await ports.loadPublicationAtRevision(
    publicationRef,
    command.revision,
  )
  if (
    command.previousPublication !== undefined
    && targetPublication !== null
    && !command.allowExistingTargetForReplay
  ) return { kind: 'refused', reason: 'registration_changed' }
  if (
    command.previousPublication === undefined
    && targetPublication !== null
    && !initialTargetPublicationMatches({
      target: targetPublication,
      runtimeEnvironment: command.runtimeEnvironment,
      sourceDigest: prepared.sourceDigest,
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      priceDigest: prepared.priceDigest,
    })
  ) return { kind: 'refused', reason: 'offering_identity_conflict' }
  const operationRef = createPublicOperationRef({
    operationId: capabilityOperationId(encoded.contract.ref.capabilityId),
    publicationRef,
    publicationRevision: command.revision,
    contractRef: encoded.contract.ref,
  })
  if (
    command.previousPublication === undefined
    && targetPublication !== null
    && targetPublication.operationRef !== operationRef
  ) throw new Error('capability_publication_operation_ref_invalid')
  if (
    command.previousPublication !== undefined
    && targetPublication !== null
    && !republishTargetMatches({
      target: targetPublication,
      previous: command.previousPublication,
      admitted,
      prepared,
      bindingId: binding.bindingId,
      businessId: command.businessId,
      runtimeEnvironment: command.runtimeEnvironment,
      revision: command.revision,
      operationRef,
      metadata,
    })
  ) return { kind: 'refused', reason: 'registration_changed' }
  return { kind: 'valid', publicationRef, targetPublication, operationRef }
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
  const { encoded, offering } = admitted
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
  if (!publicationMetadataMatches({
    metadata: publicationMetadata,
    actor: input.actor,
    sourceRevision,
    sourceDigest,
  })) {
    return { kind: 'refused', reason: 'source_invalid' }
  }

  const contractRefusal = await validatePublicationContractContinuity(
    input,
    ports,
    admitted,
  )
  if (contractRefusal !== undefined) return contractRefusal
  const offeringRefusal = await validatePublicationOfferingIdentity(
    ports,
    admitted,
    input.previousPublication,
  )
  if (offeringRefusal !== undefined) return offeringRefusal
  const preparedBinding = await preparePublicationBinding({
    command: input,
    ports,
    admitted,
  })
  if (preparedBinding.kind === 'refused') return preparedBinding
  const binding = preparedBinding.binding

  const preparedTarget = await preparePublicationTarget({
    command: input,
    ports,
    admitted,
    binding,
    metadata: publicationMetadata,
  })
  if (preparedTarget.kind === 'refused') return preparedTarget
  const { publicationRef, targetPublication, operationRef } = preparedTarget
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
