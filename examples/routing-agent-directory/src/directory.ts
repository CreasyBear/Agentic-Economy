import { Buffer } from 'node:buffer'

const directoryPath = '/.well-known/http-message-signatures-directory'

export function handleDirectoryRequest(request: Request, encodedPublicJwk: string): Response {
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.pathname !== directoryPath) {
    return Response.json({ error: 'not_found' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  try {
    const key = JSON.parse(decodeBase64Url(encodedPublicJwk)) as unknown
    if (!isPublishedKey(key)) throw new Error('key_invalid')
    return Response.json({ keys: [key] }, {
      headers: { 'Cache-Control': 'public, max-age=60, must-revalidate' },
    })
  } catch {
    console.error(JSON.stringify({ event: 'agent_directory_unavailable' }))
    return Response.json({ error: 'directory_unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function isPublishedKey(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const key = value as Record<string, unknown>
  return key.kty === 'OKP' && key.crv === 'Ed25519' && typeof key.x === 'string' && typeof key.kid === 'string'
}
