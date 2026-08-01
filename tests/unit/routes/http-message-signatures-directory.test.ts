import { afterEach, describe, expect, it } from 'vitest'

import { handleHttpMessageSignaturesDirectory } from '@/routes/[.]well-known/http-message-signatures-directory'

/**
 * Replaces the key-publication coverage that lived in the deleted
 * `examples/routing-agent-directory` worker test. The worker's contract is gone;
 * this asserts the surviving contract on live source, including the invariant
 * that matters most — private key material never leaves the public directory.
 */
const PUBLIC_JWK = { kty: 'OKP', crv: 'Ed25519', x: 'ae-public-key-material', kid: 'ae-1' } as const

function directoryResponse(value: string | undefined): Response {
  if (value === undefined) delete process.env.AE_WBA_DIRECTORY_PUBLIC_JWK_JSON
  else process.env.AE_WBA_DIRECTORY_PUBLIC_JWK_JSON = value
  return handleHttpMessageSignaturesDirectory()
}

afterEach(() => {
  delete process.env.AE_WBA_DIRECTORY_PUBLIC_JWK_JSON
})

describe('web bot auth key directory', () => {
  it('serves a configured key set under the signature-directory media type', async () => {
    const response = directoryResponse(JSON.stringify({ keys: [PUBLIC_JWK] }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/http-message-signatures-directory+json')
    expect(await response.json()).toEqual({ keys: [PUBLIC_JWK] })
  })

  it('accepts a bare JWK and a JWK array as well as a key set', async () => {
    expect(await directoryResponse(JSON.stringify(PUBLIC_JWK)).json()).toEqual({ keys: [PUBLIC_JWK] })
    expect(await directoryResponse(JSON.stringify([PUBLIC_JWK])).json()).toEqual({ keys: [PUBLIC_JWK] })
  })

  it('never publishes private key material', async () => {
    const response = directoryResponse(JSON.stringify({ keys: [{ ...PUBLIC_JWK, d: 'private-scalar' }] }))

    expect(response.status).toBe(404)
    expect(JSON.stringify(await response.json())).not.toContain('private-scalar')
  })

  it('fails closed when unconfigured, blank, malformed, or shaped wrong', async () => {
    const rejected = [undefined, '', '   ', 'not-json', '{}', JSON.stringify({ keys: [] }), JSON.stringify({ kty: 'OKP' })]

    for (const value of rejected) {
      const response = directoryResponse(value)

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ kind: 'error', code: 'wba_directory_unconfigured' })
    }
  })
})
