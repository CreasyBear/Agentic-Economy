import {
  handleMcpRequest,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { defineAction, mcpToolName } from '@/modules/actions'

describe('MCP host adapter protocol', () => {
  it('initializes with server information and the tools capability', async () => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'mcp-api-test', version: '0.0.0' },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({
      serverInfo: { name: 'agentic-economy', version: '1.0.0' },
      capabilities: { tools: expect.any(Object) },
    })
  })
  it('maps top-level MCP request schema failures to Invalid params', async () => {
    const malformedInitialize = await postMcp({
      jsonrpc: '2.0',
      id: 'invalid-initialize',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'mcp-api-test', version: '0.0.0' },
      },
    })
    const malformedCall = await postMcp({
      jsonrpc: '2.0',
      id: 'invalid-call',
      method: 'tools/call',
      params: {
        name: 123,
        arguments: {},
      },
    })

    for (const response of [malformedInitialize, malformedCall]) {
      expect(response.status).toBe(200)
      const body = await readMcpBody(response)
      expect(body.error).toMatchObject({
        code: -32602,
        message: 'Invalid MCP request parameters.',
      })
      expect(body.error?.message).not.toContain('\n')
    }
  })


  it('rebuilds a cross-realm hosted request from web-standard fields', async () => {
    const native = new Request('https://ae.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'cross-realm',
        method: 'tools/list',
        params: {},
      }),
    })
    const hostedRequest = {
      method: native.method,
      url: native.url,
      headers: native.headers,
      body: native.body,
      signal: native.signal,
      clone: () => native.clone(),
    } as Request

    const response = await handleMcpRequest(hostedRequest)

    expect(response.status).toBe(200)
    expect((await readMcpBody(response)).result).toMatchObject({
      tools: expect.any(Array),
    })
  })

  it('refuses GET Streamable HTTP SSE instead of waiting on a session', async () => {
    const response = await handleMcpRequest(new Request('https://ae.example/mcp', {
      method: 'GET',
      headers: { accept: 'text/event-stream' },
    }))

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST, DELETE')
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({
      status: 405,
      kind: 'METHOD_NOT_ALLOWED',
      code: 'method_not_allowed',
    })
  })

  it('sanitizes thrown MCP action errors', async () => {
    const secret = 'secret_internal_exception_detail'
    const throwingAction = defineAction({
      id: 'test.throwing',
      name: 'Throwing test action',
      summary: 'Throws a private error for MCP sanitization coverage.',
      boundaries: ['Used only by this test.'],
      schema: z.strictObject({}),
      parameters: [],
      readOnly: true,
      effect: {
        class: 'observation',
        reversible: true,
        recipientKind: 'none',
        dataClasses: [],
        spendExposure: 'none',
        approval: 'none',
      },
      surfaces: ['mcp'],
      outputSchema: z.strictObject({ kind: z.literal('ok') }),
      invocationContract: {
        version: 'test.throwing:v1',
        consequenceClass: 'read_only',
        materialInputPaths: [],
        authorityRequirement: 'none',
        retryClass: 'replayable',
        expectedEvidence: [],
        safeContinuations: [],
        invalidationConditions: ['action_contract_version_changed'],
      },
      run: async () => {
        throw new Error(secret)
      },
    })

    const response = await postMcp(
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: mcpToolName(throwingAction),
          arguments: {},
        },
      },
      { actions: [throwingAction] },
    )

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect(result.isError).toBe(true)
    expect(result.content).toEqual(expect.arrayContaining([
      { type: 'text', text: expect.stringContaining('action_execution_failed') },
    ]))
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('returns an error for an unknown tool without invoking an action', async () => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'ae_unknown_tool',
        arguments: {},
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({ isError: true })
  })

  it('uses the canonical base URL for protected MCP challenges', async () => {
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://canonical.example')
    const fakeAction = defineAction({
      id: 'fake.write',
      name: 'Fake write',
      summary: 'A fake write action.',
      boundaries: ['Writes nothing in this test.'],
      schema: z.strictObject({}),
      parameters: [],
      readOnly: false,
      effect: {
        class: 'external_state_change', reversible: false, recipientKind: 'none',
        dataClasses: [], spendExposure: 'none', approval: 'approve_each',
      },
      surfaces: ['mcp'],
      outputSchema: z.strictObject({ kind: z.literal('ok') }),
      invocationContract: {
        version: 'fake.write:v1',
        consequenceClass: 'external_effect',
        materialInputPaths: [],
        authorityRequirement: 'none',
        retryClass: 'reconcile_before_retry',
        expectedEvidence: [],
        safeContinuations: [],
        invalidationConditions: ['action_contract_version_changed'],
      },
      run: async () => ({ kind: 'ok' }),
    })

    const response = await handleMcpRequest(
      new Request('https://attacker.example/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: { name: mcpToolName(fakeAction), arguments: {} },
        }),
      }),
      {
        actions: [fakeAction],
        authenticate: async () => ({
          isAuthenticated: false,
          tokenType: null,
          id: null,
          subject: null,
          scopes: null,
        }),
      },
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://canonical.example/.well-known/oauth-protected-resource", scope="customer_requests:approve_each"',
    )
  })

  it('rejects an over-limit POST body as a truthful 413 transport response', async () => {
    const encoder = new TextEncoder()
    let canceled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode('x'.repeat(320 * 1024 + 1)))
      },
      cancel() {
        canceled = true
      },
    })
    const request = new Request('https://ae.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    const response = await handleMcpRequest(request)

    expect(canceled).toBe(true)
    expect(response.status).toBe(413)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({
      status: 413,
      kind: 'PAYLOAD_TOO_LARGE',
      code: 'payload_too_large',
    })
  })
})
