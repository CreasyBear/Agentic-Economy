import { describe, expect, it, vi } from 'vitest'

import { runCapabilityReadinessProbe } from '@/modules/capability-supply/internal/readiness-probe'

import { keylessAuthority, target } from './readiness-probe-harness'

describe('capability readiness probe', () => {
  it('uses the declared read-only GET with fixed query parameters for imported HTTP descriptions', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('GET')
      expect(request.url).toBe('https://provider.example.test/capability?providers=ECB')
      expect(request.headers.get('Authorization')).toBe('Bearer test-secret')
      return Response.json({ rates: { USD: 1.08 } })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      probeQuery: [{ parameter: 'providers', value: 'ECB' }],
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'providers', value: 'ECB' }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'bearer' },
      }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { rates: { type: 'object' } },
        required: ['rates'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => 'test-secret', validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result.outcome).toBe('healthy')
  })
  it('requires the imported response status before media and body validation', async () => {
    const openApiTarget = {
      ...target,
      authority: keylessAuthority,
      probeMethod: 'GET' as const,
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'probe', value: 'readiness' }],
        requestTimeoutMs: 5_000,
        responseStatus: 201,
        responseContentType: 'application/json',
        credential: { kind: 'none' },
      }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { rates: { type: 'object' } },
        required: ['rates'],
        additionalProperties: false,
      }),
    }
    const body = JSON.stringify({ rates: { USD: 1.08 } })
    const wrongStatus = await runCapabilityReadinessProbe(openApiTarget, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json-invalid' },
      }),
      now: () => 10_000,
    })
    expect(wrongStatus).toMatchObject({
      outcome: 'response_invalid',
      responseStatus: 200,
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:response_status_invalid'],
    })

    const accepted = await runCapabilityReadinessProbe(openApiTarget, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(body, {
        status: 201,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
      now: () => 10_000,
    })
    expect(accepted).toMatchObject({ outcome: 'healthy', responseStatus: 201 })

    const wrongMedia = await runCapabilityReadinessProbe(openApiTarget, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(body, {
        status: 201,
        headers: { 'Content-Type': 'application/json-invalid' },
      }),
      now: () => 10_000,
    })
    expect(wrongMedia).toMatchObject({
      outcome: 'response_content_type_invalid',
      responseStatus: 201,
    })
  })
  it('sends the validated OpenAPI POST input example as a JSON body', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('POST')
      expect(request.url).toBe('https://provider.example.test/capability')
      expect(request.headers.get('Content-Type')).toContain('application/json')
      await expect(request.json()).resolves.toEqual({ query: 'hello' })
      return Response.json({ result: 'world' })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      probeMethod: 'POST',
      transportConfigJson: JSON.stringify({
        method: 'POST',
        requestContentType: 'application/json',
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      outcome: 'healthy',
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: 310_000,
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:http_2xx'],
    })
    expect(send).toHaveBeenCalledOnce()
  })
  it('sends no JSON body when probing a POST with query mappings only', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('POST')
      expect(request.url).toBe('https://provider.example.test/capability?query=hello')
      await expect(request.text()).resolves.toBe('')
      return Response.json({ result: 'world' })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'http-json:v1',
      probeMethod: 'POST',
      transportConfigJson: JSON.stringify({
        method: 'POST',
        query: [{ inputPointer: '/query', parameter: 'query', required: true, style: 'form', explode: true }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result.outcome).toBe('healthy')
    expect(send).toHaveBeenCalledOnce()
  })


  it('omits absent optional query inputs while probing the same request shape as execution', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://provider.example.test/capability?ids=bitcoin')
      return Response.json({ ok: true })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'http-json:v1',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        query: [
          { inputPointer: '/ids', parameter: 'ids', required: true, style: 'form', explode: false },
          { inputPointer: '/include_24hr_change', parameter: 'include_24hr_change', required: false, style: 'form', explode: true },
        ],
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ ids: 'bitcoin' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result.outcome).toBe('healthy')
    expect(send).toHaveBeenCalledOnce()
  })
  it('refuses an absent required query input before readiness fetch', async () => {
    const send = vi.fn<(request: Request) => Promise<Response>>()
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'http-json:v1',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        query: [{ inputPointer: '/ids', parameter: 'ids', required: true, style: 'form', explode: false }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({}),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result.outcome).toBe('response_invalid')
    expect(result.evidenceRefs).toContain('probe:request_unrepresentable')
    expect(send).not.toHaveBeenCalled()
  })
  it('refuses an OpenAPI POST response that violates the admitted output schema', async () => {
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      probeMethod: 'POST',
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => Response.json({ result: 42 }),
      now: () => 10_000,
    })
    expect(result.outcome).toBe('response_invalid')
    expect(result.evidenceRefs).toContain('probe:response_invalid')
  })
})
