import { parseJsonEventStream } from '@ai-sdk/provider-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { handleMcpRequest, createAeMcpServer } from '@/lib/server/mcp-api'
import {
  defineAction,
  listActions,
  listMcpActions,
  mcpToolName,
} from '@/modules/actions'
import {
  registryDetailAction,
  registryServicesSearchAction,
} from '@/modules/registry/registry.actions'
import { sandboxCheckupQuoteAction } from '@/modules/sandbox-supply/sandbox-supply.actions'

const operationExecuteMocks = vi.hoisted(() => ({
  executeKeylessOperation: vi.fn(),
}))

vi.mock('@/modules/capability-execution/operation-execute.server', () => ({
  executeKeylessOperation: operationExecuteMocks.executeKeylessOperation,
}))


type JsonRpcBody = {
  result?: Record<string, unknown>
  error?: Record<string, unknown>
}


function pinEnv(): void {
  vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
  vi.stubEnv('AE_ANSWER_EVAL_REGISTRY_SEED', 'default')
  vi.stubEnv('CONVEX_URL', undefined)
  vi.stubEnv('VITE_CONVEX_URL', undefined)
}

const currentOperationRef = `operation:v1:${'a'.repeat(64)}`


async function postMcp(body: object, options: Parameters<typeof handleMcpRequest>[1] = {}): Promise<Response> {
  const request = new Request('https://ae.example/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })
  return handleMcpRequest(request, options)
}

async function readMcpBody(response: Response): Promise<JsonRpcBody> {
  const text = await response.text()
  if (response.headers.get('content-type')?.includes('text/event-stream') === true) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${text}\n\n`))
        controller.close()
      },
    })
    for await (const candidate of parseJsonEventStream({ stream, schema: z.unknown() })) {
      if (!candidate.success) continue
      return candidate.value as JsonRpcBody
    }
    throw new Error('MCP stream did not include a data event.')
  }
  return JSON.parse(text) as JsonRpcBody
}

describe('MCP host adapter', () => {

  beforeEach(() => {
    vi.restoreAllMocks()
    operationExecuteMocks.executeKeylessOperation.mockReset()
    pinEnv()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

  it('lists exactly the registered MCP tools in deterministic order', async () => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    const tools = result.tools as Array<Record<string, unknown>>
    const expectedToolNames = listMcpActions().map(mcpToolName)

    expect(expectedToolNames).toEqual([
      'ae_registry_services_list',
      'ae_registry_services_search',
      'ae_registry_detail',
      'ae_registry_operations_search',
      'ae_registry_operations_detail',
      'ae_registry_operations_compare',
      'ae_registry_operations_inspectPlan',
      'ae_operation_execute',
      'ae_sandbox_checkup_quote',
    ])
    expect(tools.map((tool) => tool.name)).toEqual(expectedToolNames)

    for (const tool of tools) {
      const name = tool.name
      const action = listMcpActions().find((candidate) => mcpToolName(candidate) === name)
      if (action === undefined) {
        throw new Error(`No MCP action found for ${String(name)}.`)
      }
      expect(tool.description).toContain(action.boundaries[0])
      expect(tool.inputSchema).toEqual(expect.objectContaining({ properties: expect.any(Object) }))
      expect(tool.outputSchema).toEqual(expect.any(Object))
    }

    const detail = tools.find((tool) => tool.name === 'ae_registry_detail')
    const quote = tools.find((tool) => tool.name === 'ae_sandbox_checkup_quote')
    const operations = tools.find((tool) => tool.name === 'ae_registry_operations_search')
    const search = tools.find((tool) => tool.name === 'ae_registry_services_search')
    const execute = tools.find((tool) => tool.name === 'ae_operation_execute')
    expect(detail?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ slug: expect.any(Object) }),
    }))
    expect(quote?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ slug: expect.any(Object) }),
    }))
    expect(search?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ query: expect.any(Object) }),
    }))
    expect(detail?.outputSchema).toEqual(expect.objectContaining({ oneOf: expect.any(Array) }))
    expect(operations?.outputSchema).toEqual(expect.objectContaining({ anyOf: expect.any(Array) }))
    expect(quote?.outputSchema).toEqual(expect.objectContaining({ oneOf: expect.any(Array) }))
    expect(execute?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ operationRef: expect.any(Object), input: expect.any(Object) }),
    }))
    expect(execute?.outputSchema).toEqual(expect.objectContaining({ oneOf: expect.any(Array) }))

  })

  it('calls the registered services search action with MCP attribution', async () => {
    const run = vi.spyOn(registryServicesSearchAction, 'run').mockResolvedValue({
      kind: 'ok',
      schemaVersion: 'public-services-api:v2',
      query: 'plumbing',
      services: [],
      pagination: { limit: 10, total: 0, hasMore: false },
    })

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ae_registry_services_search',
        arguments: { query: 'plumbing' },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect(run).toHaveBeenCalledWith({
      data: { query: 'plumbing' },
      context: expect.objectContaining({ caller: 'mcp' }),
    })
    expect(result.structuredContent).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-services-api:v2',
    })
  })
  it('delegates a valid MCP operation call to the canonical keyless executor once', async () => {
    operationExecuteMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok',
      operationRef: currentOperationRef,
      capabilityId: 'weather.current',
      name: 'Current weather',
      output: { temperature: 21 },
      evidenceHash: 'evidence-hash',
    })

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-execute',
      method: 'tools/call',
      params: {
        name: 'ae_operation_execute',
        arguments: {
          operationRef: currentOperationRef,
          input: { latitude: -33.86, longitude: 151.2 },
        },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect(operationExecuteMocks.executeKeylessOperation).toHaveBeenCalledTimes(1)
    expect(operationExecuteMocks.executeKeylessOperation).toHaveBeenCalledWith({
      operationRef: currentOperationRef,
      input: { latitude: -33.86, longitude: 151.2 },
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toEqual({
      kind: 'ok',
      operationRef: currentOperationRef,
      capabilityId: 'weather.current',
      name: 'Current weather',
      output: { temperature: 21 },
      evidenceHash: 'evidence-hash',
    })
  })

  it('returns literal stale and non-keyless refusals from the canonical executor', async () => {
    operationExecuteMocks.executeKeylessOperation.mockClear()
    for (const reason of ['operation_not_found', 'operation_not_keyless'] as const) {
      operationExecuteMocks.executeKeylessOperation.mockResolvedValue({
        kind: 'refused',
        operationRef: currentOperationRef,
        reason,
      })

      const response = await postMcp({
        jsonrpc: '2.0',
        id: `operation-refusal-${reason}`,
        method: 'tools/call',
        params: {
          name: 'ae_operation_execute',
          arguments: { operationRef: currentOperationRef, input: {} },
        },
      })

      expect(response.status).toBe(200)
      const body = await readMcpBody(response)
      const result = body.result as Record<string, unknown>
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({
        kind: 'refused',
        operationRef: currentOperationRef,
        reason,
      })
    }
    expect(operationExecuteMocks.executeKeylessOperation).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed input and caller-supplied execution authority before running', async () => {
    for (const argumentsValue of [
      { input: {} },
      {
        operationRef: currentOperationRef,
        input: {},
        endpointUrl: 'https://attacker.example',
        method: 'POST',
        credentialRef: 'attacker-secret',
      },
    ]) {
      const response = await postMcp({
        jsonrpc: '2.0',
        id: 'operation-invalid',
        method: 'tools/call',
        params: {
          name: 'ae_operation_execute',
          arguments: argumentsValue,
        },
      })

      expect(response.status).toBe(200)
      const body = await readMcpBody(response)
      expect(body.result).toMatchObject({ isError: true })
    }
    expect(operationExecuteMocks.executeKeylessOperation).not.toHaveBeenCalled()
  })


  it('calls a union-output sandbox quote tool with its declared schema retained', async () => {
    const run = vi.spyOn(sandboxCheckupQuoteAction, 'run').mockResolvedValue({
      kind: 'refused',
      code: 'unknown_offering',
      reason: 'No published fixed-price checkup offering exists for this slug.',
    })

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'ae_sandbox_checkup_quote',
        arguments: { slug: 'made-up-nonexistent-biz' },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect(run).toHaveBeenCalledWith({
      data: { slug: 'made-up-nonexistent-biz' },
      context: expect.objectContaining({ caller: 'mcp' }),
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({ kind: 'refused', code: 'unknown_offering' })
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

  it('returns an input validation error without invoking the detail action', async () => {
    const run = vi.spyOn(registryDetailAction, 'run')
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'ae_registry_detail',
        arguments: {},
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({ isError: true })
    expect(run).not.toHaveBeenCalled()
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

  it('does not expose customer request or non-MCP actions', async () => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/list',
      params: {},
    })
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    const names = (result.tools as Array<Record<string, unknown>>).map((tool) => tool.name)

    expect(names).not.toContain('customerRequest_confirm')
    expect(names).not.toContain('customer.request.confirm')
    expect(names).toEqual(listMcpActions().map(mcpToolName))
    const workTreeNames = listActions()
      .filter(({ id }) => id.startsWith('workTree.'))
      .map(mcpToolName)
    expect(names).not.toEqual(expect.arrayContaining(workTreeNames))
    const writeToolNames = listActions().filter(({ readOnly }) => !readOnly).map(mcpToolName)
    expect(names).not.toEqual(expect.arrayContaining(writeToolNames))
    expect(names).not.toContain('registry.list')
    expect(names).not.toContain('registry.search')
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
        controller.enqueue(encoder.encode('x'.repeat(65 * 1024)))
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

  it('rejects a non-read-only MCP action for the anonymous tier', () => {
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

    expect(() => createAeMcpServer(new Request('https://ae.example/mcp'), [fakeAction])).toThrow(
      /read-only actions/,
    )
  })
})
