import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { handleMcpRequest, createAeMcpServer } from '@/lib/server/mcp-api'
import {
  listMcpActions,
  mcpToolName,
  type AnyAction,
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

const previousEnv = {
  localE2e: process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E,
  seed: process.env.AE_ANSWER_EVAL_REGISTRY_SEED,
  convexUrl: process.env.CONVEX_URL,
  publicConvexUrl: process.env.VITE_CONVEX_URL,
}

function pinEnv(): void {
  process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
  process.env.AE_ANSWER_EVAL_REGISTRY_SEED = 'default'
  delete process.env.CONVEX_URL
  delete process.env.VITE_CONVEX_URL
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
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
    const dataLine = text.split(/\r?\n/).find((line) => line.startsWith('data:'))
    if (dataLine === undefined) {
      throw new Error('MCP stream did not include a data event.')
    }
    return JSON.parse(dataLine.slice('data:'.length).trim()) as JsonRpcBody
  }
  return JSON.parse(text) as JsonRpcBody
}

describe('MCP host adapter', () => {
  beforeAll(() => {
    pinEnv()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    pinEnv()
  })

  afterAll(() => {
    restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousEnv.localE2e)
    restoreEnv('AE_ANSWER_EVAL_REGISTRY_SEED', previousEnv.seed)
    restoreEnv('CONVEX_URL', previousEnv.convexUrl)
    restoreEnv('VITE_CONVEX_URL', previousEnv.publicConvexUrl)
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
    expect(names).not.toContain('registry.list')
    expect(names).not.toContain('registry.search')
  })

  it('rejects a non-read-only MCP action for the anonymous tier', () => {
    const fakeAction = {
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
      run: async () => ({ kind: 'ok' }),
    } as AnyAction

    expect(() => createAeMcpServer(new Request('https://ae.example/mcp'), [fakeAction])).toThrow(
      /read-only actions/,
    )
  })
})
