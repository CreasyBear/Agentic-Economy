import { parseJsonEventStream } from '@ai-sdk/provider-utils'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { handleMcpRequest } from '@/lib/server/mcp-api'
import {
  defineAction,
  listActions,
  listMcpActions,
  mcpToolName,
} from '@/modules/actions'
import {
  registryDetailAction,
  registrySearchAction,
} from '@/modules/registry/registry.actions'
import type * as PosthogServerModule from '@/lib/observability/posthog.server'

const captureLegacyRegistryActionRequestMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/observability/posthog.server', async (importOriginal) => ({
  ...(await importOriginal<typeof PosthogServerModule>()),
  captureLegacyRegistryActionRequest: captureLegacyRegistryActionRequestMock,
}))

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
function authenticateWithScopes(scopes: readonly string[]) {
  return async () => ({
    isAuthenticated: true as const,
    tokenType: 'api_key' as const,
    id: 'key:test',
    subject: 'user_test',
    scopes: [...scopes],
  })
}


async function postMcp(
  body: object,
  options: Parameters<typeof handleMcpRequest>[1] = {},
  headers: HeadersInit = {},
): Promise<Response> {
  const request = new Request('https://ae.example/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
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
    captureLegacyRegistryActionRequestMock.mockReset()
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
    const mcpActions = listMcpActions()
      .filter((action) => action.surfaces.includes('mcp') && action.readOnly && action.credentialAdmission === undefined)
    const expectedToolNames = mcpActions.map(mcpToolName)
    expect(expectedToolNames).toEqual([
      'ae_registry_search',
      'ae_registry_detail',
      'ae_registry_operations_search',
      'ae_registry_operations_detail',
      'ae_registry_operations_compare',
      'ae_registry_operations_inspectPlan',
      'ae_operation_execute',
    ])
    expect(expectedToolNames).not.toContain('ae_operation_invoke')
    expect(expectedToolNames).not.toContain('ae_operation_status')
    expect(tools.map((tool) => tool.name)).toEqual(expectedToolNames)
    expect(tools).toHaveLength(expectedToolNames.length)

    for (const tool of tools) {
      const name = tool.name
      const action = mcpActions.find((candidate) => mcpToolName(candidate) === name)
      if (action === undefined) {
        throw new Error(`No MCP action found for ${String(name)}.`)
      }
      expect(tool.description).toContain(action.boundaries[0])
      expect(tool.inputSchema).toEqual(expect.objectContaining({
        type: 'object',
        properties: expect.any(Object),
        additionalProperties: false,
      }))
      const expectedOutputSchema = toJsonSchemaCompat(z.object({
        result: action.outputSchema,
      }), {
        strictUnions: true,
        pipeStrategy: 'output',
      })
      expect(tool.outputSchema).toEqual(expect.objectContaining({
        type: 'object',
        additionalProperties: false,
        required: ['result'],
      }))
      expect(tool.outputSchema).toEqual(expectedOutputSchema)
    }

    const detail = tools.find((tool) => tool.name === 'ae_registry_detail')
    const operations = tools.find((tool) => tool.name === 'ae_registry_operations_search')
    const compare = tools.find((tool) => tool.name === 'ae_registry_operations_compare')
    const inspectPlan = tools.find((tool) => tool.name === 'ae_registry_operations_inspectPlan')
    const search = tools.find((tool) => tool.name === 'ae_registry_search')
    const execute = tools.find((tool) => tool.name === 'ae_operation_execute')
    expect(detail?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ slug: expect.any(Object) }),
    }))
    expect(search?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ query: expect.any(Object) }),
    }))
    expect(operations?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ query: expect.any(Object) }),
    }))
    expect(compare?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        operationRefs: expect.objectContaining({
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: expect.objectContaining({ type: 'string', pattern: expect.any(String) }),
        }),
      }),
    }))
    expect(inspectPlan?.inputSchema).toEqual(expect.objectContaining({
      required: ['operationRefs'],
      additionalProperties: false,
      properties: expect.objectContaining({
        operationRefs: expect.any(Object),
        mappingRefs: expect.any(Object),
        expiresInMs: expect.any(Object),
      }),
    }))
    expect(execute?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ operationRef: expect.any(Object), input: expect.any(Object) }),
    }))
    expect(execute?.description).toContain('keyless http-json:v1 GET or POST operations')
    expect(execute?.description).toContain('financial_exposure')
    expect(execute?.description).toContain('external_state_change')
    expect(execute?.description).not.toMatch(/\bPOST\b[^.]*refused/i)

  })

  it('calls the registered registry search action with MCP attribution', async () => {
    const run = vi.spyOn(registrySearchAction, 'run').mockResolvedValue({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      query: 'plumbing',
      items: [],
      pagination: { limit: 10, total: 0, hasMore: false },
    } as never)

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ae_registry_search',
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
    expect((result.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({
      kind: 'ok',
    })
    expect(captureLegacyRegistryActionRequestMock).toHaveBeenCalledTimes(1)
    expect(captureLegacyRegistryActionRequestMock).toHaveBeenCalledWith(
      'registry.search',
      'mcp',
    )
  })
  it('dispatches a publication artifact above 64 KiB below the MCP body cap', async () => {
    const publicationSourceBytes = 262_144
    const publicationSource = {
      kind: 'openapi_http',
      documentJson: 'x'.repeat(publicationSourceBytes),
    }
    const body = {
      jsonrpc: '2.0',
      id: 'large-publication',
      method: 'tools/call',
      params: {
        name: 'ae_supply_publish',
        arguments: {
          version: 'supply-publication:v1',
          businessId: 'business:test',
          offeringRef: 'offering:test',
          offeringRevision: 1,
          offeringSourceHash: 'hash:test',
          source: publicationSource,
          evidenceRefs: ['evidence:test'],
          idempotencyKey: 'large-publication-key',
        },
      },
    }
    const encoder = new TextEncoder()
    const sourceBytes = encoder.encode(publicationSource.documentJson).byteLength
    const requestBytes = encoder.encode(JSON.stringify(body)).byteLength
    expect(sourceBytes).toBe(262_144)
    expect(requestBytes).toBeGreaterThan(64 * 1024)
    expect(requestBytes).toBeLessThan(320 * 1024)

    const supplyService = {
      publish: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'boundary_probe' }),
      withdraw: vi.fn(),
      earnings: vi.fn(),
    }
    const response = await postMcp(body, {
      authenticate: authenticateWithScopes(['market_supply:manage']),
      supplyManagementService: supplyService,
    }, {
      authorization: 'Bearer supply-boundary',
    })

    expect(response.status).toBe(200)
    const result = await readMcpBody(response)
    expect(supplyService.publish).toHaveBeenCalledOnce()
    expect(result.result).toMatchObject({
      structuredContent: { result: { kind: 'refused', reason: 'boundary_probe' } },
    })
    expect(captureLegacyRegistryActionRequestMock).toHaveBeenCalledWith(
      'supply.publish',
      'mcp',
    )
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
    expect((result.structuredContent as { result?: unknown } | undefined)?.result).toEqual({
      kind: 'ok',
      operationRef: currentOperationRef,
      capabilityId: 'weather.current',
      name: 'Current weather',
      output: { temperature: 21 },
      evidenceHash: 'evidence-hash',
    })
    expect(captureLegacyRegistryActionRequestMock).toHaveBeenCalledWith(
      'operation.execute',
      'mcp',
    )
  })

  it('fails closed when a canonical action returns invalid structured output', async () => {
    operationExecuteMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok',
      operationRef: currentOperationRef,
    })

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-invalid-output',
      method: 'tools/call',
      params: {
        name: 'ae_operation_execute',
        arguments: {
          operationRef: currentOperationRef,
          input: {},
        },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect(result).toMatchObject({ isError: true })
    expect(result).not.toHaveProperty('structuredContent')
    expect(result.content).toEqual(expect.arrayContaining([
      { type: 'text', text: expect.stringContaining('action_output_invalid') },
    ]))
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
      expect((result.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({
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
    const names = (result.tools as Array<Record<string, unknown>>).map((tool) => String(tool.name))

    expect(names).not.toContain('customerRequest_confirm')
    expect(names).not.toContain('customer.request.confirm')
    expect(names).toEqual(listMcpActions()
      .filter((action) => action.readOnly && action.credentialAdmission === undefined)
      .map(mcpToolName))
    const workTreeNames = listActions()
      .filter(({ id }) => id.startsWith('workTree.'))
      .map(mcpToolName)
    expect(workTreeNames).toEqual([])
    expect(names.some((name) => name.startsWith('ae_workTree_'))).toBe(false)
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

  it('hides a non-read-only MCP action from the anonymous tier', async () => {
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


    const response = await postMcp({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/list',
      params: {},
    }, { actions: [registryDetailAction, fakeAction] })
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({
      tools: [expect.objectContaining({ name: mcpToolName(registryDetailAction) })],
    })
  })
  it('hides credential-admitted supplier tools from anonymous tools/list', async () => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'anonymous-supply-list',
      method: 'tools/list',
      params: {},
    })
    const body = await readMcpBody(response)
    const names = ((body.result?.tools ?? []) as Array<Record<string, unknown>>).map((tool) => tool.name)

    expect(names).not.toEqual(expect.arrayContaining([
      'ae_supply_publish',
      'ae_supply_withdraw',
      'ae_supply_earnings',
    ]))
  })

  it('lists operation tools without supplier tools for an operation-only principal', async () => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-only-list',
      method: 'tools/list',
      params: {},
    }, {
      authenticate: authenticateWithScopes(['market_operations:invoke']),
    }, {
      authorization: 'Bearer operation-only',
    })
    const body = await readMcpBody(response)
    const names = ((body.result?.tools ?? []) as Array<Record<string, unknown>>).map((tool) => tool.name)
    const expectedNames = listMcpActions()
      .filter((action) => (action.readOnly && action.credentialAdmission === undefined)
        || action.credentialAdmission?.scope === 'market_operations:invoke')
      .map(mcpToolName)

    expect(names).toEqual(expectedNames)
    expect(names).not.toEqual(expect.arrayContaining([
      'ae_supply_publish',
      'ae_supply_withdraw',
      'ae_supply_earnings',
    ]))
  })

  it('lists exactly the three supplier tools plus anonymous reads for a supply-only principal', async () => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'supply-only-list',
      method: 'tools/list',
      params: {},
    }, {
      authenticate: authenticateWithScopes(['market_supply:manage']),
    }, {
      authorization: 'Bearer supply-only',
    })
    const body = await readMcpBody(response)
    const names = ((body.result?.tools ?? []) as Array<Record<string, unknown>>).map((tool) => tool.name)
    const supplyActions = listMcpActions()
      .filter((action) => action.credentialAdmission?.scope === 'market_supply:manage')
    const expectedNames = listMcpActions()
      .filter((action) => (action.readOnly && action.credentialAdmission === undefined)
        || action.credentialAdmission?.scope === 'market_supply:manage')
      .map(mcpToolName)
    const operationProtectedNames = listMcpActions()
      .filter((action) => action.credentialAdmission?.scope === 'market_operations:invoke')
      .map(mcpToolName)

    expect(supplyActions).toHaveLength(3)
    expect(supplyActions.map((action) => action.id).sort()).toEqual([
      'supply.earnings',
      'supply.publish',
      'supply.withdraw',
    ])
    expect(names).toEqual(expectedNames)
    expect(names).not.toEqual(expect.arrayContaining(operationProtectedNames))
  })
  it('rejects an operation-only principal from calling a supplier action without invoking its service', async () => {
    const supplyService = {
      publish: vi.fn(),
      withdraw: vi.fn(),
      earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-only-supply-call',
      method: 'tools/call',
      params: {
        name: 'ae_supply_earnings',
        arguments: { currency: 'USD' },
      },
    }, {
      authenticate: authenticateWithScopes(['market_operations:invoke']),
      supplyManagementService: supplyService,
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      status: 403,
      kind: 'PERMISSION_DENIED',
      code: 'scope_required',
    })
    expect(supplyService.earnings).not.toHaveBeenCalled()
  })

  it('rejects an anonymous principal from calling a supplier action without invoking its service', async () => {
    const supplyService = {
      publish: vi.fn(),
      withdraw: vi.fn(),
      earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'anonymous-supply-call',
      method: 'tools/call',
      params: {
        name: 'ae_supply_earnings',
        arguments: { currency: 'USD' },
      },
    }, {
      authenticate: async () => ({
        isAuthenticated: false,
        tokenType: null,
        id: null,
        subject: null,
        scopes: null,
      }),
      supplyManagementService: supplyService,
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'authentication_required',
    })
    expect(supplyService.earnings).not.toHaveBeenCalled()
  })

  it('dispatches a supplier action for a supply-only principal', async () => {
    const supplyService = {
      publish: vi.fn(),
      withdraw: vi.fn(),
      earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'supply-only-supply-call',
      method: 'tools/call',
      params: {
        name: 'ae_supply_earnings',
        arguments: { currency: 'USD' },
      },
    }, {
      authenticate: authenticateWithScopes(['market_supply:manage']),
      supplyManagementService: supplyService,
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result).toEqual({ kind: 'not_found' })
    expect(supplyService.earnings).toHaveBeenCalledOnce()
    expect(supplyService.earnings).toHaveBeenCalledWith(expect.objectContaining({
      input: { currency: 'USD' },
      principal: expect.objectContaining({
        credentialId: 'key:test',
        scopes: ['market_supply:manage'],
      }),
    }))
  })

  it('authenticates operation.invoke and delegates the same registered action', async () => {
    const executor = {
      invokeOperation: vi.fn().mockResolvedValue({
        kind: 'completed',
        invocationRef: 'invocation:test',
        operationRef: currentOperationRef,
        output: { value: 42 },
        evidenceHash: 'evidence:test',
        usage: {
          usageRef: 'usage:test',
          observedAt: 1_700_000_000_000,
          chargeState: 'free_tier',
          amount: { currency: 'USD', units: '0', exponent: 2 },
          priceDigest: 'price:test',
        },
      }),
      readInvocationStatus: vi.fn(),
      cancelInvocation: vi.fn(),
      reconcileInvocation: vi.fn(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'ae_operation_invoke',
        arguments: {
          operationRef: currentOperationRef,
          input: {},
          idempotencyKey: 'mcp-key-1',
        },
      },
    }, {
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'key:test',
        subject: 'user_test',
        scopes: ['market_operations:invoke'],
      }),
      operationInvokeService: executor,
    })
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({ kind: 'completed', operationRef: currentOperationRef })
    expect(executor.invokeOperation).toHaveBeenCalledOnce()
  })
})
