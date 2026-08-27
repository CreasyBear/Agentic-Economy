import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { compareExactAmounts, exactAmountSchema, pricingConfigDigest } from '@/modules/money/public'

import type { PublicCapabilityUnavailableReason, PublicOperationPrice } from './operation-projection'
import type { PublishedOperation } from './published-operation'
import {
  capabilityBindingRegistrationHash,
  capabilityOperationId,
  capabilityOfferingRegistrationHash,
  connectionAuthoritySnapshotIsValid,
  createPublicOperationRef,
  isPublicOperationRef,
  type PublicOperationRef,
} from './public'

const CURRENT_OPERATION_UNAVAILABLE_REASONS: readonly PublicCapabilityUnavailableReason[] = [
  'setup_required',
  'temporarily_unavailable',
  'readiness_expired',
  'publisher_withdrew',
  'under_review',
  'updated_terms_require_review',
  'not_supported_by_ae',
]

export type CurrentOperationCommitment = Readonly<{
  schemaVersion: 'current_operation_commitment:v1'
  operationRef: PublicOperationRef
  operationId: string
  runtimeEnvironment: PublishedOperation['runtimeEnvironment']
  publication: Readonly<{
    ref: string
    revision: number
    digest: string
  }>
  materialAuthorityDigest: string
  contractRef: CapabilityContractRef
  offering: Readonly<{ id: string; digest: string }>
  binding: Readonly<{ id: string; digest: string }>
  commercial: Readonly<{
    price: PublicOperationPrice
    priceDigest: string
    priceAuthorityDigest?: string
    materialTermsDigest: string
  }>
  effects: PublishedOperation['contract']['effects']
  effectsDigest: string
  readiness: Readonly<{
    observedAt?: number
    validUntil?: number
    qualificationDigest: string
    evidenceDigest: string
    unavailableReason?: PublicCapabilityUnavailableReason
  }>
  transport: Readonly<{
    adapterId: string
    configDigest: string
  }>
  providerAuthority:
    | Readonly<{ kind: 'public_upstream' }>
    | Readonly<{
        kind: 'provider_connection'
        connectionRef: string
        providerRef: string
        authorityGeneration?: number
        authorityDigest?: string
      }>
  currentDigest: string
}>

export type CurrentOperationCommitmentMaterial = Readonly<
  Omit<CurrentOperationCommitment, 'currentDigest'>
>

export type AvailableCurrentOperationCommitment = Readonly<
  Omit<CurrentOperationCommitment, 'readiness'>
  & Readonly<{
    readiness: Readonly<
      Omit<
        CurrentOperationCommitment['readiness'],
        'observedAt' | 'validUntil' | 'unavailableReason'
      >
      & Readonly<{ observedAt: number; validUntil: number; unavailableReason?: never }>
    >
  }>
>

export type UnavailableCurrentOperationCommitment = Readonly<
  Omit<CurrentOperationCommitment, 'readiness'>
  & Readonly<{
    readiness: Readonly<
      Omit<CurrentOperationCommitment['readiness'], 'unavailableReason'>
      & Readonly<{ unavailableReason: PublicCapabilityUnavailableReason }>
    >
  }>
>

export type CurrentOperationReadResult =
  | Readonly<{ kind: 'current'; commitment: AvailableCurrentOperationCommitment }>
  | Readonly<{ kind: 'not_current' }>
  | Readonly<{
      kind: 'unavailable'
      reason: PublicCapabilityUnavailableReason
      commitment: UnavailableCurrentOperationCommitment
    }>

export function currentOperationReadResult(
  commitment: CurrentOperationCommitment,
): Exclude<CurrentOperationReadResult, Readonly<{ kind: 'not_current' }>> {
  const reason = commitment.readiness.unavailableReason
  return reason === undefined
    ? { kind: 'current', commitment: commitment as AvailableCurrentOperationCommitment }
    : {
        kind: 'unavailable',
        reason,
        commitment: commitment as UnavailableCurrentOperationCommitment,
      }
}

