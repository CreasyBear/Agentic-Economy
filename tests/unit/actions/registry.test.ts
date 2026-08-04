import { describe, expect, it } from 'vitest'

import {
  describeActionForAgent,
  findAction,
  listActions,
  listMcpActions,
  mcpToolName,
} from '@/modules/actions'

describe('action registry', () => {
  it('registers only the public inquiry action', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).toContain('inquiry.submit')
    expect(ids).not.toContain('inquiry.readOwnerInbox')
    expect(ids).not.toContain('inquiry.readOwnerThread')
    expect(ids).not.toContain('inquiry.reply')
    expect(ids).not.toContain('inquiry.markRead')
    expect(ids).not.toContain('inquiry.close')
  })

  it('registers the registry read actions', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).toContain('registry.list')
    expect(ids).toContain('registry.search')
    expect(ids).toContain('registry.detail')
  })

  it('accepts opaque Convex pagination cursors without making them unbounded', () => {
    const cursor = 'x'.repeat(304)
    expect(findAction('registry.list')?.schema.safeParse({ cursor }).success).toBe(true)
    expect(findAction('registry.search')?.schema.safeParse({ query: 'plumber', cursor }).success).toBe(true)
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

  it('registers storefront import for owner UI and HTTP but not quiet agent tools', () => {
    const action = findAction('storefront.importDraft')
    expect(action).toBeDefined()
    expect(action?.readOnly).toBe(false)
    expect(action?.surfaces).toEqual(['ui', 'http'])
    expect(action?.parameters.map((parameter) => parameter.name)).toEqual(['websiteUrl', 'abn'])
  })

  it('exposes the bounded read and quote actions to the internal answer thread', () => {
    const exposed = listActions().filter((action) => action.surfaces.includes('answerThread')).map((action) => action.id)
    expect(exposed).toContain('registry.search')
    expect(exposed).toContain('registry.detail')
    expect(exposed).toContain('sandbox.checkup_quote')
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

  it('exposes exactly the anonymous read-only tier to the MCP host', () => {
    const exposed = listMcpActions()
    expect(exposed.map((action) => action.id)).toEqual([
      'registry.services_list', 'registry.services_search', 'registry.detail',
      'registry.operations.search', 'registry.operations.detail',
      'registry.operations.compare', 'registry.operations.inspectPlan',
      'sandbox.checkup_quote',
    ])
    for (const action of exposed) {
      expect(action.readOnly).toBe(true)
    }
    expect(exposed.map((action) => mcpToolName(action))).toEqual([
      'ae_registry_services_list', 'ae_registry_services_search', 'ae_registry_detail',
      'ae_registry_operations_search', 'ae_registry_operations_detail',
      'ae_registry_operations_compare', 'ae_registry_operations_inspectPlan',
      'ae_sandbox_checkup_quote',
    ])
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
   * treated as leaked identity. Every other internal identifier must still be
   * rejected by the strict output schema.
   */
  it('accepts the public Offering DTO and rejects internal identity beyond the published reference', () => {
    const business = {
      schemaVersion: 'public-business-catalog-api:v2',
      businessId: 'business:adelaide-emergency-plumbing',
      slug: 'adelaide-emergency-plumbing',
      name: 'Adelaide Emergency Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Adelaide',
      stateTerritory: 'SA',
      publicUrl: '/adelaide-emergency-plumbing',
      trustTier: 'claimed',
      photos: [] as Array<{ url: string; alt: string }>,
      observedAt: 1,
      disposition: 'current' as const,
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
              kind: 'human_request' as const,
              channel: 'ae_inquiry' as const,
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

    for (const leaked of ['ownerId', 'sourceHash', 'rawContactValue'] as const) {
      expect(findAction('registry.detail')!.outputSchema.safeParse({
        kind: 'found',
        schemaVersion: 'public-business-catalog-api:v2',
        business: { ...business, [leaked]: 'internal-value' },
      }).success, leaked).toBe(false)
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

    const submit = describeActionForAgent(findAction('inquiry.submit')!)
    expect(submit.hasOutputSchema).toBe(true)
    expect(submit.outputJsonSchema).toBeDefined()
    expect(submit.inputJsonSchema).toBeDefined()
  })

  it('marks the registry actions as read-only with honest boundaries', () => {
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
    expect(findAction('registry.services_list')?.surfaces).not.toContain('answerThread')
    expect(findAction('registry.services_search')?.surfaces).not.toContain('answerThread')
  })


  it('keeps the registry action descriptors free of internal architecture vocabulary', () => {
    const search = describeActionForAgent(findAction('registry.search')!)
    const detail = describeActionForAgent(findAction('registry.detail')!)
    const joined = JSON.stringify([search, detail])
    expect(joined).not.toMatch(/MCP|OpenAPI|callable|autonomous|agent-native|DTO|fixture/i)
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

  it('accepts a whole positive price ceiling and refuses a ceiling nobody can pay', () => {
    const schema = findAction('registry.search')!.schema

    expect(schema.safeParse({ query: 'plumber' }).success).toBe(true)
    expect(schema.safeParse({ query: 'plumber', maxPriceMinor: 25_000, hasPrice: true }).success).toBe(true)
    expect(schema.safeParse({ query: 'plumber', maxPriceMinor: 0 }).success).toBe(false)
    expect(schema.safeParse({ query: 'plumber', maxPriceMinor: -1 }).success).toBe(false)
    expect(schema.safeParse({ query: 'plumber', maxPriceMinor: 250.5 }).success).toBe(false)
    expect(schema.safeParse({ query: 'plumber', hasPrice: 'yes' }).success).toBe(false)
  })

  /**
   * The filter is only safe to use if the descriptor says what it does to
   * supply that quotes on request. An agent that assumes a budget removes
   * unpriced options would read the narrowed page as the whole market.
   */
  it('tells an agent that a budget never removes quoted-on-request supply', () => {
    const descriptor = describeActionForAgent(findAction('registry.search')!)
    const parameters = descriptor.parameters.map((parameter) => parameter.name)

    expect(parameters).toContain('maxPriceMinor')
    expect(parameters).toContain('hasPrice')

    const boundaries = descriptor.boundaries.join(' ')
    expect(boundaries).toMatch(/maxPriceMinor/)
    expect(boundaries).toMatch(/minor units/i)
    expect(boundaries).toMatch(/quoted on request/i)
    expect(boundaries).toMatch(/hasPrice/)
  })
})
