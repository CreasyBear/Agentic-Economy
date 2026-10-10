import { Validator, type Schema } from '@cfworker/json-schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  authenticateWithScopes,
  handleMcpRequest,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import type { JsonRpcBody } from './mcp-api-harness'
import { toolQuoteResultSchema } from '@/modules/capability-execution/quote'
import { listMcpActions, mcpToolName, MCP_TOOLSETS } from '@/modules/actions'

const listRequest = { jsonrpc: '2.0', id: 'list', method: 'tools/list', params: {} } as const
const discoverNames = MCP_TOOLSETS.discover.slice(0, 3).map((id) => `ae_${id.replace(/\./gu, '_')}`)
const names = (body: JsonRpcBody): string[] =>
  ((body.result?.tools ?? []) as Array<{ name: string }>).map((tool) => tool.name)
const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength

async function listWith(scopes: readonly string[], path = '/mcp') {
  const tools: unknown[] = []
  let cursor: string | undefined
  let body: JsonRpcBody
  do {
    const request = new Request(`https://ae.example${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer role-test' },
      body: JSON.stringify({ ...listRequest, params: cursor === undefined ? {} : { cursor } }),
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
    body = await readMcpBody(response)
    expect(body.error).toBeUndefined()
    expect(bytes(body.result)).toBeLessThanOrEqual(40_000)
    tools.push(...(body.result?.tools as unknown[]))
    cursor = body.result?.nextCursor as string | undefined
  } while (cursor !== undefined)
  return { ...body, result: { ...body.result, tools } }
}

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))

describe('MCP role toolsets', () => {
  it('lists exactly public discovery for an anonymous principal, never Operation-level tools', async () => {
    const response = await postMcp(listRequest)
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(names(body)).toEqual(discoverNames)
    expect(names(body)).not.toContain('ae_registry_tools_list')
    expect(names(body)).not.toContain('ae_tool_call')
    expect(names(body).some((name) => name.startsWith('ae_operation_'))).toBe(false)
    // Exact output constraints, including tuple arity, measure 36,035 bytes with shared Problem refs.
    expect(bytes(body.result?.tools)).toBeLessThan(36_500)
    for (const tool of (body.result?.tools ?? []) as Array<Record<string, unknown>>) {
      expect(tool.inputSchema).toMatchObject({ type: 'object', properties: expect.any(Object) })
      expect(tool.outputSchema).toMatchObject({ type: 'object', anyOf: expect.any(Array) })
      const validator = new Validator(tool.outputSchema as Schema, '2020-12')
      expect(validator.validate({ next: [] }).valid).toBe(false)
      expect(validator.validate({ result: { kind: 'made_up' }, next: [] }).valid).toBe(false)
      const problem = { type: 'about:blank', title: 'Invalid input', status: 400, kind: 'INVALID_ARGUMENT', code: 'input_invalid', retryable: false, next: [], source: 'local' }
      expect(validator.validate(problem).valid).toBe(true)
      expect(validator.validate({ ...problem, refs: { callRef: 42 } }).valid).toBe(false)
      expect(validator.validate({ ...problem, requestId: 'request-1' }).valid).toBe(false)
      expect(validator.validate({ ...problem, source: 'remote' }).valid).toBe(false)
      expect(validator.validate({ ...problem, source: 'remote', requestId: 'request-1' }).valid).toBe(true)
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
    const tools = body.result?.tools as Array<Record<string, unknown>>
    // Exact outputs with local refs measure 250,130 bytes here; bound feedback separately.
    expect(bytes(tools.filter(tool => tool.name !== 'ae_feedback_submit'))).toBeLessThan(260_000)
    expect(bytes(tools.find(tool => tool.name === 'ae_feedback_submit'))).toBeLessThan(3_500)
    const whoami = tools.find(tool => tool.name === 'ae_agentAccess_whoami')
    if (whoami === undefined) throw new Error('Expected Account identity Tool')
    const validator = new Validator(whoami.outputSchema as Schema, '2020-12')
    const identity = { kind: 'authenticated', principalRef: 'principal', accountRef: 'account', credentialId: 'credential', applicationRef: 'application', environment: 'sandbox', scopes: ['market_tools:call'], authorityMode: 'spending_policy' }
    expect(validator.validate({ result: identity, next: [] }).valid).toBe(true)
    const incomplete = Object.fromEntries(Object.entries(identity).filter(([key]) => key !== 'credentialId'))
    expect(validator.validate({ result: incomplete, next: [] }).valid).toBe(false)
    expect(validator.validate({ result: { ...identity, unexpected: true }, next: [] }).valid).toBe(false)
    const planRun = tools.find(tool => tool.name === 'ae_tool_plan_run')
    if (planRun === undefined) throw new Error('Expected Plan run Tool')
    const planValidator = new Validator(planRun.outputSchema as Schema, '2020-12')
    expect(planValidator.validate({ result: { kind: 'running', planRef: 'plan-1', state: 'running' }, next: [] }).valid).toBe(true)
    expect(planValidator.validate({ result: { kind: 'running', planRef: 42, state: 'running' }, next: [] }).valid).toBe(false)
    const planGet = tools.find(tool => tool.name === 'ae_tool_plan_get')
    if (planGet === undefined) throw new Error('Expected Plan status Tool')
    const getValidator = new Validator(planGet.outputSchema as Schema, '2020-12')
    const progress = { kind: 'available', planRef: 'plan-1', planDigest: 'digest', state: 'running', approvedTotalAudUnits: '1', currency: 'AUD', exponent: 6, expiresAt: 1, runDeadlineAt: 2, maximumConcurrentNodes: 1, stages: [], nodes: [], dataFlows: [], hold: { status: 'none', settledAudUnits: '0', releasedAudUnits: '0' } }
    expect(getValidator.validate({ result: progress, next: [] }).valid).toBe(true)
    expect(getValidator.validate({ result: { ...progress, approvedTotalAudUnits: 1 }, next: [] }).valid).toBe(false)
    expect(getValidator.validate({ result: { ...progress, approvedTotalAudUnits: 'bad' }, next: [] }).valid).toBe(false)
    const quote = tools.find(tool => tool.name === 'ae_tool_quote')
    if (quote === undefined) throw new Error('Expected Quote Tool')
    const quoteValidator = new Validator(quote.outputSchema as Schema, '2020-12')
    const ownerHandoff = { actor: 'account_owner', reason: 'Connect to continue', destination: '/agent-access' }
    const refused = { kind: 'refused', toolRef: 'tool:test', code: 'grant_not_found', retryable: false, correlationRef: 'correlation:test' }
    for (const handoff of [undefined, ownerHandoff, { ...ownerHandoff, actor: 'ae_support' }, { ...ownerHandoff, actor: 'unknown' }, { ...ownerHandoff, destination: 'https://untrusted.example' }, { ...ownerHandoff, iconUrl: null }, [ownerHandoff]]) {
      const result = { ...refused, ...(handoff === undefined ? {} : { ownerHandoff: handoff }) }
      expect(quoteValidator.validate({ result, next: [] }).valid).toBe(toolQuoteResultSchema.safeParse(result).success)
    }
    expect(tools.find((tool) => tool.name === 'ae_tool_quote')?.annotations).toMatchObject({
      readOnlyHint: false, destructiveHint: false, idempotentHint: false,
    })
    expect(tools.find((tool) => tool.name === 'ae_tool_call')?.annotations).toMatchObject({
      readOnlyHint: false, destructiveHint: true, idempotentHint: true,
    })
  })

  it('advertises strict, complete variants for procure and saved Tool writes', async () => {
    const body = await listWith(['market_tools:call'])
    type InputSchema = {
      type: string
      properties: Record<string, unknown>
      anyOf?: InputSchema[]
      oneOf?: InputSchema[]
      required?: string[]
      additionalProperties?: boolean
    }
    const tools = body.result?.tools as Array<{ name: string; inputSchema: InputSchema }>
    const variants = (schema: InputSchema): InputSchema[] => {
      const children = schema.anyOf ?? schema.oneOf
      return children === undefined ? [schema] : children.flatMap(variants)
    }
    for (const [name, expected] of [
      ['ae_tool_procure', [['kind', 'need'], ['kind', 'toolRef', 'input', 'maxSpendAud', 'idempotencyKey']]],
      ['ae_market_savedTools_save', [['kind', 'toolRef'], ['kind', 'resource'], ['kind', 'id']]],
      ['ae_market_savedTools_remove', [['kind', 'toolRef'], ['kind', 'resource']]],
    ] as const) {
      const schema = tools.find(tool => tool.name === name)?.inputSchema
      if (schema === undefined) throw new Error(`${name} was not listed`)
      expect(schema.type).toBe('object')
      expect(schema.required).toEqual(['kind'])
      const branches = variants(schema)
      expect(branches.map(branch => branch.required?.join(',')).sort()).toEqual([...expected].map(fields => fields.join(',')).sort())
      for (const branch of branches) {
        expect(branch.type).toBe('object')
        expect(branch.additionalProperties).toBe(false)
        for (const field of branch.required ?? []) {
          expect(branch.properties).toHaveProperty(field)
          expect(schema.properties).toHaveProperty(field)
        }
      }
      expect(schema.properties).toHaveProperty('kind')
    }
  })

  it('validates the advertised required fields before executing a protected tool', async () => {
    const quoteTool = vi.fn()
    const save = vi.fn()
    const remove = vi.fn()
    for (const [name, args] of [
      ['ae_tool_procure', { kind: 'exact', toolRef: `operation:v1:${'a'.repeat(64)}`, input: {}, maxSpendAud: '1.00' }],
      ['ae_market_savedTools_save', { kind: 'external_listing' }],
      ['ae_market_savedTools_remove', { kind: 'external_listing' }],
    ] as const) {
      const response = await postMcp({
        jsonrpc: '2.0', id: name, method: 'tools/call',
        params: { name, arguments: args },
      }, {
        authenticate: authenticateWithScopes(['market_tools:call']),
        callService: { quoteTool, callTool: vi.fn(), readCallStatus: vi.fn(), cancelCall: vi.fn(), reconcileCall: vi.fn() },
        savedToolsService: { list: vi.fn(), save, remove },
      }, { authorization: 'Bearer buyer' })
      expect((await readMcpBody(response)).result?.isError).toBe(true)
    }
    expect(quoteTool).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('lists the complete Provider lifecycle only for provider authority, without granting buy', async () => {
    const body = await listWith(['market_supply:manage'])
    const listed = names(body)
    expect(MCP_TOOLSETS.provider).toHaveLength(15)
    for (const actionId of MCP_TOOLSETS.provider) expect(listed).toContain(`ae_${actionId.replace(/\./gu, '_')}`)
    expect(listed).toContain('ae_agentAccess_whoami')
    expect(listed).not.toContain('ae_tool_call')
    expect(listed).not.toContain('ae_agentAccess_balance')
    // Exact Provider outputs with local refs, including search row signals, measure 140,211 bytes.
    expect(bytes(body.result?.tools)).toBeLessThan(141_000)
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
