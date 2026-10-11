import { describe, expect, it, vi } from 'vitest'

import { handleProviderConsequenceRequest } from '@/routes/api.internal.provider-consequence'

const TOKEN = 't'.repeat(43)
const env = { AE_SECRET_LIFECYCLE_RPC_TOKEN: TOKEN }

function request(authorization?: string) {
  const req = new Request('https://agentic-economy.example/api/internal/provider-consequence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: '{}',
  })
  return { req, text: vi.spyOn(req, 'text'), json: vi.spyOn(req, 'json') }
}

describe('provider consequence channel authentication', () => {
  it.each([
    ['missing token', undefined],
    ['wrong token', `Bearer ${'x'.repeat(43)}`],
    ['malformed token', 'Bearer short'],
  ])('rejects %s with 401 without reading the body', async (_name, authorization) => {
    const { req, text, json } = request(authorization)
    const response = await handleProviderConsequenceRequest(req, env)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ kind: 'unavailable' })
    expect(text).not.toHaveBeenCalled()
    expect(json).not.toHaveBeenCalled()
    expect(req.bodyUsed).toBe(false)
  })

  it('rejects when the channel token is not configured', async () => {
    const { req } = request(`Bearer ${TOKEN}`)
    expect((await handleProviderConsequenceRequest(req, {})).status).toBe(401)
  })

  it('proceeds to body parsing with the correct token', async () => {
    const { req, text } = request(`Bearer ${TOKEN}`)
    const response = await handleProviderConsequenceRequest(req, env)
    expect(response.status).toBe(400)
    expect(text).toHaveBeenCalled()
  })
})
