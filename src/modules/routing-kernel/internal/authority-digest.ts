import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export function canonicalAuthorityDigest(value: StableHashValue): string {
  return canonicalDigest(value)
}

export function isCanonicalAuthorityDigest(value: string): boolean {
  return isCanonicalDigest(value)
}
