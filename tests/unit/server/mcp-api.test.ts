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


async function postMcp(body: object): Promise<Response> {
  const request = new Request('https://ae.example/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })
  return handleMcpRequest(request)
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
    }

    const detail = tools.find((tool) => tool.name === 'ae_registry_detail')
    const quote = tools.find((tool) => tool.name === 'ae_sandbox_checkup_quote')
    const search = tools.find((tool) => tool.name === 'ae_registry_services_search')
    expect(detail?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ slug: expect.any(Object) }),
    }))
    expect(quote?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ slug: expect.any(Object) }),
    }))
    expect(search?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ query: expect.any(Object) }),
    }))
  })

  it('calls the registered services search action with MCP attribution', async () => {
    const run = vi.spyOn(registryServicesSearchAction, 'run').mockResolvedValue({
      kind: 'ok',
      schemaVersion: 'public-services-api:v1',
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
    expect(result.structuredContent).toMatchObject({ kind: 'ok' })
  })

  it('calls the union-output sandbox quote tool without SDK output-schema crashes', async () => {
    // Regression: SDK 1.30 only supports top-level *object* output schemas at
    // call time; the adapter must omit `outputSchema` for union outputs
    // instead of crashing with `Cannot read properties of undefined ('_zod')`.
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

  it('bounds the POST body before handing it to the MCP transport', async () => {
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
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: -32700 } })
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
