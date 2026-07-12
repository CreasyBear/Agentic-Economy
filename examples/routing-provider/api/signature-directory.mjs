export default function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).setHeader('Allow', 'GET').end()
  const encoded = process.env.AGENT_PUBLIC_JWK_BASE64URL
  if (typeof encoded !== 'string' || encoded.length === 0) return response.status(503).json({ error: 'directory_unavailable' })
  try {
    const key = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (key?.kty !== 'OKP' || key?.crv !== 'Ed25519' || typeof key?.x !== 'string' || typeof key?.kid !== 'string') {
      throw new Error('invalid_public_key')
    }
    response.setHeader('Cache-Control', 'public, max-age=30, must-revalidate')
    return response.status(200).json({ keys: [key] })
  } catch {
    return response.status(503).json({ error: 'directory_unavailable' })
  }
}
