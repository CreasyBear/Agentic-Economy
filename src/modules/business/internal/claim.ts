import { brandNonEmpty } from '@/modules/common/ids'
import type { Slug } from '@/modules/common/ids'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { sanitizeText } from '@/modules/common/sanitize-text'
import { allocateDeterministicSlug, assertCsrf, detectDuplicateClaim } from '@/modules/security/public'
import { validateOwnerPublishedPhone } from './published-phone'
import type {
  BusinessContext,
  BusinessContextRecord,
  BusinessRecord,
  BusinessSourceState,
  BusinessMutationActor,
  ClaimBusinessCommand,
  ClaimBusinessResult,
  ClaimRecord,
  BusinessOwnerRecord,
  PublicBusinessPhoto,
} from '@/modules/business/public'
import {
  canonicalProviderIdentifier,
  canonicalProviderWebsite,
} from '@/modules/business/public'

export function createEmptyBusinessSourceState(): BusinessSourceState {
  return {
    owners: [],
    businesses: [],
    businessContexts: [],
    claims: [],
    claimFingerprints: [],
  }
}

export function claimBusiness(state: BusinessSourceState, command: ClaimBusinessCommand): ClaimBusinessResult {
  const csrfDecision = assertCsrf(command.security.csrf)
  if (csrfDecision.kind === 'rejected') {
    return {
      kind: 'error',
      code: 'claim_csrf_rejected',
      retryable: false,
      reason: csrfDecision.reason,
    }
  }


  if (command.actor.kind === 'anonymous') {
    return {
      kind: 'error',
      code: 'claim_unauthenticated',
      retryable: false,
      reason: 'Authentication is required to claim a business.',
    }
  }

  const normalizedFacts = normalizeClaimFacts(command.facts)
  if (normalizedFacts.kind === 'invalid') {
    return {
      kind: 'error',
      code: 'claim_invalid_facts',
      retryable: false,
      reason: normalizedFacts.reason,
    }
  }

  const owner = findOrCreateOwner(state, command.actor, command.now)
  const duplicateDecision = detectDuplicateClaim(
    state.claimFingerprints,
    {
      name: normalizedFacts.name,
      category: normalizedFacts.category,
      businessContext: normalizedFacts.businessContext,
    },
    owner.ownerId,
  )

  if (duplicateDecision.kind === 'same_owner_conflict') {
    return {
      kind: 'error',
      code: 'claim_duplicate_conflict',
      retryable: false,
      reason: 'This owner already has a claim for the normalized business identity.',
    }
  }

  const allocatedSlug = allocateDeterministicSlug(
    normalizedFacts.slug,
    state.businesses.map((business) => business.slug)
  )
  const claimId = brandNonEmpty(`claim:${allocatedSlug}:${owner.ownerId}`, 'ClaimId')

  if (duplicateDecision.kind === 'pending_review') {
    const claim: ClaimRecord = {
      claimId,
      ownerId: owner.ownerId,
      slug: allocatedSlug,
      status: 'contested',
      submittedFactsHash: canonicalDigest({
        businessContext: normalizedFacts.businessContext,
        category: normalizedFacts.category,
        duplicate: duplicateDecision.publicReason,
        name: normalizedFacts.name,
        slug: allocatedSlug,
      }),
      createdAt: command.now,
      updatedAt: command.now,
    }

    state.claims.push(claim)
    state.claimFingerprints.push({
      fingerprint: duplicateDecision.fingerprint,
      status: 'duplicate_suspected',
      businessSlug: allocatedSlug,
      ownerId: owner.ownerId,
      claimId: claim.claimId,
      createdAt: command.now,
      updatedAt: command.now,
    })

    return {
      kind: 'error',
      code: 'claim_pending_review',
      retryable: false,
      reason: 'This claim needs owner review before it can publish.',
      publicReason: duplicateDecision.publicReason,
      claim,
    }
  }

  const businessId = brandNonEmpty(`business:${allocatedSlug}`, 'BusinessId')
  const sourceHash = canonicalDigest({
    businessContext: normalizedFacts.businessContext,
    category: normalizedFacts.category,
    name: normalizedFacts.name,
    slug: allocatedSlug,
    sourceRefs: normalizedFacts.sourceRefs.map((sourceRef) => ({
      evidenceRef: sourceRef.evidenceRef,
      label: sourceRef.label,
      sourceHash: sourceRef.sourceHash,
    })),
  })

  const business: BusinessRecord = {
    businessId,
    ownerId: owner.ownerId,
    slug: allocatedSlug,
    name: normalizedFacts.name,
    normalizedName: normalizeIdentityText(normalizedFacts.name),
    category: normalizedFacts.category,
    businessContext: normalizedFacts.businessContext,
    publicStatus: 'unpublished',
    trustTier: 'claimed',
    claimStatus: 'authenticated',
    sourceHash,
    createdAt: command.now,
    updatedAt: command.now,
  }

  const context: BusinessContextRecord = {
    businessId,
    category: normalizedFacts.category,
    businessContext: normalizedFacts.businessContext,
    sourceRefs: normalizedFacts.sourceRefs,
    sourceHash,
    approvedAt: command.now,
    ...(normalizedFacts.ownerMessage === undefined ? {} : { ownerMessage: normalizedFacts.ownerMessage }),
    ...(normalizedFacts.photos === undefined || normalizedFacts.photos.length === 0
      ? {}
      : { photos: normalizedFacts.photos }),
    ...(normalizedFacts.responseTimeMinutes === undefined
      ? {}
      : { responseTimeMinutes: normalizedFacts.responseTimeMinutes }),
  }

  const claim: ClaimRecord = {
    claimId,
    ownerId: owner.ownerId,
    businessId,
    slug: allocatedSlug,
    status: 'authenticated',
    submittedFactsHash: sourceHash,
    createdAt: command.now,
    updatedAt: command.now,
  }

  state.businesses.push(business)
  state.businessContexts.push(context)
  state.claims.push(claim)
  state.claimFingerprints.push({
    fingerprint: duplicateDecision.fingerprint,
    status: 'clear',
    businessSlug: allocatedSlug,
    ownerId: owner.ownerId,
    claimId: claim.claimId,
    createdAt: command.now,
    updatedAt: command.now,
  })

  return {
    kind: 'ok',
    code: 'claim_created',
    owner,
    business,
    claim,
    context,
  }
}

