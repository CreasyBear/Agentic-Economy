import { describe, expect, it, vi } from 'vitest'

import { handleDirectoryRequest } from '../../examples/routing-agent-directory/src/directory'

const publicJwk = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'test-public-key-material',
  kid: 'test-key-id',
}

describe('routing agent signature directory', () => {
  it('publishes one addressable public key only at the standard directory path', async () => {
    const response = handleDirectoryRequest(
      new Request('https://agent.example/.well-known/http-message-signatures-directory'),
      encoded(publicJwk),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, must-revalidate')
    await expect(response.json()).resolves.toEqual({ keys: [publicJwk] })
    expect(handleDirectoryRequest(new Request('https://agent.example/other'), encoded(publicJwk))).toMatchObject({ status: 404 })
  })

  it('fails closed without publishing malformed key material or cacheable errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = handleDirectoryRequest(
      new Request('https://agent.example/.well-known/http-message-signatures-directory'),
      'not-json',
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'directory_unavailable' })
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'agent_directory_unavailable' }))
    log.mockRestore()
  })
})

function encoded(key: Readonly<Record<string, string>>): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url')
}
