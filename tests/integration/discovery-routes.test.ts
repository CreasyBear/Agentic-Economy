import { describe, expect, it } from 'vitest'

import { handleUcpManifestRequest } from '@/routes/$slug.ucp'

describe('discovery route handlers', () => {
  it('serves the AE-hosted UCP fallback manifest with route-safe headers', async () => {
    const response = handleUcpManifestRequest(
      new Request('https://ae.example/parramatta-emergency-plumbing/ucp'),
      'parramatta-emergency-plumbing'
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(body).toMatchObject({
      schemaVersion: 'ae-ucp-fallback:v1',
      slug: 'parramatta-emergency-plumbing',
      manifestUrl: 'https://ae.example/parramatta-emergency-plumbing/ucp',
      pathKind: 'ae_hosted_fallback',
      status: 'available',
      unsupportedCapabilities: {
        callable: false,
        paymentRequired: false,
      },
      services: [
        {
          slug: 'emergency-pipe-repair',
          status: 'published',
          capabilities: [
            {
              callable: false,
              paymentRequired: false,
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(body)).not.toMatch(/rawContact|ownerId|clerk|private:evidence/)
  })

  it('returns an explicit not-found shape for absent or non-public slugs', async () => {
    const response = handleUcpManifestRequest(
      new Request('https://ae.example/missing-business/ucp'),
      'missing-business'
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toEqual({
      kind: 'not_found',
      code: 'discovery_manifest_not_found',
      reason: 'No public discovery manifest exists for this slug.',
    })
  })
})
