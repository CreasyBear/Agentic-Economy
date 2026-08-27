import {
  authenticateWithScopes,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  defineAction,
  listActions,
  listMcpActions,
  mcpToolName,
} from '@/modules/actions'
import { registryDetailAction } from '@/modules/registry/registry.actions'

describe('MCP host adapter tools/list', () => {
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
    ])
    expect(expectedToolNames).not.toContain('ae_operation_invoke')
    expect(expectedToolNames).not.toContain('ae_operation_execute')
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
    expect(inspectPlan?.description).toContain('operationRefs')
    expect(inspectPlan?.description).toContain('not a singular operationRef')
    expect(inspectPlan?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        operationRefs: expect.objectContaining({
          type: 'array',
          minItems: 1,
          maxItems: 4,
        }),
      }),
    }))
    expect(inspectPlan?.inputSchema).not.toEqual(expect.objectContaining({
      required: expect.arrayContaining(['operationRef']),
    }))
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
})