type NormalizedClaimFacts =
  | {
      kind: 'valid'
      name: string
      category: string
      businessContext: BusinessContext
      slug: Slug
      ownerMessage?: string
      photos?: readonly PublicBusinessPhoto[]
      responseTimeMinutes?: number
      sourceRefs: ClaimBusinessCommand['facts']['sourceRefs']
    }
  | { kind: 'invalid'; reason: string }

function normalizeClaimFacts(facts: ClaimBusinessCommand['facts']): NormalizedClaimFacts {
  const name = normalizePublicText(facts.name)
  const category = normalizePublicText(facts.category)
  const slugText = normalizeSlug(facts.requestedSlug)
  const sourceRefs = facts.sourceRefs

  if (name.length === 0 || category.length === 0) {
    return { kind: 'invalid', reason: 'Name and category are required.' }
  }

  if (slugText.length === 0) {
    return { kind: 'invalid', reason: 'A public slug is required.' }
  }

  if (sourceRefs.length === 0) {
    return { kind: 'invalid', reason: 'At least one source reference is required.' }
  }

  const context = facts.businessContext
  let businessContext: BusinessContext
  if (context.kind === 'local_human') {
    const suburb = normalizePublicText(context.suburb)
    const stateTerritory = normalizePublicText(context.stateTerritory)
    const postcode = normalizeOptionalText(context.postcode)
    const publishedPhoneValidation = validateOwnerPublishedPhone(context.publishedPhone)
    if (suburb.length === 0 || stateTerritory.length === 0) {
      return { kind: 'invalid', reason: 'Name, category, suburb, and state/territory are required.' }
    }
    if (publishedPhoneValidation.kind === 'invalid') {
      return { kind: 'invalid', reason: 'Published phone must be a valid Australian phone number.' }
    }
    businessContext = {
      kind: 'local_human',
      suburb,
      stateTerritory,
      ...(postcode === undefined ? {} : { postcode }),
      ...(publishedPhoneValidation.kind === 'valid' ? { publishedPhone: publishedPhoneValidation.value } : {}),
    }
  } else {
    const website = canonicalProviderWebsite(context.website)
    const providerIdentifier = canonicalProviderIdentifier(context.providerIdentifier)
    if (website === undefined || providerIdentifier === undefined) {
      return { kind: 'invalid', reason: 'Provider website and identifier are required.' }
    }
    businessContext = { kind: 'programmable_provider', website, providerIdentifier }
  }

  const ownerMessage = normalizeOptionalText(facts.ownerMessage)
  const base = {
    kind: 'valid' as const,
    name,
    category,
    businessContext,
    slug: brandNonEmpty(slugText, 'Slug'),
    sourceRefs,
    ...(facts.photos === undefined || facts.photos.length === 0 ? {} : { photos: facts.photos }),
    ...(facts.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: facts.responseTimeMinutes }),
  }

  return ownerMessage === undefined ? base : { ...base, ownerMessage }
}

function findOrCreateOwner(
  state: BusinessSourceState,
  actor: Extract<BusinessMutationActor, { kind: 'authenticated_owner' }>,
  now: number
): BusinessOwnerRecord {
  const existing = state.owners.find((owner) => owner.clerkUserId === actor.clerkUserId)
  if (existing !== undefined) {
    return existing
  }

  const ownerId = brandNonEmpty(`owner:${actor.clerkUserId}`, 'OwnerId')
  const ownerBase = {
    ownerId,
    clerkUserId: actor.clerkUserId,
    createdAt: now,
    updatedAt: now,
  }
  const owner: BusinessOwnerRecord =
    actor.displayName === undefined && actor.emailHash === undefined
      ? ownerBase
      : {
          ...ownerBase,
          ...(actor.displayName === undefined ? {} : { displayName: normalizePublicText(actor.displayName) }),
          ...(actor.emailHash === undefined ? {} : { emailHash: actor.emailHash }),
        }

  state.owners.push(owner)
  return owner
}

function normalizePublicText(value: string): string {
  return sanitizeText(value, 240)
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = normalizePublicText(value)
  return normalized.length === 0 ? undefined : normalized
}



function normalizeIdentityText(value: string): string {
  return normalizePublicText(value).toLowerCase()
}
