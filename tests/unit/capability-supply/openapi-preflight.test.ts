import { describe, expect, it } from 'vitest'

import { prepareHttpJsonRequest } from '@/modules/capability-supply/route-transport-runtime'
import {
  preflightOpenApiHttpDocument,
  type OpenApiOperationPreflightOutcome,
} from '@/modules/capability-supply/public'
const outputSchema = {
  type: 'object',
  properties: { result: { type: 'string' } },
  required: ['result'],
  additionalProperties: false,
} as const

function response() {
  return { '200': { content: { 'application/json': { schema: outputSchema } } } }
}

function mixedOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: { title: 'Reference Operations', version: '1.0.0' },
    servers: [{ url: 'https://api.example.test' }],
    components: {
      securitySchemes: {
        ProviderKey: { type: 'apiKey', in: 'header', name: 'X-Provider-Key' },
        CookieKey: { type: 'apiKey', in: 'cookie', name: 'session' },
      },
    },
    paths: {
      '/pets/{petId}': {
        parameters: [{
          in: 'path', name: 'petId', required: true,
          schema: { type: 'string', minLength: 1 },
        }],
        get: { responses: response() },
      },
      '/rates': {
        get: {
          parameters: [{
            in: 'query', name: 'symbols', required: false,
            style: 'form', explode: true,
            schema: { type: 'array', items: { type: 'string' } },
          }],
          responses: response(),
        },
      },
      '/lookup': {
        post: {
          requestBody: {
            required: true,
            content: { 'application/json': {
              schema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
                additionalProperties: false,
              },
            } },
          },
          responses: response(),
        },
      },
      '/private': {
        get: { security: [{ ProviderKey: [] }], responses: response() },
      },
      '/cookie-auth': {
        get: { security: [{ CookieKey: [] }], responses: response() },
      },
      '/unsupported': {
        get: {
          parameters: [{ in: 'cookie', name: 'session', schema: { type: 'string' } }],
          responses: response(),
        },
      },
      '/put': {
        put: { responses: response() },
      },
    },
  }
}

describe('OpenAPI document preflight', () => {
  it('returns bounded per-operation outcomes for path, optional array query, JSON POST, credentials, and unsupported shapes', async () => {
    const result = await preflightOpenApiHttpDocument(mixedOpenApiDocument())

    expect(result.kind).toBe('preflighted')
    if (result.kind !== 'preflighted') return
    expect(result.truncated).toBe(false)
    expect(result.outcomes).toEqual(expect.arrayContaining([
      { selector: { path: '/pets/{petId}', method: 'get' }, kind: 'executable' },
      { selector: { path: '/rates', method: 'get' }, kind: 'executable' },
      { selector: { path: '/lookup', method: 'post' }, kind: 'executable' },
      {
        selector: { path: '/private', method: 'get' },
        kind: 'credential_required',
        credential: { kind: 'api_key', location: 'header', name: 'X-Provider-Key' },
      },
      {
        selector: { path: '/cookie-auth', method: 'get' },
        kind: 'unsafe', reason: 'transport_unsupported',
      },
      {
        selector: { path: '/put', method: 'put' },
        kind: 'unsupported_shape',
        reason: 'openapi_operation_unsupported',
      },
    ] satisfies readonly OpenApiOperationPreflightOutcome[]))
  })

  it('marks every operation unsafe when the document server is not public HTTPS', async () => {
    const document = mixedOpenApiDocument()
    document.servers = [{ url: 'http://127.0.0.1:8080' }]
    const result = await preflightOpenApiHttpDocument(document)

    expect(result.kind).toBe('preflighted')
    if (result.kind !== 'preflighted') return
    expect(result.outcomes).toHaveLength(7)
    expect(result.outcomes.every((outcome) => outcome.kind === 'unsafe')).toBe(true)
    expect(result.outcomes.every((outcome) => outcome.kind === 'unsafe' && outcome.reason === 'transport_unsupported')).toBe(true)
  })
  it('serializes a path value and optional exploded array query through the guarded adapter', () => {
    const prepared = prepareHttpJsonRequest(new URL('https://api.example.test/pets/{petId}'), {
      method: 'GET',
      path: [{ inputPointer: '/petId', parameter: 'petId', required: true, style: 'simple', explode: false }],
      query: [{ inputPointer: '/symbols', parameter: 'symbols', required: false, style: 'form', explode: true }],
      requestTimeoutMs: 5_000,
    }, JSON.stringify({ petId: 'pet-42', symbols: ['USD', 'AUD'] }))

    expect(prepared).toMatchObject({ kind: 'prepared' })
    if (prepared.kind !== 'prepared') return
    expect(prepared.target.toString()).toBe('https://api.example.test/pets/pet-42?symbols=USD&symbols=AUD')
  })

  it('refuses a missing required path value before any request can be sent', () => {
    const prepared = prepareHttpJsonRequest(new URL('https://api.example.test/pets/{petId}'), {
      method: 'GET',
      path: [{ inputPointer: '/petId', parameter: 'petId', required: true, style: 'simple', explode: false }],
      requestTimeoutMs: 5_000,
    }, '{}')

    expect(prepared).toEqual({ kind: 'refused', failureCode: 'input_required' })
  })
})
