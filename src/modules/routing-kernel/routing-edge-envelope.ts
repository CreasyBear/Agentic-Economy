const EDGE_ENVELOPE_MAX_AGE_MS = 30_000

export type RoutingEdgeEnvelopeInput = Readonly<{
  key: string
  method: string
  path: string
  authority: string
  contentDigest: string
  requestId: string
  timestamp: number
}>

export async function createRoutingEdgeEnvelope(input: RoutingEdgeEnvelopeInput): Promise<Readonly<{
  authority: string
  requestId: string
  timestamp: number
  signature: string
}>> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(input.key, ['sign']), new TextEncoder().encode(envelopeMaterial(input)))
  return { authority: input.authority, requestId: input.requestId, timestamp: input.timestamp, signature: toBase64Url(new Uint8Array(signature)) }
}

export async function verifyRoutingEdgeEnvelope(
  request: Request,
  options: Readonly<{ key: string; now?: number; requiredAuthority?: string }>,
): Promise<Readonly<{ kind: 'verified'; publicUrl: string; requestId: string }> | Readonly<{ kind: 'refused'; reason: string }>> {
  const authority = request.headers.get('X-AE-Edge-Authority')?.trim()
  const requestId = request.headers.get('X-AE-Edge-Request-Id')?.trim()
  const timestampText = request.headers.get('X-AE-Edge-Timestamp')?.trim()
  const signatureText = request.headers.get('X-AE-Edge-Signature')?.trim()
  if (authority === undefined || requestId === undefined || timestampText === undefined || signatureText === undefined
    || authority.length === 0 || requestId.length === 0) return { kind: 'refused', reason: 'edge_envelope_missing' }

  const timestamp = Number(timestampText)
  const now = options.now ?? Date.now()
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > EDGE_ENVELOPE_MAX_AGE_MS) return { kind: 'refused', reason: 'edge_envelope_stale' }
  if (!validAuthority(authority) || (options.requiredAuthority !== undefined && authority !== options.requiredAuthority)) {
    return { kind: 'refused', reason: 'edge_authority_mismatch' }
  }

  const signature = fromBase64Url(signatureText)
  if (signature === undefined) return { kind: 'refused', reason: 'edge_signature_invalid' }
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(options.key, ['verify']), new Uint8Array(signature).buffer, new TextEncoder().encode(envelopeMaterial({
    method: request.method,
    path: new URL(request.url).pathname,
    authority,
    contentDigest: request.headers.get('Content-Digest') ?? '',
    requestId,
    timestamp,
  })))
  if (!valid) return { kind: 'refused', reason: 'edge_signature_invalid' }
  return { kind: 'verified', publicUrl: `https://${authority}${new URL(request.url).pathname}`, requestId }
}

async function hmacKey(value: string, usages: Array<'sign' | 'verify'>): Promise<CryptoKey> {
  return await crypto.subtle.importKey('raw', new TextEncoder().encode(value), { name: 'HMAC', hash: 'SHA-256' }, false, usages)
}

function envelopeMaterial(input: Omit<RoutingEdgeEnvelopeInput, 'key'>): string {
  return [input.method, input.path, input.authority, input.contentDigest, input.requestId, String(input.timestamp)].join('\n')
}

function validAuthority(value: string): boolean {
  try {
    const url = new URL(`https://${value}`)
    return url.host === value && url.pathname === '/' && url.username === '' && url.password === ''
  } catch { return false }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch { return undefined }
}
