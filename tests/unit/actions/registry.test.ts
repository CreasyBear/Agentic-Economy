import { describe, expect, it } from 'vitest'

import {
  describeActionForAgent,
  findAction,
  listActions,
  listMcpActions,
  mcpToolName,
} from '@/modules/actions'
import { projectPublicServicesPage, type PublicBusinessCatalogApiV2Page } from '@/modules/registry/public'

describe('action registry', () => {
  it('does not list deleted public inquiry or customer-request actions', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).not.toContain('inquiry.submit')
    expect(findAction('inquiry.submit')).toBeUndefined()
    expect(ids).not.toContain('inquiry.readOwnerInbox')
    expect(ids).not.toContain('inquiry.readOwnerThread')
    expect(ids).not.toContain('inquiry.reply')
    expect(ids).not.toContain('inquiry.markRead')
    expect(ids).not.toContain('inquiry.close')
  })
  it('registers the canonical public registry read actions', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).toContain('registry.search')
    expect(ids).toContain('registry.detail')
    expect(ids).not.toContain('registry.list')
    expect(ids).not.toContain('registry.services_list')
    expect(ids).not.toContain('registry.services_search')
    expect(ids).not.toContain('registry.services_detail')
  })

  it('accepts opaque Convex pagination cursors without making them unbounded', () => {
    const cursor = 'x'.repeat(304)
    expect(findAction('registry.search')?.schema.safeParse({ query: 'plumber', cursor }).success).toBe(true)
    expect(findAction('registry.search')?.schema.safeParse({ query: 'plumber', cursor: 'x'.repeat(513) }).success).toBe(false)
  })


  it('does not register deleted customer-request actions', () => {
    expect(findAction('customerRequest.confirm')).toBeUndefined()
    expect(listActions().map((candidate) => candidate.id)).not.toContain('customerRequest.confirm')
  })

  it('does not keep deleted customer-request run and recovery ids', () => {
    expect(['customerRequest.run', 'customerRequest.cancel', 'customerRequest.reportProblem', 'customerRequest.inspectEvidence']
      .map((id) => findAction(id))).toEqual([undefined, undefined, undefined, undefined])
  })


  it('exposes exactly the bounded operation actions to chat', () => {
    const exposed = listActions().filter((action) => action.surfaces.includes('chat')).map((action) => action.id)
    expect(exposed).toEqual([
      'registry.operations.search',
      'registry.operations.detail',
      'registry.operations.compare',
      'registry.operations.inspectPlan',
      'operation.invoke',
    ])
  })

  it('does not expose retired web discovery', () => {
    expect(findAction('web.discover')).toBeUndefined()
  })

  it('exposes MCP actions and keeps the anonymous tier read-only', () => {
    const exposed = listMcpActions()
    expect(exposed.map((action) => action.id)).toEqual([
      'registry.search', 'registry.detail',
      'registry.operations.search', 'registry.operations.detail',
      'registry.operations.compare', 'registry.operations.inspectPlan',
      'agentAccess.whoami',
      'agentAccess.balance', 'agentAccess.activity',
      'marketDemand.record', 'marketDemand.list', 'marketDemand.status',
      'operation.invoke', 'operation.list', 'operation.status',
      'operation.cancel', 'operation.reconcile',
      'supply.status', 'supply.publish', 'supply.withdraw',
      'supply.recheck', 'supply.republish', 'supply.earnings',
      'supply.connection.list', 'supply.connection.detail',
      'supply.connection.connect', 'supply.connection.reconnect',
      'supply.connection.revoke', 'supply.connection.retryCleanup',
    ])
    expect(exposed.slice(-12).every((action) =>
      action.credentialAdmission?.scope === 'market_supply:manage'
      && action.surfaces.includes('mcp'))).toBe(true)
    expect(exposed.slice(-12).every((action) => action.surfaces.includes('cli'))).toBe(true)
    const anonymous = exposed.filter((action) => action.readOnly && action.credentialAdmission === undefined)
    expect(anonymous.map((action) => action.id)).toEqual([
      'registry.search', 'registry.detail',
      'registry.operations.search', 'registry.operations.detail',
      'registry.operations.compare', 'registry.operations.inspectPlan',
    ])
    for (const action of anonymous) {
      expect(action.readOnly).toBe(true)
    }
    expect(exposed.find((action) => action.id === 'operation.invoke')?.readOnly).toBe(false)
    expect(exposed.find((action) => action.id === 'operation.status')?.readOnly).toBe(true)
    expect(exposed.find((action) => action.id === 'operation.cancel')?.readOnly).toBe(false)
    expect(exposed.find((action) => action.id === 'operation.reconcile')?.readOnly).toBe(false)
    for (const id of ['operation.invoke', 'operation.status', 'operation.cancel', 'operation.reconcile']) {
      expect(exposed.find((action) => action.id === id)?.surfaces).toEqual(
        id === 'operation.invoke' ? ['http', 'mcp', 'cli', 'chat'] : ['http', 'mcp', 'cli'],
      )
    }
    expect(exposed.map((action) => mcpToolName(action))).toEqual([
      'ae_registry_search', 'ae_registry_detail',
      'ae_registry_operations_search', 'ae_registry_operations_detail',
      'ae_registry_operations_compare', 'ae_registry_operations_inspectPlan',
      'ae_agentAccess_whoami',
      'ae_agentAccess_balance', 'ae_agentAccess_activity',
      'ae_marketDemand_record', 'ae_marketDemand_list', 'ae_marketDemand_status',
      'ae_operation_invoke', 'ae_operation_list', 'ae_operation_status',
      'ae_operation_cancel', 'ae_operation_reconcile',
      'ae_supply_status', 'ae_supply_publish', 'ae_supply_withdraw',
      'ae_supply_recheck', 'ae_supply_republish', 'ae_supply_earnings',
      'ae_supply_connection_list', 'ae_supply_connection_detail',
      'ae_supply_connection_connect', 'ae_supply_connection_reconnect',
      'ae_supply_connection_revoke', 'ae_supply_connection_retryCleanup',
    ])
  })
  it('exposes current agent identity without exposing bearer material', async () => {
    const action = findAction('agentAccess.whoami')
    expect(action?.surfaces).toEqual(['http', 'mcp', 'cli'])
    expect(action?.credentialAdmission?.scope).toBe('market_operations:invoke')
    expect(action?.credentialAdmission?.anyScopes).toEqual([
      'market_operations:invoke',
      'market_supply:manage',
    ])
    expect(action?.readOnly).toBe(true)

    const result = await action?.run({
      data: {},
      context: {
        caller: 'cli',
        agentAccessPrincipal: {
          principalId: 'prn_current',
          ownerId: 'acc_owner',
          credentialId: 'key_current',
          applicationRef: 'agentic-economy',
          environment: 'sandbox',
          scopes: ['market_operations:invoke'],
          authorityMode: 'inspect_only',
        },
      },
    })
    expect(result).toEqual({
      kind: 'authenticated',
      principalRef: 'prn_current',
      accountRef: 'acc_owner',
      credentialId: 'key_current',
      applicationRef: 'agentic-economy',
      environment: 'sandbox',
      scopes: ['market_operations:invoke'],
      authorityMode: 'inspect_only',
    })
    expect(JSON.stringify(result)).not.toContain('Bearer')
    expect(action?.outputSchema.safeParse({ ...result, accessToken: 'secret' }).success).toBe(false)
  })
  it('registers supply actions with narrow inputs and output contracts', () => {
    const publish = findAction('supply.publish')
    const withdraw = findAction('supply.withdraw')
    const status = findAction('supply.status')
    const recheck = findAction('supply.recheck')
    const republish = findAction('supply.republish')
    const earnings = findAction('supply.earnings')
    const connectionList = findAction('supply.connection.list')
    const connectionDetail = findAction('supply.connection.detail')
    const connectionConnect = findAction('supply.connection.connect')
    const connectionReconnect = findAction('supply.connection.reconnect')
    const connectionRevoke = findAction('supply.connection.revoke')
    const connectionRetryCleanup = findAction('supply.connection.retryCleanup')
    expect(status?.parameters.map(({ name }) => name)).toEqual(['businessId', 'offeringRef'])
    expect(publish?.parameters.map(({ name }) => name)).toEqual([
      'version', 'businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash',
      'source', 'evidenceRefs', 'idempotencyKey',
    ])
    expect(withdraw?.parameters.map(({ name }) => name)).toEqual([
      'businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash',
      'publicationRef', 'publicationRevision', 'idempotencyKey',
    ])
    expect(earnings?.parameters.map(({ name }) => name)).toEqual(['currency'])
    expect(recheck?.parameters).toEqual(withdraw?.parameters)
    expect(republish?.parameters).toEqual(withdraw?.parameters)
    for (const action of [status, publish, withdraw, recheck, republish, earnings, connectionList, connectionDetail, connectionConnect, connectionReconnect, connectionRevoke, connectionRetryCleanup]) {
      expect(action?.surfaces).toEqual(['http', 'mcp', 'cli'])
      expect(action?.credentialAdmission?.scope).toBe('market_supply:manage')
    }
    expect(publish?.schema.safeParse({
      version: 'supply-publication:v1',
      businessId: 'business_1',
      offeringRef: 'offering_1',
      offeringRevision: 1,
      offeringSourceHash: 'sha256:source',
      source: {},
      evidenceRefs: [],
      idempotencyKey: 'publish-command-1',
      endpointUrl: 'https://attacker.example',
    }).success).toBe(false)
    expect(publish?.outputSchema).toBeDefined()
    expect(withdraw?.outputSchema).toBeDefined()
    expect(earnings?.outputSchema).toBeDefined()
    expect(connectionList?.readOnly).toBe(true)
    expect(connectionDetail?.readOnly).toBe(true)
    expect(connectionConnect?.readOnly).toBe(false)
    expect(connectionReconnect?.schema).toBe(connectionRevoke?.schema)
    expect(connectionRevoke?.invocationContract.retryClass).toBe('reconcile_before_retry')
    expect(connectionRetryCleanup?.invocationContract.safeContinuations).toEqual(['supply.connection.detail'])
  })

  it('describes operation composition arrays from their canonical schemas', () => {
    const compare = findAction('registry.operations.compare')
    const inspectPlan = findAction('registry.operations.inspectPlan')
    expect(compare?.parameters).toEqual([
      {
        name: 'operationRefs',
        type: 'array',
        description: 'One to four opaque current operation references.',
        required: true,
      },
    ])
    expect(inspectPlan?.parameters).toEqual([
      {
        name: 'operationRefs',
        type: 'array',
        description: 'Required array of 1–4 opaque current operation references. Send { "operationRefs": ["operation:v1:…"] }, never a singular operationRef field.',
        required: true,
      },
      {
        name: 'mappingRefs',
        type: 'array',
        description: 'Registered opaque mapping references.',
        required: false,
      },
      {
        name: 'expiresInMs',
        type: 'number',
        description: 'Ephemeral inspection lifetime, bounded to 24 hours.',
        required: false,
      },
    ])
  })

  it('keeps operation invocation on the authenticated action boundary', () => {
    const action = findAction('operation.invoke')
    expect(action).toBeDefined()
    expect(action?.surfaces).toEqual(['http', 'mcp', 'cli', 'chat'])
    expect(action?.readOnly).toBe(false)
    expect(action?.boundaries.join(' ')).toMatch(/AE-issued bearer key|provider authority|consequential approval/i)
    expect(action?.boundaries.join(' ')).toMatch(/server-side|never returned/i)
    expect(listActions().filter((candidate) => candidate.surfaces.includes('chat')).map(({ id }) => id))
      .toContain('operation.invoke')
  })

  it('carries output validation schemas on every action', () => {
    for (const action of listActions()) {
      expect(action.outputSchema).toBeDefined()
    }
  })

  it('declares effect metadata on every registered action', () => {
    for (const action of listActions()) {
      expect(action.effect).toBeDefined()
    }
  })

  it('keeps read-only actions non-consequential', () => {
    for (const action of listActions().filter(({ readOnly }) => readOnly)) {
      expect(['observation', 'comparison_quote']).toContain(action.effect.class)
      expect(action.effect.approval).toBe('none')
      expect(action.effect.spendExposure).toBe('none')
    }
  })

  /**
   * The Offering projection publishes `businessId` as a stable public
   * reference, exactly as the UCP manifest already does, so it is no longer
   * treated as leaked identity. The canonical Service projection carries the
   * same public reference only through its published links and offering refs.
   * Every other internal identifier must still be rejected by the strict
   * output schemas.
   */
  it('accepts the public Offering and Service DTOs and rejects internal identity', () => {
    const business: PublicBusinessCatalogApiV2Page['page'][number] = {
      schemaVersion: 'public-business-catalog-api:v2',
      businessId: 'business:adelaide-emergency-plumbing',
      slug: 'adelaide-emergency-plumbing',
      name: 'Adelaide Emergency Plumbing',
      category: 'Emergency plumbing',
      businessContext: { kind: 'local_human', suburb: 'Adelaide', stateTerritory: 'SA' },
      publicUrl: '/adelaide-emergency-plumbing',
      trustTier: 'claimed',
      photos: [],
      observedAt: 1,
      disposition: 'current',
      offerings: [
        {
          offeringRef: 'legacy-offering:adelaide-emergency-plumbing:listed-offering',
          revision: 1,
          name: 'Listed offering',
          category: 'Emergency plumbing',
          summary: 'Urgent local plumbing.',
          serviceAreaSummary: 'Adelaide and nearby suburbs',
          availabilitySummary: 'Hours supplied by owner',
          accessPaths: [
            {
              accessPathRef: 'legacy-access:adelaide-emergency-plumbing:listed-offering',
              offeringRevision: 1,
              kind: 'human_request',
              channel: 'website',
              disclosure: 'Use the inquiry form for a first contact.',
            },
          ],
          support: { integrated: false, aeSupportedAction: false },
        },
      ],
      accessSummary: { humanRequest: true, externalOperation: false, aeSupportedAction: false },
    }

    const search = findAction('registry.search')!.outputSchema.safeParse({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      query: 'plumber',
      items: [business],
      pagination: { limit: 1, total: 1, hasMore: false },
    })
    expect(search.success).toBe(true)

    const detail = findAction('registry.detail')!.outputSchema.safeParse({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v2',
      business,
    })
    expect(detail.success).toBe(true)

    const service = projectPublicServicesPage({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      page: [business],
      isDone: true,
      continueCursor: '',
    }).services[0]
    if (service === undefined) throw new Error('Expected a projected Service.')

    for (const leaked of ['ownerId', 'sourceHash', 'rawContactValue'] as const) {
      expect(findAction('registry.detail')!.outputSchema.safeParse({
        kind: 'found',
        schemaVersion: 'public-business-catalog-api:v2',
        business: { ...business, [leaked]: 'internal-value' },
      }).success, `legacy detail leaked ${leaked}`).toBe(false)
    }
  })

  it('exposes schema metadata on agent-facing descriptors', () => {
    const search = describeActionForAgent(findAction('registry.search')!)
    expect(search.hasOutputSchema).toBe(true)
    expect(search.inputJsonSchema?.type).toBe('object')
    expect(search.outputJsonSchema?.type).toBe('object')
    expect(search.effect).toEqual(findAction('registry.search')!.effect)

    const detail = describeActionForAgent(findAction('registry.detail')!)
    expect(detail.hasOutputSchema).toBe(true)
    expect(detail.outputJsonSchema).toBeDefined()

    const invoke = describeActionForAgent(findAction('operation.invoke')!)
    expect(invoke.hasOutputSchema).toBe(true)
    expect(invoke.outputJsonSchema).toBeDefined()
    expect(invoke.inputJsonSchema).toBeDefined()
  })
  it('marks canonical registry actions as read-only with honest boundaries', () => {
    const search = findAction('registry.search')
    expect(search).toBeDefined()
    expect(search?.readOnly).toBe(true)
    expect(search?.surfaces).not.toContain('chat')
    expect(search?.surfaces).toContain('mcp')
    expect(search?.boundaries.join(' ')).toMatch(/book|charge|dispatch|inquiry/i)
    expect(search?.parameters.map((p) => p.name)).toContain('query')

    const detail = findAction('registry.detail')
    expect(detail).toBeDefined()
    expect(detail?.readOnly).toBe(true)
    expect(detail?.surfaces).not.toContain('chat')
    expect(detail?.parameters.map((p) => p.name)).toContain('slug')

    expect(findAction('registry.list')).toBeUndefined()
    expect(findAction('registry.services_list')).toBeUndefined()
    expect(findAction('registry.services_search')).toBeUndefined()
    expect(findAction('registry.services_detail')).toBeUndefined()
  })



  it('keeps the registry action descriptors free of internal architecture vocabulary', () => {
    const canonicalDescriptors = [
      describeActionForAgent(findAction('registry.search')!),
      describeActionForAgent(findAction('registry.detail')!),
    ]
    expect(JSON.stringify(canonicalDescriptors)).not.toMatch(/MCP|OpenAPI|callable|autonomous|agent-native|DTO|fixture/i)
  })

  it('keeps operation.invoke off the anonymous MCP tier', () => {
    const action = findAction('operation.invoke')
    expect(action).toBeDefined()
    expect(action?.readOnly).toBe(false)
    expect(listMcpActions().filter((candidate) => candidate.readOnly && candidate.credentialAdmission === undefined).map(({ id }) => id))
      .not.toContain('operation.invoke')
  })

  it('carries boundary-honest descriptors on the agent-facing invoke tool', () => {
    const action = findAction('operation.invoke')
    if (action === undefined) throw new Error('operation.invoke missing')
    const descriptor = describeActionForAgent(action)
    expect(descriptor.boundaries.length).toBeGreaterThan(0)
    expect(descriptor.parameters.map((p) => p.name)).toContain('operationRef')
    expect(descriptor.parameters.map((p) => p.name)).toContain('input')
    expect(descriptor.parameters.map((p) => p.name)).toContain('idempotencyKey')
  })

  it('refuses booking/payment/dispatch in registry search boundaries', () => {
    const descriptor = describeActionForAgent(findAction('registry.search')!)
    const joined = descriptor.boundaries.join(' ')
    expect(joined).toMatch(/book/)
    expect(joined).toMatch(/charge|pay/)
    expect(joined).toMatch(/dispatch/)
  })

  it('keeps deleted inquiry operations outside the public action registry', () => {
    expect(findAction('inquiry.submit')).toBeUndefined()
    expect(findAction('inquiry.readOwnerInbox')).toBeUndefined()
    expect(findAction('inquiry.readOwnerThread')).toBeUndefined()
    expect(findAction('inquiry.reply')).toBeUndefined()
    expect(findAction('inquiry.markRead')).toBeUndefined()
    expect(findAction('inquiry.close')).toBeUndefined()
  })

  it('accepts an exact price ceiling and refuses malformed ceilings', () => {
    for (const id of ['registry.search']) {
      const schema = findAction(id)!.schema

      expect(schema.safeParse({ query: 'plumber' }).success).toBe(true)
      expect(schema.safeParse({
        query: 'plumber',
        maxPrice: { currency: 'USD', units: '25000', exponent: 2 },
        hasPrice: true,
      }).success).toBe(true)
      expect(schema.safeParse({
        query: 'plumber',
        maxPrice: { currency: 'USD', units: '-1', exponent: 2 },
      }).success).toBe(false)
      expect(schema.safeParse({
        query: 'plumber',
        maxPrice: { currency: 'USD', units: '250.5', exponent: 2 },
      }).success).toBe(false)
      expect(schema.safeParse({ query: 'plumber', hasPrice: 'yes' }).success).toBe(false)
    }
  })

  /**
   * The filter is only safe to use if the descriptor says what it does to
   * supply that quotes on request. An agent that assumes a budget removes
   * unpriced options would read the narrowed page as the whole market.
   */
  it('tells an agent that a budget never removes quoted-on-request supply', () => {
    const descriptor = describeActionForAgent(findAction('registry.search')!)
    const parameters = descriptor.parameters.map((parameter) => parameter.name)

    expect(parameters).toContain('maxPrice')
    expect(parameters).toContain('hasPrice')
    const boundaries = descriptor.boundaries.join(' ')
    expect(boundaries).toMatch(/maxPrice/)
    expect(boundaries).toMatch(/exact currency units and exponent/i)
    expect(boundaries).not.toMatch(/minor units/i)
    expect(boundaries).toMatch(/quoted on request/i)
    expect(boundaries).toMatch(/hasPrice/)
  })
})
