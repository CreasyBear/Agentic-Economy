import { describe, expect, it, vi } from 'vitest'

import { handleProviderConnectionCleanupRequest } from '@/routes/api.internal.provider-connection-cleanup'

const token = 'p'.repeat(43)
const body = {
  connectionRef: 'connection:mcp',
  adapterId: 'mcp-jsonrpc:v1',
  requestDigest: `sha256:${'a'.repeat(64)}`,
  secret: {
    secretRef: 'sec_00000000000040008000000000000063',
    activeGeneration: 'sgn_00000000000040008000000000000063',
    pointerRevision: 3,
  },
}

function request(authorization = `Bearer ${token}`) {
  return new Request('https://ae.example/api/internal/provider-connection-cleanup', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Provider connection cleanup route', () => {
  it('reads the exact secret generation and returns only the redacted OAuth outcome', async () => {
    const material = new TextEncoder().encode('oauth-secret-never-returned')
    const readSecret = vi.fn().mockResolvedValue(material)
    const revoke = vi.fn().mockResolvedValue({
      outcome: 'revoked',
      reasonCode: 'oauth_revoked',
      responseDigest: `sha256:${'b'.repeat(64)}`,
      evidenceRefs: ['provider_cleanup:oauth_revoked'],
    })

    const response = await handleProviderConnectionCleanupRequest(request(), {
      AE_CONVEX_SERVER_FUNCTION_TOKEN: token,
    }, { readSecret, revoke })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const responseBody = await response.json()
    expect(responseBody).toEqual({
      outcome: 'revoked',
      reasonCode: 'oauth_revoked',
      responseDigest: `sha256:${'b'.repeat(64)}`,
      evidenceRefs: ['provider_cleanup:oauth_revoked'],
    })
    expect(readSecret).toHaveBeenCalledWith(body.secret)
    expect(revoke).toHaveBeenCalledWith(material)
    expect(JSON.stringify(responseBody)).not.toContain('oauth-secret')
  })

  it('rejects unauthenticated and malformed cleanup requests before secret access', async () => {
    const readSecret = vi.fn()
    const revoke = vi.fn()
    const environment = { AE_CONVEX_SERVER_FUNCTION_TOKEN: token }

    await expect(handleProviderConnectionCleanupRequest(request('Bearer wrong'), environment, {
      readSecret,
      revoke,
    }).then((response) => response.status)).resolves.toBe(401)
    await expect(handleProviderConnectionCleanupRequest(new Request(
      'https://ae.example/api/internal/provider-connection-cleanup',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, token: 'forbidden' }),
      },
    ), environment, { readSecret, revoke }).then((response) => response.status)).resolves.toBe(400)
    expect(readSecret).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })
})
