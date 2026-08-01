/**
 * Shareable answer id codec.
 *
 * The Phase-1 answer is a deterministic function of the query, so the shareable
 * id is the query itself, base64url-encoded - no persistence needed. The answer
 * Shareable answer links use `/?q=` on the primary chat shell (`/`). The
 * base64url codec remains for legacy `/q/$answerId` redirects only.
 *
 * Unicode-safe via TextEncoder/TextDecoder (atob/btoa are not UTF-8 safe).
 */

import { base64Codec } from '@/modules/common/base64-codec'

const MAX_QUERY_LENGTH = 200

export function encodeAnswerId(query: string): string {
  const trimmed = query.slice(0, MAX_QUERY_LENGTH).trim()
  const bytes = new TextEncoder().encode(trimmed)
  return base64Codec.toBase64Url(bytes)
}

export function decodeAnswerId(id: string): string {
  if (id.length === 0) return ''
  try {
    const bytes = base64Codec.fromBase64Url(id)
    const query = new TextDecoder().decode(bytes).slice(0, MAX_QUERY_LENGTH).trim()
    return query
  } catch {
    return ''
  }
}

