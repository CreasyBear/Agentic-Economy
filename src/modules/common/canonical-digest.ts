import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { brandNonEmpty } from '@/modules/common/ids'
import type { SourceHash } from '@/modules/common/ids'
import { stableStringify } from '@/modules/common/stable-hash'

const encoder = new TextEncoder()

/** Canonical JSON digest boundary. Invalid non-JSON values are rejected before hashing. */
export function canonicalDigest(value: unknown): SourceHash {
  if (!isBoundedJsonValue(value)) {
    throw new Error('canonical_digest_value_invalid')
  }
  return brandNonEmpty(`sha256:${bytesToHex(sha256(encoder.encode(stableStringify(value))))}`, 'SourceHash')
}

export function isCanonicalDigest(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(value)
}
