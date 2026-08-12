import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export function signRouteTransportCall(
  material: StableHashValue,
  key: Readonly<{ keyId: string; secret: string }>,
): Readonly<{ keyId: string; signature: string }> | undefined {
  if (key.keyId.trim().length < 1 || key.keyId.length > 200 || key.secret.length < 32) return undefined
  const digest = canonicalDigest(material)
  return {
    keyId: key.keyId,
    signature: `hmac-sha256:${bytesToHex(hmac(sha256, key.secret, digest))}`,
  }
}
