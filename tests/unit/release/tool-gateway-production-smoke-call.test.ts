import {
  amount,
  committedQuote,
  completed,
  serviceFetch,
  tool,
  toolRef,
} from './tool-gateway-production-smoke-harness'
import { describe, expect, it, vi } from 'vitest'

import { callInputSchema } from '../../../src/modules/capability-execution/call-contracts'
import { toolChoiceDescribeOutputSchema } from '../../../src/modules/registry/tool-choice-contracts'
import {
  createHostedOwnerRuntime,
  parseGatewayMcpCallResponse,
} from '../../../tools/release/tool-gateway-production-smoke-hosted-owner'

import {
  assertGatewayCallReplayParity,
  callGatewayTool,
  parseGatewayCallResponse,
  pollGatewayCall,
  readGatewayCallStatus,
} from '../../../tools/release/tool-gateway-production-smoke'

const callRef = 'invocation:provider:1'

function config(fetch: typeof globalThis.fetch, overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: 'https://gateway.example',
    apiKey: 'run-key',
    input: { city: 'Perth' },
    fetch,
    ...overrides,
  }
}

describe('hosted Tool gateway smoke call', () => {
  it('posts the current Tool Call contract with the exact input and idempotency key', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const quote = committedQuote()
    const fetchMock: typeof globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init })
      if (String(input).endsWith('/api/v1/tools/quote'))
        return Response.json(quote)
      return Response.json({
        kind: 'pending',
        callRef,
        toolRef,
        retryAfterMs: 250,
      })
    }

    await expect(callGatewayTool(config(fetchMock), tool, quote, 'run:key1')).resolves.toEqual({
      kind: 'pending',
      callRef,
      toolRef,
      retryAfterMs: 250,
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://gateway.example/api/v1/tools/call')
    expect(requests[0]?.init?.method).toBe('POST')
    expect(new Headers(requests[0]?.init?.headers).get('authorization')).toBe('Bearer run-key')
    const body = JSON.parse(String(requests[0]?.init?.body))
    expect(body).toEqual({
      quoteRef: quote.quoteRef,
      idempotencyKey: 'run:key1',
    })
    expect(callInputSchema.safeParse(body).success).toBe(true)
  })

  it('unwraps the official MCP result envelope and refuses MCP errors', () => {
    const value = parseGatewayMcpCallResponse({
      status: 200,
      body: {
        jsonrpc: '2.0',
        id: 'run:key',
        result: {
          content: [{ type: 'text', text: JSON.stringify(completed(callRef)) }],
          structuredContent: { result: completed(callRef) },
        },
      },
    }, toolRef)
    expect(value).toEqual(completed(callRef))
    expect(parseGatewayMcpCallResponse({
      status: 200,
      body: {
        jsonrpc: '2.0',
        id: 'run:key',
        result: {
          isError: true,
          content: [{ type: 'text', text: 'failure' }],
          structuredContent: { code: 'authority_denied', retryable: false },
        },
      },
    }, toolRef)).toMatchObject({
      kind: 'unknown',
      code: 'authority_denied',
      retryable: false,
    })
    expect(parseGatewayMcpCallResponse({
      status: 200,
      body: {
        jsonrpc: '2.0',
        id: 'run:key',
        result: {
          content: [{ type: 'text', text: JSON.stringify(completed(callRef)) }],
        },
      },
    }, toolRef)).toMatchObject({
      kind: 'unknown',
      code: 'malformed_mcp_result',
      status: 200,
      retryable: false,
    })
  })

  it('reads a withdrawn Tool through the hosted public v3 describe contract', async () => {
    const requests: Array<{ url: string; method: string | undefined; body: unknown }> = []
    const fetchMock: typeof globalThis.fetch = async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method,
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      })
      return Response.json(toolChoiceDescribeOutputSchema.parse({
        kind: 'unavailable',
        schemaVersion: 'registry-tools:v3',
        toolRef,
        reason: 'publisher_withdrew',
      }))
    }
    const owner = createHostedOwnerRuntime({
      env: {},
      baseUrl: 'https://gateway.example',
      apiKey: 'run-key',
      fetch: fetchMock,
      input: { city: 'Perth' },
      ownerQuery: 'paid',
      ownerOpenApiDocument: {},
      ownerOpenApiPath: '/release-smoke',
      ownerOpenApiMethod: 'post',
      runId: 'ae-release-smoke:test',
      controlBusinessId: 'business:provider',
      transport: async () => {
        throw new Error('transport_not_expected')
      },
      context: {},
      preflightCredential: async () => undefined,
      revokeCredential: async () => ({
        kind: 'refused' as const,
        code: 'authentication_required' as const,
        credentialDigest: `sha256:${'a'.repeat(64)}`,
      }),
    })

    await expect(owner.readWithdrawnTool(toolRef)).resolves.toEqual({
      kind: 'refused',
      code: 'operation_withdrawn',
    })
    expect(requests).toEqual([{
      url: 'https://gateway.example/api/v1/market-tools/describe',
      method: 'POST',
      body: { toolRef },
    }])
  })

  it('accepts only a schema-valid response for the requested Tool', () => {
    expect(parseGatewayCallResponse({ status: 200, body: completed(callRef) }, toolRef)).toEqual(completed(callRef))
    expect(parseGatewayCallResponse({ status: 200, body: completed(callRef) }, 'operation:v1:other')).toMatchObject({
      kind: 'unknown',
      code: 'malformed_result',
      status: 200,
    })
    expect(parseGatewayCallResponse({ status: 503, body: { detail: 'retry' } }, toolRef)).toEqual({
      kind: 'unknown',
      code: 'http_error',
      status: 503,
      retryable: true,
    })
  })

  it('polls the canonical Call status route and returns the terminal result', async () => {
    const requests: string[] = []
    const fetchMock: typeof globalThis.fetch = async (input, init) => {
      requests.push(`${String(input)} ${init?.method ?? 'GET'}`)
      return Response.json({
        kind: 'found',
        callRef,
        version: 1,
        toolRef,
        state: 'terminal',
        evidenceHash: 'evidence:provider:1',
        result: completed(callRef),
      })
    }
    let nowValue = 1_000
    const sleep = vi.fn(async (milliseconds: number) => {
      expect(milliseconds).toBe(250)
      nowValue += milliseconds
    })
    const result = await pollGatewayCall(
      config(fetchMock, { now: () => nowValue, sleep }),
      { kind: 'pending', callRef, toolRef, retryAfterMs: 100 },
    )

    expect(result).toEqual(completed(callRef))
    expect(sleep).toHaveBeenCalledOnce()
    expect(requests).toEqual([
      'https://gateway.example/api/v1/calls/invocation%3Aprovider%3A1 GET',
    ])
  })

  it('reads status with the authenticated current Call route', async () => {
    const { config: serviceConfig, urls } = serviceFetch([{
      kind: 'found',
      callRef,
      version: 1,
      toolRef,
      state: 'terminal',
      evidenceHash: 'evidence:provider:1',
      result: completed(callRef),
    }])
    const result = await readGatewayCallStatus({ ...serviceConfig, apiKey: 'run-key', input: { city: 'Perth' } }, callRef)

    expect(result).toEqual(completed(callRef))
    expect(urls).toEqual(['https://gateway.example/api/v1/calls/invocation%3Aprovider%3A1'])
  })

  it('requires replay parity for the same Call identity and evidence', () => {
    expect(() => assertGatewayCallReplayParity(completed(callRef), completed(callRef))).not.toThrow()
    expect(() => assertGatewayCallReplayParity(completed(callRef), completed('invocation:other'))).toThrow('replay_call_mismatch')
    expect(() => assertGatewayCallReplayParity(completed(callRef), {
      ...completed(callRef),
      usage: {
        ...completed(callRef).usage,
        amount: { ...amount, units: '750001' },
      },
    })).toThrow('replay_usage_mismatch')
  })
})
