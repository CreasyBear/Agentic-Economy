import { brandNonEmpty } from '@/modules/common/ids'
import type { OwnerId, Slug } from '@/modules/common/ids'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import type {
  ClaimFingerprintInput,
  ClaimFingerprintRecord,
  CsrfCheckInput,
  CsrfDecision,
  DuplicateClaimDecision,
} from '@/modules/security/public'

export function assertCsrf(input: CsrfCheckInput): CsrfDecision {
  if (
    input.csrfToken !== undefined &&
    input.csrfCookie !== undefined &&
    input.csrfToken.length > 0 &&
    input.csrfToken === input.csrfCookie
  ) {
    return { kind: 'accepted', mode: 'csrf_token' }
  }

  if (input.origin !== undefined) {
    return input.allowedOrigins.includes(input.origin)
      ? { kind: 'accepted', mode: 'same_site_origin' }
      : { kind: 'rejected', reason: 'foreign_origin' }
  }

  return { kind: 'rejected', reason: 'missing_csrf' }
}


export function allocateDeterministicSlug(requestedSlug: string, existingSlugs: readonly Slug[]): Slug {
  const baseSlug = normalizeSlug(requestedSlug)
  const slugRoot = baseSlug.length === 0 ? 'business' : baseSlug
  const existing = new Set<string>(existingSlugs)

  if (!existing.has(slugRoot)) {
    return brandNonEmpty(slugRoot, 'Slug')
  }

  let suffix = 2
  while (existing.has(`${slugRoot}-${suffix}`)) {
    suffix += 1
  }

  return brandNonEmpty(`${slugRoot}-${suffix}`, 'Slug')
}

export function detectDuplicateClaim(
  records: readonly ClaimFingerprintRecord[],
  input: ClaimFingerprintInput,
  ownerId: OwnerId
): DuplicateClaimDecision {
  const fingerprint = normalizeClaimFingerprint(input)
  const existing = records.find((record) => record.fingerprint === fingerprint)

  if (existing === undefined) {
    return { kind: 'clear', fingerprint }
  }

  if (existing.ownerId === ownerId) {
    return existing.claimId === undefined
      ? { kind: 'same_owner_conflict', fingerprint }
      : { kind: 'same_owner_conflict', fingerprint, claimId: existing.claimId }
  }

  return {
    kind: 'pending_review',
    fingerprint,
    publicReason: 'duplicate_or_impersonation_review',
  }
}

export function normalizeClaimFingerprint(input: ClaimFingerprintInput): string {
  return [input.name, input.category, input.suburb, input.stateTerritory].map(normalizeFingerprintPart).join('|')
}

function normalizeFingerprintPart(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

