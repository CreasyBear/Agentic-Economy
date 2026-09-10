import { afterEach, describe, expect, it } from 'vitest'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { validateJsonSchema } from '@/modules/capability-contract/public'
import { handleSandboxReferenceRequest, Route } from '@/routes/api.v1.sandbox-reference'

// Mirrors the seeded `sandbox-aecon-reference` Tool's output schema
// (SANDBOX_REFERENCE_TOOL_SPEC.outputSchema in convex/devSeed.ts).
const SANDBOX_REFERENCE_OUTPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { result: { type: 'string' } },
  required: ['result'],
  additionalProperties: false,
}

function postRequest(body: unknown): Request {
  return new Request('http://ae.test/api/v1/sandbox-reference', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('sandbox-reference route', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
  })

  it('returns a deterministic result for an empty body', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const response = await handleSandboxReferenceRequest(postRequest({}))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body = await response.json()
    expect(validateJsonSchema(SANDBOX_REFERENCE_OUTPUT_SCHEMA, body)).toBe(true)
    expect(body.result).toMatch(/^sandbox-reference:[0-9a-f]{16}$/)
  })

  it('returns the same deterministic result for the same request across two calls', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const first = await handleSandboxReferenceRequest(postRequest({ request: 'abc' }))
    const second = await handleSandboxReferenceRequest(postRequest({ request: 'abc' }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstBody = await first.json()
    const secondBody = await second.json()
    expect(validateJsonSchema(SANDBOX_REFERENCE_OUTPUT_SCHEMA, firstBody)).toBe(true)
    expect(firstBody).toEqual(secondBody)
  })

  it('returns a different result for a different request body', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const abc = await handleSandboxReferenceRequest(postRequest({ request: 'abc' }))
    const xyz = await handleSandboxReferenceRequest(postRequest({ request: 'xyz' }))

    const abcBody = await abc.json()
    const xyzBody = await xyz.json()
    expect(abcBody.result).not.toBe(xyzBody.result)
  })

  it('rejects invalid JSON with a 400 problem response', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const response = await handleSandboxReferenceRequest(
      new Request('http://ae.test/api/v1/sandbox-reference', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      }),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    const body = await response.json()
    expect(body.status).toBe(400)
  })

  it('rejects an unrecognized body shape with a 400 problem response', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const response = await handleSandboxReferenceRequest(postRequest({ request: 42 }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.status).toBe(400)
  })

  it('rejects GET with a 405 problem response', async () => {
    const handlers = Route.options.server?.handlers as { GET: () => Response | Promise<Response> }
    const response = await handlers.GET()

    expect(response.status).toBe(405)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(response.headers.get('allow')).toBe('POST')
  })
})
