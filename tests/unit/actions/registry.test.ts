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
  it('does not list the quarantined public inquiry action', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).not.toContain('inquiry.submit')
    expect(findAction('inquiry.submit')).toBeDefined()
    expect(ids).not.toContain('inquiry.readOwnerInbox')
    expect(ids).not.toContain('inquiry.readOwnerThread')
    expect(ids).not.toContain('inquiry.reply')
    expect(ids).not.toContain('inquiry.markRead')
    expect(ids).not.toContain('inquiry.close')
  })
  it('registers the legacy and canonical public registry read actions', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).toContain('registry.list')
    expect(ids).toContain('registry.search')
    expect(ids).toContain('registry.detail')
    expect(ids).toContain('registry.services_list')
    expect(ids).toContain('registry.services_search')
    expect(ids).toContain('registry.services_detail')
  })

  it('accepts opaque Convex pagination cursors without making them unbounded', () => {
    const cursor = 'x'.repeat(304)
    for (const id of ['registry.list', 'registry.services_list']) {
      expect(findAction(id)?.schema.safeParse({ cursor }).success).toBe(true)
    }
    for (const id of ['registry.search', 'registry.services_search']) {
      expect(findAction(id)?.schema.safeParse({ query: 'plumber', cursor }).success).toBe(true)
    }
    expect(findAction('registry.list')?.schema.safeParse({ cursor: 'x'.repeat(513) }).success).toBe(false)
  })


  it('registers route confirmation as one bounded cross-surface action', () => {
    const action = findAction('customerRequest.confirm')
    expect(action).toBeDefined()
    expect(action?.readOnly).toBe(false)
    expect(action?.surfaces).toEqual(['ui', 'http', 'agentJson'])
    expect(action?.parameters.map(({ name }) => name)).toEqual([
      'requestRef', 'revision', 'routeRef', 'idempotencyKey',
    ])
    expect(action?.boundaries.join(' ')).toMatch(/Does not start, book, charge, dispatch, contact, or fulfil/u)
    expect(action?.schema.safeParse({
      requestRef: 'request:one', revision: 2, routeRef: 'route-choice:one', idempotencyKey: 'confirm:one',
      maximumSpendMinor: 1,
    }).success).toBe(false)
  })

  it('registers the complete customer-safe run and recovery surface', () => {
    expect(['customerRequest.run', 'customerRequest.cancel', 'customerRequest.reportProblem', 'customerRequest.inspectEvidence']
      .map((id) => findAction(id)?.id)).toEqual([
        'customerRequest.run', 'customerRequest.cancel', 'customerRequest.reportProblem', 'customerRequest.inspectEvidence',
      ])
    expect(findAction('customerRequest.inspectEvidence')?.readOnly).toBe(true)
    expect(findAction('customerRequest.run')?.boundaries.join(' ')).toMatch(/does not let the caller choose/i)
  })


  it('exposes bounded read actions to the internal answer thread', () => {
    const exposed = listActions().filter((action) => action.surfaces.includes('answerThread')).map((action) => action.id)
    expect(exposed).toContain('registry.search')
    expect(exposed).toContain('registry.detail')
    expect(exposed).not.toContain('sandbox.checkup_quote')
  })

  it('exposes the bounded web discovery observation to the internal answer thread', () => {
    const exposed = listActions().filter((action) => action.surfaces.includes('answerThread')).map((action) => action.id)
    expect(exposed).toContain('web.discover')
    const action = findAction('web.discover')
    expect(action?.readOnly).toBe(true)
    expect(action?.effect).toEqual({
      class: 'observation',
      reversible: true,
      recipientKind: 'none',
      dataClasses: ['query_text', 'location'],
      spendExposure: 'none',
      approval: 'none',
    })
    expect(action?.boundaries.join(' ')).toMatch(/not.*listed|not.*bookable|imported claims/i)
    expect(action?.schema.safeParse({ query: 'funeral parlours in Parramatta' }).success).toBe(true)
  })

  it('exposes MCP actions and keeps the anonymous tier read-only', () => {
    const exposed = listMcpActions()
    expect(exposed.map((action) => action.id)).toEqual([
      'registry.services_list', 'registry.services_search', 'registry.detail',
      'registry.operations.search', 'registry.operations.detail',
      'registry.operations.compare', 'registry.operations.inspectPlan',
      'operation.execute', 'operation.invoke', 'operation.status',
      'operation.cancel', 'operation.reconcile',
      'supply.publish', 'supply.withdraw', 'supply.earnings',
    ])
    expect(exposed.slice(-3).every((action) =>
      action.credentialAdmission?.scope === 'market_supply:manage'
      && action.surfaces.includes('cli')
      && action.surfaces.includes('mcp'))).toBe(true)
    const anonymous = exposed.filter((action) => action.readOnly && action.credentialAdmission === undefined)
    expect(anonymous.map((action) => action.id)).toEqual([
      'registry.services_list', 'registry.services_search', 'registry.detail',
      'registry.operations.search', 'registry.operations.detail',
      'registry.operations.compare', 'registry.operations.inspectPlan',
      'operation.execute',
    ])
    for (const action of anonymous) {
      expect(action.readOnly).toBe(true)
    }
    expect(exposed.find((action) => action.id === 'operation.invoke')?.readOnly).toBe(false)
    expect(exposed.find((action) => action.id === 'operation.status')?.readOnly).toBe(true)
    expect(exposed.find((action) => action.id === 'operation.cancel')?.readOnly).toBe(false)
    expect(exposed.find((action) => action.id === 'operation.reconcile')?.readOnly).toBe(false)
    for (const id of ['operation.invoke', 'operation.status', 'operation.cancel', 'operation.reconcile']) {
      expect(exposed.find((action) => action.id === id)?.surfaces).toEqual(['http', 'mcp', 'cli'])
    }
    expect(exposed.map((action) => mcpToolName(action))).toEqual([
      'ae_registry_services_list', 'ae_registry_services_search', 'ae_registry_detail',
      'ae_registry_operations_search', 'ae_registry_operations_detail',
      'ae_registry_operations_compare', 'ae_registry_operations_inspectPlan',
      'ae_operation_execute', 'ae_operation_invoke', 'ae_operation_status',
      'ae_operation_cancel', 'ae_operation_reconcile',
      'ae_supply_publish', 'ae_supply_withdraw', 'ae_supply_earnings',
    ])
  })
  it('registers supply actions with narrow inputs and output contracts', () => {
    const publish = findAction('supply.publish')
    const withdraw = findAction('supply.withdraw')
    const earnings = findAction('supply.earnings')
    expect(publish?.parameters.map(({ name }) => name)).toEqual([
      'version', 'businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash',
      'source', 'evidenceRefs', 'idempotencyKey',
    ])
    expect(withdraw?.parameters.map(({ name }) => name)).toEqual([
      'businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash',
      'publicationRef', 'publicationRevision', 'idempotencyKey',
    ])
    expect(earnings?.parameters.map(({ name }) => name)).toEqual(['currency'])
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
        description: 'One to four opaque current operation references.',
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

  it('keeps operation execution MCP-only and fail-closed at the action boundary', () => {
    const action = findAction('operation.execute')
    expect(action).toBeDefined()
    expect(action?.surfaces).toEqual(['mcp'])
    expect(action?.readOnly).toBe(true)
    expect(action?.effect).toMatchObject({
      class: 'observation',
      recipientKind: 'none',
      spendExposure: 'none',
      approval: 'none',
    })
    expect(action?.invocationContract.authorityRequirement).toBe('none')
    expect(action?.schema.safeParse({
      operationRef: `operation:v1:${'a'.repeat(64)}`,
      input: { value: 'usd' },
    }).success).toBe(true)
    expect(action?.schema.safeParse({
      operationRef: `operation:v1:${'a'.repeat(64)}`,
      input: {},
      endpointUrl: 'https://attacker.example',
      method: 'POST',
      credentialRef: 'attacker-secret',
    }).success).toBe(false)
    expect(action?.boundaries.join(' ')).toMatch(/keyless|public HTTPS|GET|endpoint|credential/i)
    expect(action?.boundaries.join(' ')).toMatch(/book|pay|dispatch|inquiry|fulfil/i)
    expect(listActions().filter((candidate) => candidate.surfaces.includes('answerThread')).map(({ id }) => id))
      .not.toContain('operation.execute')
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
          offeringRef: 'legacy-offering:adelaide-emergency-plumbing:emergency-pipe-repair',
          revision: 1,
          name: 'Emergency pipe repair',
          category: 'Emergency plumbing',
          summary: 'Urgent local plumbing.',
          serviceAreaSummary: 'Adelaide and nearby suburbs',
          availabilitySummary: 'Hours supplied by owner',
          accessPaths: [
            {
              accessPathRef: 'legacy-access:adelaide-emergency-plumbing:emergency-pipe-repair',
              offeringRevision: 1,
              kind: 'human_request',
              channel: 'ae_inquiry',
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

    const servicesSearch = findAction('registry.services_search')!.outputSchema.safeParse({
      kind: 'ok',
      schemaVersion: 'public-services-api:v2',
      query: 'plumber',
      services: [service],
      pagination: { limit: 1, total: 1, hasMore: false },
    })
    expect(servicesSearch.success).toBe(true)

    const servicesDetail = findAction('registry.services_detail')!.outputSchema.safeParse({
      kind: 'found',
      schemaVersion: 'public-services-api:v2',
      service,
    })
    expect(servicesDetail.success).toBe(true)

    for (const leaked of ['ownerId', 'sourceHash', 'rawContactValue'] as const) {
      expect(findAction('registry.detail')!.outputSchema.safeParse({
        kind: 'found',
        schemaVersion: 'public-business-catalog-api:v2',
        business: { ...business, [leaked]: 'internal-value' },
      }).success, `legacy detail leaked ${leaked}`).toBe(false)
      expect(findAction('registry.services_detail')!.outputSchema.safeParse({
        kind: 'found',
        schemaVersion: 'public-services-api:v2',
        service: { ...service, [leaked]: 'internal-value' },
      }).success, `Service detail leaked ${leaked}`).toBe(false)
      expect(findAction('registry.services_search')!.outputSchema.safeParse({
        kind: 'ok',
        schemaVersion: 'public-services-api:v2',
        services: [{ ...service, [leaked]: 'internal-value' }],
        pagination: { limit: 1, total: 1, hasMore: false },
      }).success, `Service search leaked ${leaked}`).toBe(false)
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

    const servicesSearch = describeActionForAgent(findAction('registry.services_search')!)
    expect(servicesSearch.hasOutputSchema).toBe(true)
    expect(servicesSearch.inputJsonSchema?.type).toBe('object')
    expect(servicesSearch.outputJsonSchema?.type).toBe('object')
    expect(servicesSearch.effect).toEqual(findAction('registry.services_search')!.effect)

    const servicesDetail = describeActionForAgent(findAction('registry.services_detail')!)
    expect(servicesDetail.hasOutputSchema).toBe(true)
    expect(servicesDetail.outputJsonSchema).toBeDefined()

    const submit = describeActionForAgent(findAction('inquiry.submit')!)
    expect(submit.hasOutputSchema).toBe(true)
    expect(submit.outputJsonSchema).toBeDefined()
    expect(submit.inputJsonSchema).toBeDefined()
  })
  it('marks legacy and canonical registry actions as read-only with honest boundaries', () => {
    const list = findAction('registry.list')
    expect(list).toBeDefined()
    expect(list?.readOnly).toBe(true)
    expect(list?.surfaces).toContain('agentJson')
    expect(list?.surfaces).not.toContain('answerThread')

    const search = findAction('registry.search')
    expect(search).toBeDefined()
    expect(search?.readOnly).toBe(true)
    expect(search?.surfaces).toContain('answerThread')
    expect(search?.boundaries.join(' ')).toMatch(/book|charge|dispatch|inquiry/i)
    expect(search?.parameters.map((p) => p.name)).toContain('query')

    const detail = findAction('registry.detail')
    expect(detail).toBeDefined()
    expect(detail?.readOnly).toBe(true)
    expect(detail?.surfaces).toContain('answerThread')
    expect(detail?.parameters.map((p) => p.name)).toContain('slug')

    for (const id of ['registry.services_list', 'registry.services_search', 'registry.services_detail']) {
      const action = findAction(id)
      expect(action).toBeDefined()
      expect(action?.readOnly).toBe(true)
      expect(action?.surfaces).toContain('agentJson')
      expect(action?.surfaces).not.toContain('answerThread')
      expect(action?.parameters.map((p) => p.name)).toContain(id.endsWith('list') ? 'limit' : id.endsWith('search') ? 'query' : 'slug')
    }
  })



  it('keeps the registry action descriptors free of internal architecture vocabulary', () => {
    const legacyDescriptors = [
      describeActionForAgent(findAction('registry.search')!),
      describeActionForAgent(findAction('registry.detail')!),
    ]
    expect(JSON.stringify(legacyDescriptors)).not.toMatch(/MCP|OpenAPI|callable|autonomous|agent-native|DTO|fixture/i)

    const serviceDescriptors = [
      describeActionForAgent(findAction('registry.services_search')!),
      describeActionForAgent(findAction('registry.services_detail')!),
    ]
    const serviceProse = serviceDescriptors.map(({ id, name, summary, boundaries, parameters }) => ({
      id,
      name,
      summary,
      boundaries,
      parameters,
    }))
    expect(JSON.stringify(serviceProse)).not.toMatch(/MCP|OpenAPI|autonomous|DTO|fixture/i)
    expect(serviceProse.map(({ name }) => name)).toEqual([
      'Search published business portfolios',
      'Read a published business portfolio',
    ])
    expect(serviceProse.map(({ summary }) => summary).join(' ')).toMatch(/does not (?:search|return).*Agent Services|not an Agent Service/u)
  })

  it('keeps inquiry.submit outside the internal answer-thread tools', () => {
    const action = findAction('inquiry.submit')
    expect(action).toBeDefined()
    expect(action?.readOnly).toBe(false)
    expect(action?.surfaces).not.toContain('answerThread')
  })

  it('carries boundary-honest descriptors on the agent-facing tool', () => {
    const action = findAction('inquiry.submit')
    const descriptor = describeActionForAgent(action!)
    expect(descriptor.boundaries.length).toBeGreaterThan(0)
    expect(descriptor.summary).toMatch(/inquiry/i)
    expect(descriptor.parameters.map((p) => p.name)).toContain('target.businessId')
    expect(descriptor.parameters.map((p) => p.name)).toContain('target.offeringRef')
    expect(descriptor.parameters.map((p) => p.name)).toContain('target.businessSlug')
    expect(descriptor.parameters.map((p) => p.name)).not.toContain('target.serviceId')
    expect(descriptor.parameters.map((p) => p.name)).not.toContain('target.serviceSlug')
    expect(descriptor.parameters.map((p) => p.name)).not.toContain('target.capabilityKind')
    expect(descriptor.parameters.map((p) => p.name)).toContain('body')
  })

  it('refuses booking/payment/dispatch in the boundaries', () => {
    const descriptor = describeActionForAgent(findAction('inquiry.submit')!)
    const joined = descriptor.boundaries.join(' ')
    expect(joined).toMatch(/book/)
    expect(joined).toMatch(/charge|pay/)
    expect(joined).toMatch(/dispatch/)
  })

  it('keeps owner-only operations outside the public action registry', () => {
    expect(findAction('inquiry.readOwnerInbox')).toBeUndefined()
    expect(findAction('inquiry.readOwnerThread')).toBeUndefined()
    expect(findAction('inquiry.reply')).toBeUndefined()
    expect(findAction('inquiry.markRead')).toBeUndefined()
    expect(findAction('inquiry.close')).toBeUndefined()
  })

  it('rejects inquiry.submit body and contact fields beyond the route-boundary max length', () => {
    const schema = findAction('inquiry.submit')!.schema
    const target = {
      businessId: 'business:plumbing-demo',
      offeringRef: 'offering:plumbing-demo:emergency-plumbing',
    }
    const baseInput = {
      target,
      body: 'Need help with a leak.',
      contact: { email: 'person@example.test' },
      expectedDigest: `sha256:${'0'.repeat(64)}`,
    }

    expect(schema.safeParse(baseInput).success).toBe(true)
    expect(schema.safeParse({ ...baseInput, body: 'a'.repeat(2_000) }).success).toBe(true)
    expect(schema.safeParse({ ...baseInput, body: 'a'.repeat(2_001) }).success).toBe(false)
    expect(schema.safeParse({ ...baseInput, contact: { name: 'a'.repeat(200) } }).success).toBe(true)
    expect(schema.safeParse({ ...baseInput, contact: { name: 'a'.repeat(201) } }).success).toBe(false)
    expect(schema.safeParse({ ...baseInput, contact: { email: `${'a'.repeat(241)}@example.test` } }).success).toBe(true)
    expect(schema.safeParse({ ...baseInput, contact: { email: `${'a'.repeat(242)}@example.test` } }).success).toBe(false)
    expect(schema.safeParse({ ...baseInput, contact: { phone: '1'.repeat(32) } }).success).toBe(true)
    expect(schema.safeParse({ ...baseInput, contact: { phone: '1'.repeat(33) } }).success).toBe(false)
  })

  it('accepts an exact price ceiling and refuses malformed ceilings', () => {
    for (const id of ['registry.search', 'registry.services_search']) {
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

    const serviceParameters = describeActionForAgent(findAction('registry.services_search')!)
      .parameters.map((parameter) => parameter.name)
    expect(serviceParameters).toContain('maxPrice')
    expect(serviceParameters).toContain('hasPrice')
    const boundaries = descriptor.boundaries.join(' ')
    expect(boundaries).toMatch(/maxPrice/)
    expect(boundaries).toMatch(/exact currency units and exponent/i)
    expect(boundaries).not.toMatch(/minor units/i)
    expect(boundaries).toMatch(/quoted on request/i)
    expect(boundaries).toMatch(/hasPrice/)
  })
})
