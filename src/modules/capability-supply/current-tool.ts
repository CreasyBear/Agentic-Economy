import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { compareExactAmounts, exactAmountSchema, pricingConfigDecisionAmount, pricingConfigDigest } from '@/modules/money/public'

import type { PublicCapabilityUnavailableReason, PublicToolPrice } from './tool-projection'
import type { PublishedTool } from './published-tool'
import {
  capabilityBindingRegistrationHash,
  capabilityToolId,
  capabilityOfferingRegistrationHash,
  connectionAuthoritySnapshotIsValid,
  createPublicToolRef,
  isPublicToolRef,
  publishedToolIdentityDigest,
  type PublicToolRef,
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

export type CurrentToolQuote = Readonly<{
  schemaVersion: 'current_operation_commitment:v1'
  toolRef: PublicToolRef
  operationId: string
  runtimeEnvironment: PublishedTool['runtimeEnvironment']
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
    price: PublicToolPrice
    priceDigest: string
    priceAuthorityDigest?: string
    materialTermsDigest: string
  }>
  effects: PublishedTool['contract']['effects']
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

export type CurrentToolQuoteMaterial = Readonly<
  Omit<CurrentToolQuote, 'currentDigest'>
>

export type AvailableCurrentToolQuote = Readonly<
  Omit<CurrentToolQuote, 'readiness'>
  & Readonly<{
    readiness: Readonly<
      Omit<
        CurrentToolQuote['readiness'],
        'observedAt' | 'validUntil' | 'unavailableReason'
      >
      & Readonly<{ observedAt: number; validUntil: number; unavailableReason?: never }>
    >
  }>
>

export type UnavailableCurrentToolQuote = Readonly<
  Omit<CurrentToolQuote, 'readiness'>
  & Readonly<{
    readiness: Readonly<
      Omit<CurrentToolQuote['readiness'], 'unavailableReason'>
      & Readonly<{ unavailableReason: PublicCapabilityUnavailableReason }>
    >
  }>
>

export type CurrentToolReadResult =
  | Readonly<{ kind: 'current'; quote: AvailableCurrentToolQuote }>
  | Readonly<{ kind: 'not_current' }>
  | Readonly<{
      kind: 'unavailable'
      reason: PublicCapabilityUnavailableReason
      quote: UnavailableCurrentToolQuote
    }>

export function currentToolReadResult(
  quote: CurrentToolQuote,
): Exclude<CurrentToolReadResult, Readonly<{ kind: 'not_current' }>> {
  const reason = quote.readiness.unavailableReason
  return reason === undefined
    ? { kind: 'current', quote: quote as AvailableCurrentToolQuote }
    : {
        kind: 'unavailable',
        reason,
        quote: quote as UnavailableCurrentToolQuote,
      }
}

export function createCurrentToolQuoteFromMaterial(
  material: CurrentToolQuoteMaterial,
): CurrentToolQuote {
  const expectedToolRef = createPublicToolRef({
    operationId: material.operationId,
    publicationRef: material.publication.ref,
    publicationRevision: material.publication.revision,
    contractRef: material.contractRef,
  })
  if (material.schemaVersion !== 'current_operation_commitment:v1'
    || !isPublicToolRef(material.toolRef)
    || material.toolRef !== expectedToolRef
    || material.operationId !== capabilityToolId(material.contractRef.capabilityId)
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
    throw new Error('current_tool_not_exact')
  }
  const { toolRef, ...canonicalMaterial } = material
  return deepFreeze({
    ...material,
    currentDigest: canonicalDigest({
      ...canonicalMaterial,
      operationRef: toolRef,
    } as StableHashValue),
  })
}

export function createCurrentToolQuote(input: Readonly<{
  toolRef: string
  tool: PublishedTool
}>): CurrentToolQuote {
  const { tool } = input
  const contractRef = tool.contract.ref
  const expectedToolRef = createPublicToolRef({
    operationId: tool.operationId,
    publicationRef: tool.identity.publicationRef,
    publicationRevision: tool.identity.publicationRevision,
    contractRef,
  })
  const { ref: _contractRef, ...contractDocument } = tool.contract
  const expectedOfferingDigest = capabilityOfferingRegistrationHash(tool.offering)
  const expectedBindingDigest = capabilityBindingRegistrationHash(tool.binding, tool.transport)
  const providerAuthority = currentProviderAuthority(tool, expectedToolRef)
  const toolPricingMatches = tool.pricingConfig.kind === 'managed_x402'
    ? tool.identity.price.kind === 'on_request'
    : tool.identity.price.kind === 'fixed'
      && compareExactAmounts(
        tool.identity.price.amount,
        pricingConfigDecisionAmount(tool.pricingConfig),
      ) === 0

  if (!isPublicToolRef(input.toolRef)
    || input.toolRef !== expectedToolRef
    || tool.kind !== 'published_operation'
    || tool.environment !== 'SOURCE-OWNED DEVELOPMENT EVIDENCE'
    || tool.operationId.trim().length === 0
    || tool.operationId !== capabilityToolId(contractRef.capabilityId)
    || !Number.isSafeInteger(tool.identity.publicationRevision)
    || tool.identity.publicationRevision < 1
    || tool.identity.publicationRef.trim().length === 0
    || tool.runtimeEnvironment !== readIdentityRuntimeEnvironment(tool)
    || tool.identity.contractId !== contractRef.capabilityId
    || tool.identity.contractVersion !== contractRef.version
    || tool.identity.contractDigest !== contractRef.contractDigest
    || tool.contract.capabilityId !== contractRef.capabilityId
    || tool.contract.version !== contractRef.version
    || canonicalDigest(contractDocument as StableHashValue) !== contractRef.contractDigest
    || tool.identity.offeringId !== tool.offering.offeringId
    || tool.identity.businessId !== tool.offering.businessId
    || tool.identity.offeringDigest !== expectedOfferingDigest
    || tool.identity.bindingId !== tool.binding.bindingId
    || tool.binding.offeringId !== tool.offering.offeringId
    || !sameStableValue(tool.binding.contractRef, contractRef)
    || !sameStableValue(tool.offering.contractRef, contractRef)
    || tool.identity.bindingDigest !== expectedBindingDigest
    || tool.identity.adapterId !== tool.binding.adapter.adapterId
    || tool.identity.transportConfigDigest !== tool.transport.configDigest
    || !transportConfigIsExact(tool)
    || tool.priceDigest !== tool.identity.priceDigest
    || tool.priceDigest !== pricingConfigDigest(tool.pricingConfig)
    || !toolPricingMatches
    || !sameStableValue(tool.pricingConfig, tool.identity.pricingConfig)
    || !sameStableValue(tool.identity.price, tool.offering.presentation.price)
    || !sameStableValue(tool.identity.materialTerms, tool.offering.presentation.materialTerms)
    || !isCanonicalDigest(tool.identity.publicationDigest)
    || !isCanonicalDigest(tool.identity.evidenceDigest)
    || !isCanonicalDigest(tool.readiness.qualificationDigest)
    || !Number.isSafeInteger(tool.readiness.observedAt)
    || tool.readiness.observedAt < 0
    || !Number.isSafeInteger(tool.readiness.validUntil)
    || tool.readiness.validUntil <= tool.readiness.observedAt
    || tool.materialDigest !== publishedToolIdentityDigest(tool.identity)
    || providerAuthority === undefined) {
    throw new Error('current_tool_not_exact')
  }

  const material: CurrentToolQuoteMaterial = {
    schemaVersion: 'current_operation_commitment:v1',
    toolRef: expectedToolRef,
    operationId: tool.operationId,
    runtimeEnvironment: tool.runtimeEnvironment,
    publication: {
      ref: tool.identity.publicationRef,
      revision: tool.identity.publicationRevision,
      digest: tool.identity.publicationDigest,
    },
    materialAuthorityDigest: tool.materialDigest,
    contractRef: { ...contractRef },
    offering: { id: tool.identity.offeringId, digest: tool.identity.offeringDigest },
    binding: { id: tool.identity.bindingId, digest: tool.identity.bindingDigest },
    commercial: {
      price: tool.identity.price,
      priceDigest: canonicalDigest(tool.identity.price),
      priceAuthorityDigest: tool.identity.priceDigest,
      materialTermsDigest: canonicalDigest(tool.identity.materialTerms as StableHashValue),
    },
    effects: tool.contract.effects,
    effectsDigest: canonicalDigest(tool.contract.effects as StableHashValue),
    readiness: {
      observedAt: tool.readiness.observedAt,
      validUntil: tool.readiness.validUntil,
      qualificationDigest: tool.readiness.qualificationDigest,
      evidenceDigest: canonicalDigest([...tool.readiness.evidenceRefs].sort()),
    },
    transport: {
      adapterId: tool.identity.adapterId,
      configDigest: tool.identity.transportConfigDigest,
    },
    providerAuthority,
  }

  return createCurrentToolQuoteFromMaterial(material)
}

function currentProviderAuthority(
  tool: PublishedTool,
  expectedToolRef: PublicToolRef,
): CurrentToolQuote['providerAuthority'] | undefined {
  const bindingAuthority = tool.binding.authority
  const operationAuthority = tool.connectionAuthority
  const identityAuthority = tool.identity.connectionAuthority
  if (bindingAuthority.kind === 'public_upstream') {
    return operationAuthority === undefined && identityAuthority === undefined
      ? { kind: 'public_upstream' }
      : undefined
  }
  if (!connectionAuthoritySnapshotIsValid(operationAuthority)
    || !connectionAuthoritySnapshotIsValid(identityAuthority)
    || operationAuthority.connectionRef !== bindingAuthority.connectionRef
    || operationAuthority.providerRef !== bindingAuthority.providerRef
    || operationAuthority.adapterId !== tool.identity.adapterId
    || operationAuthority.toolRef !== expectedToolRef
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

function publicPriceIsExact(price: PublicToolPrice): boolean {
  if (price.kind === 'on_request') return true
  if (price.kind === 'fixed') return exactAmountSchema.safeParse(price.amount).success
  return exactAmountSchema.safeParse(price.minimum).success
    && exactAmountSchema.safeParse(price.maximum).success
    && (compareExactAmounts(price.minimum, price.maximum) ?? 1) <= 0
}

function readinessIsExact(readiness: CurrentToolQuoteMaterial['readiness']): boolean {
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
  authority: CurrentToolQuoteMaterial['providerAuthority'],
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

function transportConfigIsExact(tool: PublishedTool): boolean {
  try {
    const parsed: unknown = JSON.parse(tool.transport.configJson)
    return canonicalDigest(parsed) === tool.transport.configDigest
      && canonicalDigest(tool.binding.adapter.config) === tool.transport.configDigest
  } catch {
    return false
  }
}

function readIdentityRuntimeEnvironment(
  tool: PublishedTool,
): PublishedTool['runtimeEnvironment'] | undefined {
  const identity = tool.identity as PublishedTool['identity'] & Readonly<{
    runtimeEnvironment?: PublishedTool['runtimeEnvironment']
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
