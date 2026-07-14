import { createHmac } from 'node:crypto'

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
    signature: `hmac-sha256:${createHmac('sha256', key.secret).update(digest).digest('hex')}`,
  }
}
