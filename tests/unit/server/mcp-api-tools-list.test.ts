import { describe, expect, it, vi } from 'vitest'
import {
  authenticateWithScopes,
  handleMcpRequest,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import type { JsonRpcBody } from './mcp-api-harness'
import { listMcpActions, mcpToolName, MCP_TOOLSETS } from '@/modules/actions'

const listRequest = { jsonrpc: '2.0', id: 'list', method: 'tools/list', params: {} } as const
const discoverNames = MCP_TOOLSETS.discover.slice(0, 3).map((id) => `ae_${id.replace(/\./gu, '_')}`)
const names = (body: JsonRpcBody): string[] =>
  ((body.result?.tools ?? []) as Array<{ name: string }>).map((tool) => tool.name)
const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength

async function listWith(scopes: readonly string[], path = '/mcp') {
  const request = new Request(`https://ae.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer role-test' },
    body: JSON.stringify(listRequest),
  })
  const response = await handleMcpRequest(request, {
    authenticate: authenticateWithScopes(scopes),
    resolvePrincipal: async (projection) => ({
      ...projection,
      principalId: 'prn_00000000000040008000000000000044',
      ownerId: 'acc_00000000000040008000000000000044',
    }),
  })
  expect(response.status).toBe(200)
  const body = await readMcpBody(response)
  expect(body.error).toBeUndefined()
  return body
}

describe('MCP role toolsets', () => {
  it('lists exactly public discovery for an anonymous principal, never Operation-level tools', async () => {
    const response = await postMcp(listRequest)
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(names(body)).toEqual(discoverNames)
    expect(names(body)).not.toContain('ae_registry_tools_list')
    expect(names(body)).not.toContain('ae_tool_call')
    expect(names(body).some((name) => name.startsWith('ae_operation_'))).toBe(false)
    expect(bytes(body.result?.tools)).toBeLessThan(8192)
    for (const tool of (body.result?.tools ?? []) as Array<Record<string, unknown>>) {
      expect(tool.inputSchema).toMatchObject({ type: 'object', properties: expect.any(Object) })
      expect(tool.outputSchema).toMatchObject({
        type: 'object',
        properties: {
          result: { type: 'object' },
          kind: { type: 'string' },
          code: { type: 'string' },
          next: { type: 'array' },
        },
        required: ['next'],
      })
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    }
  })

  it('lists buyer workflows and account reads without provider authority', async () => {
    const body = await listWith(['market_tools:call'])
    const listed = names(body)
    for (const actionId of [...MCP_TOOLSETS.discover, ...MCP_TOOLSETS.buy, ...MCP_TOOLSETS.account]) {
      expect(listed).toContain(`ae_${actionId.replace(/\./gu, '_')}`)
    }
    expect(listed).not.toContain('ae_registry_tools_list')
    expect(listed).not.toContain('ae_supply_publish')
    expect(bytes(body.result?.tools)).toBeLessThan(50_000)
    const tools = body.result?.tools as Array<Record<string, unknown>>
    expect(tools.find((tool) => tool.name === 'ae_tool_quote')?.annotations).toMatchObject({
      readOnlyHint: false, destructiveHint: false, idempotentHint: false,
    })
    expect(tools.find((tool) => tool.name === 'ae_tool_call')?.annotations).toMatchObject({
      readOnlyHint: false, destructiveHint: true, idempotentHint: true,
    })
  })

  it('lists the complete Provider lifecycle only for provider authority, without granting buy', async () => {
    const body = await listWith(['market_supply:manage'])
    const listed = names(body)
    expect(MCP_TOOLSETS.provider).toHaveLength(15)
    for (const actionId of MCP_TOOLSETS.provider) expect(listed).toContain(`ae_${actionId.replace(/\./gu, '_')}`)
    expect(listed).toContain('ae_agentAccess_whoami')
    expect(listed).not.toContain('ae_tool_call')
    expect(listed).not.toContain('ae_agentAccess_balance')
    expect(bytes(body.result?.tools)).toBeLessThan(50_000)
  })

  it('limits an authenticated read-only connection to discover and read-only account tools', async () => {
    const body = await listWith(['market_tools:call', 'market_supply:manage'], '/mcp?readonly=1')
    const listed = names(body)
    expect(listed).toEqual(listMcpActions()
      .filter((action) => action.readOnly && (
        (MCP_TOOLSETS.discover as readonly string[]).includes(action.id)
        || (MCP_TOOLSETS.account as readonly string[]).includes(action.id)
      ))
      .map(mcpToolName))
    expect(listed).toContain('ae_agentAccess_balance')
    expect(listed).not.toContain('ae_tool_quote')
    expect(listed).not.toContain('ae_call_status')
    expect(listed).not.toContain('ae_funding_handoff_create')
    expect(listed).not.toContain('ae_supply_status')
  })

  it('refuses a direct buy call in read-only mode before invoking the service', async () => {
    const quoteTool = vi.fn()
    const response = await handleMcpRequest(new Request('https://ae.example/mcp?readonly=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer buyer' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'readonly-buy', method: 'tools/call',
        params: { name: 'ae_tool_quote', arguments: { toolRef: `operation:v1:${'a'.repeat(64)}`, input: {} } },
      }),
    }), {
      authenticate: authenticateWithScopes(['market_tools:call']),
      resolvePrincipal: async (projection) => ({
        ...projection,
        principalId: 'prn_00000000000040008000000000000044',
        ownerId: 'acc_00000000000040008000000000000044',
      }),
      callService: { quoteTool, callTool: vi.fn(), readCallStatus: vi.fn(), cancelCall: vi.fn(), reconcileCall: vi.fn() },
    })
    expect(response.status).toBe(200)
    expect((await readMcpBody(response)).result).toMatchObject({
      isError: true,
      structuredContent: { kind: 'PERMISSION_DENIED', code: 'mcp_toolset_required', next: [] },
    })
    expect(quoteTool).not.toHaveBeenCalled()
  })

  it('paginates only admitted tools with a role-local cursor', async () => {
    const collected: string[] = []
    let cursor: string | undefined
    do {
      const response = await postMcp({ ...listRequest, params: cursor === undefined ? {} : { cursor } }, { toolsListPageSize: 2 })
      const body = await readMcpBody(response)
      const result = body.result as { tools: Array<{ name: string }>; nextCursor?: string }
      expect(result.tools.length).toBeLessThanOrEqual(2)
      collected.push(...result.tools.map((tool) => tool.name))
      cursor = result.nextCursor
    } while (cursor !== undefined)
    expect(collected).toEqual(discoverNames)
  })

  it('rejects malformed tools/list cursors as protocol invalid params', async () => {
    const body = await readMcpBody(await postMcp({ ...listRequest, params: { cursor: 'invalid!' } }, { toolsListPageSize: 2 }))
    expect(body.error).toMatchObject({ code: -32602, message: expect.stringContaining('cursor:') })
  })
})
