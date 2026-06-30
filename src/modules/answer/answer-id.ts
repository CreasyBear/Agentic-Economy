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

const MAX_QUERY_LENGTH = 200

export function encodeAnswerId(query: string): string {
  const trimmed = query.slice(0, MAX_QUERY_LENGTH).trim()
  const bytes = new TextEncoder().encode(trimmed)
  return bytesToBase64Url(bytes)
}

export function decodeAnswerId(id: string): string {
  if (id.length === 0) return ''
  try {
    const bytes = base64UrlToBytes(id)
    const query = new TextDecoder().decode(bytes).slice(0, MAX_QUERY_LENGTH).trim()
    return query
  } catch {
    return ''
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(`${padded}${pad}`)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