export function createCurrentOperationCommitmentFromMaterial(
  material: CurrentOperationCommitmentMaterial,
): CurrentOperationCommitment {
  const expectedOperationRef = createPublicOperationRef({
    operationId: material.operationId,
    publicationRef: material.publication.ref,
    publicationRevision: material.publication.revision,
    contractRef: material.contractRef,
  })
  if (material.schemaVersion !== 'current_operation_commitment:v1'
    || !isPublicOperationRef(material.operationRef)
    || material.operationRef !== expectedOperationRef
    || material.operationId !== capabilityOperationId(material.contractRef.capabilityId)
    || (material.runtimeEnvironment !== 'sandbox' && material.runtimeEnvironment !== 'production')
    || material.publication.ref.trim().length === 0
    || !Number.isSafeInteger(material.publication.revision)
    || material.publication.revision < 1
    || !isCanonicalDigest(material.publication.digest)
    || !isCanonicalDigest(material.materialAuthorityDigest)
    || material.contractRef.capabilityId.trim().length === 0
    || !Number.isSafeInteger(material.contractRef.version)
    || material.contractRef.version < 1
    || !isCanonicalDigest(material.contractRef.contractDigest)
    || material.offering.id.trim().length === 0
    || !isCanonicalDigest(material.offering.digest)
    || material.binding.id.trim().length === 0
    || !isCanonicalDigest(material.binding.digest)
    || !publicPriceIsExact(material.commercial.price)
    || material.commercial.priceDigest !== canonicalDigest(material.commercial.price)
    || (material.commercial.priceAuthorityDigest !== undefined
      && !isCanonicalDigest(material.commercial.priceAuthorityDigest))
    || !isCanonicalDigest(material.commercial.materialTermsDigest)
    || material.effectsDigest !== canonicalDigest(material.effects)
    || !readinessIsExact(material.readiness)
    || material.transport.adapterId.trim().length === 0
    || !isCanonicalDigest(material.transport.configDigest)
    || !providerAuthorityMaterialIsExact(material.providerAuthority)) {
    throw new Error('current_operation_not_exact')
  }
  return deepFreeze({
    ...material,
    currentDigest: canonicalDigest(material as StableHashValue),
  })
}

