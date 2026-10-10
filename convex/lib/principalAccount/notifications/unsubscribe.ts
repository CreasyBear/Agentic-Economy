/** Only controllable streams can be unsubscribed. Required (transactional) and operator mail never carries a token. */
export const UNSUBSCRIBABLE_STREAMS = ['alert', 'lifecycle'] as const
export type UnsubscribeStream = (typeof UNSUBSCRIBABLE_STREAMS)[number]

export type UnsubscribePayload = Readonly<{
  principalRef: string
  accountRef: string
  stream: UnsubscribeStream
}>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const hmacKey = (secret: string) => crypto.subtle.importKey(
  'raw',
  encoder.encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
)

/** Token is `base64url(json payload).base64url(HMAC-SHA256 of the payload segment)`. The address never appears in it. */
export async function signUnsubscribeToken(secret: string, payload: UnsubscribePayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify({
    principalRef: payload.principalRef,
    accountRef: payload.accountRef,
    stream: payload.stream,
  })))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body))
  return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

/** `crypto.subtle.verify` compares in constant time. Any malformed input returns null rather than throwing. */
export async function verifyUnsubscribeToken(secret: string, token: string): Promise<UnsubscribePayload | null> {
  const [body, signature, extra] = token.split('.')
  if (body === undefined || body.length === 0 || signature === undefined || extra !== undefined) return null
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(signature), encoder.encode(body))
    if (!valid) return null
    const parsed: unknown = JSON.parse(decoder.decode(fromBase64Url(body)))
    if (typeof parsed !== 'object' || parsed === null) return null
    const { principalRef, accountRef, stream } = parsed as Record<string, unknown>
    if (typeof principalRef !== 'string' || typeof accountRef !== 'string') return null
    if (!UNSUBSCRIBABLE_STREAMS.some((allowed) => allowed === stream)) return null
    return { principalRef, accountRef, stream: stream as UnsubscribeStream }
  } catch {
    return null
  }
}

/** One-click unsubscribe URL for a controllable stream. Null when this deployment cannot sign one, so the caller skips the send. */
export async function unsubscribeUrlFor(payload: UnsubscribePayload): Promise<string | null> {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()
  const convexSiteUrl = process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/u, '')
  if (!secret || !convexSiteUrl) return null
  return `${convexSiteUrl}/notifications/unsubscribe?t=${encodeURIComponent(await signUnsubscribeToken(secret, payload))}`
}
