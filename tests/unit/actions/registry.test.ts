import { describe, expect, it } from 'vitest'

import {
  describeActionForAgent,
  findAction,
  listActions,
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

  it('registers storefront import for owner UI and HTTP but not quiet agent tools', () => {
    const action = findAction('storefront.importDraft')
    expect(action).toBeDefined()
    expect(action?.readOnly).toBe(false)
    expect(action?.surfaces).toEqual(['ui', 'http'])
    expect(action?.parameters.map((parameter) => parameter.name)).toEqual(['websiteUrl', 'abn'])
  })

  it('exposes only registry search and detail to the internal answer thread', () => {
    const exposed = listActions().filter((action) => action.surfaces.includes('answerThread')).map((action) => action.id)
    expect(exposed).toEqual(['registry.search', 'registry.detail'])
  })

  it('carries output validation schemas on every action', () => {
    for (const action of listActions()) {
      expect(action.outputSchema).toBeDefined()
    }
  })

  it('accepts slug-addressed public catalog DTOs and rejects internal business identity', () => {
    const business = {
      slug: 'adelaide-emergency-plumbing',
      name: 'Adelaide Emergency Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Adelaide',
      stateTerritory: 'SA',
      publicUrl: '/adelaide-emergency-plumbing',
      trustTier: 'claimed',
      publicStatus: 'published' as const,
      indexStatus: 'not_queued',
      discoveryStatus: 'degraded',
      schemaVersion: 'public-business-catalog-api:v1',
      updatedAt: 1,
      photos: [] as Array<{ url: string; alt: string }>,
      services: [
        {
          slug: 'emergency-pipe-repair',
          name: 'Emergency pipe repair',
          category: 'Emergency plumbing',
          summary: 'Urgent local plumbing.',
          serviceArea: 'Adelaide and nearby suburbs',
          hoursOrUnknown: 'Hours supplied by owner',
          firstRequest: {
            mode: 'inquiry_available',
            publicDisclosure: 'Use the inquiry form for a first contact.',
            publicChannel: 'public_business_contact',
          },
          status: 'published' as const,
          capabilities: [{ kind: 'phone_inquiry', status: 'available' }],
        },
      ],
    }

    const search = findAction('registry.search')!.outputSchema.safeParse({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v1',
      query: 'plumber',
      items: [business],
      pagination: { limit: 1, total: 1, hasMore: false },
    })
    expect(search.success).toBe(true)

    const detail = findAction('registry.detail')!.outputSchema.safeParse({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v1',
      business,
    })
    expect(detail.success).toBe(true)

    expect(findAction('registry.detail')!.outputSchema.safeParse({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v1',
      business: { ...business, businessId: 'business:adelaide-emergency-plumbing' },
    }).success).toBe(false)
  })

  it('exposes schema metadata on agent-facing descriptors', () => {
    const search = describeActionForAgent(findAction('registry.search')!)
    expect(search.hasOutputSchema).toBe(true)
    expect(search.inputJsonSchema?.type).toBe('object')
    expect(search.outputJsonSchema?.type).toBe('object')

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
    expect(descriptor.parameters.map((p) => p.name)).toContain('target.serviceId')
    expect(descriptor.parameters.map((p) => p.name)).toContain('target.businessSlug')
    expect(descriptor.parameters.map((p) => p.name)).toContain('target.serviceSlug')
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
      serviceId: 'service:business:plumbing-demo:emergency-plumbing',
      capabilityKind: 'phone_inquiry',
    }
    const baseInput = { target, body: 'Need help with a leak.', contact: { email: 'person@example.test' } }

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
})