export function createCurrentOperationCommitment(input: Readonly<{
  operationRef: string
  operation: PublishedOperation
}>): CurrentOperationCommitment {
  const { operation } = input
  const contractRef = operation.contract.ref
  const expectedOperationRef = createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef,
  })
  const { ref: _contractRef, ...contractDocument } = operation.contract
  const expectedOfferingDigest = capabilityOfferingRegistrationHash(operation.offering)
  const expectedBindingDigest = capabilityBindingRegistrationHash(operation.binding, operation.transport)
  const providerAuthority = currentProviderAuthority(operation, expectedOperationRef)

  if (!isPublicOperationRef(input.operationRef)
    || input.operationRef !== expectedOperationRef
    || operation.kind !== 'published_operation'
    || operation.environment !== 'SOURCE-OWNED DEVELOPMENT EVIDENCE'
    || operation.operationId.trim().length === 0
    || operation.operationId !== capabilityOperationId(contractRef.capabilityId)
    || !Number.isSafeInteger(operation.identity.publicationRevision)
    || operation.identity.publicationRevision < 1
    || operation.identity.publicationRef.trim().length === 0
    || operation.runtimeEnvironment !== readIdentityRuntimeEnvironment(operation)
    || operation.identity.contractId !== contractRef.capabilityId
    || operation.identity.contractVersion !== contractRef.version
    || operation.identity.contractDigest !== contractRef.contractDigest
    || operation.contract.capabilityId !== contractRef.capabilityId
    || operation.contract.version !== contractRef.version
    || canonicalDigest(contractDocument as StableHashValue) !== contractRef.contractDigest
    || operation.identity.offeringId !== operation.offering.offeringId
    || operation.identity.businessId !== operation.offering.businessId
    || operation.identity.offeringDigest !== expectedOfferingDigest
    || operation.identity.bindingId !== operation.binding.bindingId
    || operation.binding.offeringId !== operation.offering.offeringId
    || !sameStableValue(operation.binding.contractRef, contractRef)
    || !sameStableValue(operation.offering.contractRef, contractRef)
    || operation.identity.bindingDigest !== expectedBindingDigest
    || operation.identity.adapterId !== operation.binding.adapter.adapterId
    || operation.identity.transportConfigDigest !== operation.transport.configDigest
    || !transportConfigIsExact(operation)
    || operation.priceDigest !== operation.identity.priceDigest
    || operation.priceDigest !== pricingConfigDigest(operation.pricingConfig)
    || operation.identity.price.kind !== 'fixed'
    || compareExactAmounts(operation.identity.price.amount, operation.pricingConfig.paidAmount) !== 0
    || !sameStableValue(operation.pricingConfig, operation.identity.pricingConfig)
    || !sameStableValue(operation.identity.price, operation.offering.presentation.price)
    || !sameStableValue(operation.identity.materialTerms, operation.offering.presentation.materialTerms)
    || !isCanonicalDigest(operation.identity.publicationDigest)
    || !isCanonicalDigest(operation.identity.evidenceDigest)
    || !isCanonicalDigest(operation.readiness.qualificationDigest)
    || !Number.isSafeInteger(operation.readiness.observedAt)
    || operation.readiness.observedAt < 0
    || !Number.isSafeInteger(operation.readiness.validUntil)
    || operation.readiness.validUntil <= operation.readiness.observedAt
    || operation.materialDigest !== canonicalDigest(operation.identity as StableHashValue)
    || providerAuthority === undefined) {
    throw new Error('current_operation_not_exact')
  }

  const material: CurrentOperationCommitmentMaterial = {
    schemaVersion: 'current_operation_commitment:v1',
    operationRef: expectedOperationRef,
    operationId: operation.operationId,
    runtimeEnvironment: operation.runtimeEnvironment,
    publication: {
      ref: operation.identity.publicationRef,
      revision: operation.identity.publicationRevision,
      digest: operation.identity.publicationDigest,
    },
    materialAuthorityDigest: operation.materialDigest,
    contractRef: { ...contractRef },
    offering: { id: operation.identity.offeringId, digest: operation.identity.offeringDigest },
    binding: { id: operation.identity.bindingId, digest: operation.identity.bindingDigest },
    commercial: {
      price: operation.identity.price,
      priceDigest: canonicalDigest(operation.identity.price),
      priceAuthorityDigest: operation.identity.priceDigest,
      materialTermsDigest: canonicalDigest(operation.identity.materialTerms as StableHashValue),
    },
    effects: operation.contract.effects,
    effectsDigest: canonicalDigest(operation.contract.effects as StableHashValue),
    readiness: {
      observedAt: operation.readiness.observedAt,
      validUntil: operation.readiness.validUntil,
      qualificationDigest: operation.readiness.qualificationDigest,
      evidenceDigest: canonicalDigest([...operation.readiness.evidenceRefs].sort()),
    },
    transport: {
      adapterId: operation.identity.adapterId,
      configDigest: operation.identity.transportConfigDigest,
    },
    providerAuthority,
  }

  return createCurrentOperationCommitmentFromMaterial(material)
}

