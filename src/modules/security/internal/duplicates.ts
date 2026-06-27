import { brandNonEmpty } from '@/modules/common/ids'
import type { OwnerId, Slug } from '@/modules/common/ids'
import type {
  ClaimFingerprintInput,
  ClaimFingerprintRecord,
  DuplicateClaimDecision,
} from '@/modules/security/public'

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

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}
