import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

const encoder = new TextEncoder()

export function canonicalAuthorityDigest(value: StableHashValue): string {
  return `sha256:${bytesToHex(sha256(encoder.encode(stableStringify(value))))}`
}

export function isCanonicalAuthorityDigest(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(value)
}
