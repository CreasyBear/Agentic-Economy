import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { isBoundedJsonValue } from '@/modules/common/bounded-json'
import { brandNonEmpty } from '@/modules/common/ids'
import type { SourceHash } from '@/modules/common/ids'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { stableStringify } from '@/modules/common/stable-hash'

const encoder = new TextEncoder()

function digestStableString(value: string): SourceHash {
  const digest = sha256(encoder.encode(value))
  const encoded = bytesToHex(digest)
  return brandNonEmpty(`sha256:${encoded}`, 'SourceHash')
}

/** Canonical JSON digest boundary. Invalid non-JSON values are rejected before hashing. */
export function canonicalDigest(value: unknown): SourceHash {
  if (!isBoundedJsonValue(value)) {
    throw new Error('canonical_digest_value_invalid')
  }
  return digestStableString(stableStringify(value))
}

/** Hash a stable JSON schema descriptor without applying capability-value bounds. */
export function schemaDescriptorDigest(value: StableHashValue): SourceHash {
  return digestStableString(stableStringify(value))
}

export function isCanonicalDigest(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(value)
}