function currentProviderAuthority(
  operation: PublishedOperation,
  expectedOperationRef: PublicOperationRef,
): CurrentOperationCommitment['providerAuthority'] | undefined {
  const bindingAuthority = operation.binding.authority
  const operationAuthority = operation.connectionAuthority
  const identityAuthority = operation.identity.connectionAuthority
  if (bindingAuthority.kind === 'public_upstream') {
    return operationAuthority === undefined && identityAuthority === undefined
      ? { kind: 'public_upstream' }
      : undefined
  }
  if (!connectionAuthoritySnapshotIsValid(operationAuthority)
    || !connectionAuthoritySnapshotIsValid(identityAuthority)
    || operationAuthority.connectionRef !== bindingAuthority.connectionRef
    || operationAuthority.providerRef !== bindingAuthority.providerRef
    || operationAuthority.adapterId !== operation.identity.adapterId
    || operationAuthority.operationRef !== expectedOperationRef
    || !sameStableValue(operationAuthority, identityAuthority)
    || !Number.isSafeInteger(operationAuthority.authorityGeneration)
    || operationAuthority.authorityGeneration < 1
    || !isCanonicalDigest(operationAuthority.authorityDigest)) return undefined
  return {
    kind: 'provider_connection',
    connectionRef: operationAuthority.connectionRef,
    providerRef: operationAuthority.providerRef,
    authorityGeneration: operationAuthority.authorityGeneration,
    authorityDigest: operationAuthority.authorityDigest,
  }
}

function publicPriceIsExact(price: PublicOperationPrice): boolean {
  if (price.kind === 'on_request') return true
  if (price.kind === 'fixed') return exactAmountSchema.safeParse(price.amount).success
  return exactAmountSchema.safeParse(price.minimum).success
    && exactAmountSchema.safeParse(price.maximum).success
    && (compareExactAmounts(price.minimum, price.maximum) ?? 1) <= 0
}

function readinessIsExact(readiness: CurrentOperationCommitmentMaterial['readiness']): boolean {
  const observedAt = readiness.observedAt
  const validUntil = readiness.validUntil
  const hasCompleteWindow = observedAt !== undefined && validUntil !== undefined
  return isCanonicalDigest(readiness.qualificationDigest)
    && isCanonicalDigest(readiness.evidenceDigest)
    && (observedAt === undefined || (Number.isSafeInteger(observedAt) && observedAt >= 0))
    && (validUntil === undefined || (Number.isSafeInteger(validUntil) && validUntil > 0))
    && (observedAt === undefined || validUntil === undefined || validUntil > observedAt)
    && (readiness.unavailableReason === undefined
      || CURRENT_OPERATION_UNAVAILABLE_REASONS.includes(readiness.unavailableReason))
    && (readiness.unavailableReason !== undefined || hasCompleteWindow)
}

function providerAuthorityMaterialIsExact(
  authority: CurrentOperationCommitmentMaterial['providerAuthority'],
): boolean {
  if (authority.kind === 'public_upstream') return true
  const hasGeneration = authority.authorityGeneration !== undefined
  const hasDigest = authority.authorityDigest !== undefined
  if (authority.connectionRef.trim().length === 0
    || authority.providerRef.trim().length === 0
    || hasGeneration !== hasDigest) return false
  if (!hasGeneration) return true
  const generation = authority.authorityGeneration
  const digest = authority.authorityDigest
  return generation !== undefined
    && digest !== undefined
    && Number.isSafeInteger(generation)
    && generation >= 1
    && isCanonicalDigest(digest)
}

function transportConfigIsExact(operation: PublishedOperation): boolean {
  try {
    const parsed: unknown = JSON.parse(operation.transport.configJson)
    return canonicalDigest(parsed) === operation.transport.configDigest
      && canonicalDigest(operation.binding.adapter.config) === operation.transport.configDigest
  } catch {
    return false
  }
}

function readIdentityRuntimeEnvironment(
  operation: PublishedOperation,
): PublishedOperation['runtimeEnvironment'] | undefined {
  const identity = operation.identity as PublishedOperation['identity'] & Readonly<{
    runtimeEnvironment?: PublishedOperation['runtimeEnvironment']
  }>
  return identity.runtimeEnvironment
}

function sameStableValue(left: unknown, right: unknown): boolean {
  try {
    return canonicalDigest(left) === canonicalDigest(right)
  } catch {
    return false
  }
}
