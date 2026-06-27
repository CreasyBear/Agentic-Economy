import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import type {
  BusinessContextRecord,
  BusinessRecord,
  BusinessSourceState,
  BusinessMutationActor,
  ClaimBusinessCommand,
  ClaimBusinessResult,
  ClaimRecord,
  BusinessOwnerRecord,
} from '@/modules/business/public'

export function createEmptyBusinessSourceState(): BusinessSourceState {
  return {
    owners: [],
    businesses: [],
    businessContexts: [],
    claims: [],
  }
}

export function claimBusiness(state: BusinessSourceState, command: ClaimBusinessCommand): ClaimBusinessResult {
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

  const existingBusiness = state.businesses.find((business) => business.slug === normalizedFacts.slug)
  if (existingBusiness !== undefined) {
    return {
      kind: 'error',
      code: 'claim_slug_conflict',
      retryable: false,
      reason: 'Requested slug is already claimed.',
    }
  }

  const owner = findOrCreateOwner(state, command.actor, command.now)
  const businessId = brandNonEmpty(`business:${normalizedFacts.slug}`, 'BusinessId')
  const claimId = brandNonEmpty(`claim:${normalizedFacts.slug}:${owner.ownerId}`, 'ClaimId')
  const sourceHash = stableHash({
    category: normalizedFacts.category,
    name: normalizedFacts.name,
    slug: normalizedFacts.slug,
    sourceRefs: normalizedFacts.sourceRefs.map((sourceRef) => ({
      evidenceRef: sourceRef.evidenceRef,
      label: sourceRef.label,
      sourceHash: sourceRef.sourceHash,
    })),
    stateTerritory: normalizedFacts.stateTerritory,
    suburb: normalizedFacts.suburb,
  })

  const business: BusinessRecord = {
    businessId,
    ownerId: owner.ownerId,
    slug: normalizedFacts.slug,
    name: normalizedFacts.name,
    normalizedName: normalizeIdentityText(normalizedFacts.name),
    category: normalizedFacts.category,
    suburb: normalizedFacts.suburb,
    stateTerritory: normalizedFacts.stateTerritory,
    publicStatus: 'unpublished',
    trustTier: 'claimed',
    claimStatus: 'authenticated',
    sourceHash,
    createdAt: command.now,
    updatedAt: command.now,
  }

  const context: BusinessContextRecord =
    normalizedFacts.ownerMessage === undefined
      ? {
          businessId,
          category: normalizedFacts.category,
          suburb: normalizedFacts.suburb,
          stateTerritory: normalizedFacts.stateTerritory,
          sourceRefs: normalizedFacts.sourceRefs,
          sourceHash,
          approvedAt: command.now,
        }
      : {
          businessId,
          category: normalizedFacts.category,
          suburb: normalizedFacts.suburb,
          stateTerritory: normalizedFacts.stateTerritory,
          ownerMessage: normalizedFacts.ownerMessage,
          sourceRefs: normalizedFacts.sourceRefs,
          sourceHash,
          approvedAt: command.now,
        }

  const claim: ClaimRecord = {
    claimId,
    ownerId: owner.ownerId,
    businessId,
    slug: normalizedFacts.slug,
    status: 'authenticated',
    submittedFactsHash: sourceHash,
    createdAt: command.now,
    updatedAt: command.now,
  }

  state.businesses.push(business)
  state.businessContexts.push(context)
  state.claims.push(claim)

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
      suburb: string
      stateTerritory: string
      slug: ReturnType<typeof brandNonEmpty<string, 'Slug'>>
      ownerMessage?: string
      sourceRefs: ClaimBusinessCommand['facts']['sourceRefs']
    }
  | { kind: 'invalid'; reason: string }

function normalizeClaimFacts(facts: ClaimBusinessCommand['facts']): NormalizedClaimFacts {
  const name = normalizePublicText(facts.name)
  const category = normalizePublicText(facts.category)
  const suburb = normalizePublicText(facts.suburb)
  const stateTerritory = normalizePublicText(facts.stateTerritory)
  const slugText = normalizeSlug(facts.requestedSlug)

  if (name.length === 0 || category.length === 0 || suburb.length === 0 || stateTerritory.length === 0) {
    return { kind: 'invalid', reason: 'Name, category, suburb, and state/territory are required.' }
  }

  if (slugText.length === 0) {
    return { kind: 'invalid', reason: 'A public slug is required.' }
  }

  if (facts.sourceRefs.length === 0) {
    return { kind: 'invalid', reason: 'At least one source reference is required.' }
  }

  const ownerMessage = normalizeOptionalText(facts.ownerMessage)
  const base = {
    kind: 'valid' as const,
    name,
    category,
    suburb,
    stateTerritory,
    slug: brandNonEmpty(slugText, 'Slug'),
    sourceRefs: facts.sourceRefs,
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
  return value.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240)
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = normalizePublicText(value)
  return normalized.length === 0 ? undefined : normalized
}

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function normalizeIdentityText(value: string): string {
  return normalizePublicText(value).toLowerCase()
}
