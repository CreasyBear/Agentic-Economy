import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findAction, resolveActionContract } from '@/modules/actions'
import { buildComparisonRouteReadback } from '@/routes/compare'
import { handleCompareRequest } from '@/routes/api.compare'
import { createComparisonOfferingReadPort } from '@/modules/comparison/comparison.functions'

const selections = [
  {
    businessId: 'legacy-business:plumbing-demo',
    offeringRef: 'legacy-offering:plumbing-demo:diagnostic-plumbing',
    offeringRevision: 1,
    projectionObservedAt: 100,
  },
  {
    businessId: 'legacy-business:fremantle-coastal-electrical',
    offeringRef: 'legacy-offering:fremantle-coastal-electrical:electrical-fault-repairs',
    offeringRevision: 1,
    projectionObservedAt: 100,
  },
] as const

const validBody = {
  selections,
  priorities: ['professional_service:v1:lowest_total_price'],
} as const

describe('fixed public comparison agent route', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
  })

  afterEach(() => {
    delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  })

  it('registers one anonymous, authority-free and replayable comparison action', () => {
    const action = findAction('comparison.compare')
    expect(action).toBeDefined()
    expect(action?.readOnly).toBe(true)
    expect(action?.surfaces).toEqual(['http', 'agentJson'])
    expect(resolveActionContract(action!)).toMatchObject({
      consequenceClass: 'read_only',
      authorityRequirement: 'none',
      retryClass: 'replayable',
    })
  })

  it('deep-agrees with the actual human comparison application result', async () => {
    const response = await handleCompareRequest(request(validBody))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')

    const human = await buildComparisonRouteReadback(
      {
        selection: selections.map((selection) => JSON.stringify(selection)),
        priority: [...validBody.priorities],
      },
      createComparisonOfferingReadPort(),
    )
    expect(human.kind).toBe('ready')
    if (human.kind !== 'ready') return

    expect(await response.json()).toEqual(human.comparison)
  })

  it.each([
    ['invalid JSON', '{'],
    ['unknown key', JSON.stringify({ ...validBody, actionId: 'inquiry.submit' })],
    ['duplicate selection', JSON.stringify({
      selections: [selections[0], selections[0]],
      priorities: [],
    })],
    ['fifth selection', JSON.stringify({
      selections: Array.from({ length: 5 }, (_, index) => ({
        ...selections[0],
        businessId: `business:${index}`,
        offeringRef: `offering:${index}`,
      })),
      priorities: [],
    })],
    ['fourth priority', JSON.stringify({
      selections,
      priorities: [
        'professional_service:v1:lowest_total_price',
        'machine_data:v1:lowest_request_price',
        'machine_data:v1:no_authentication_preferred',
        'machine_data:v1:graphql_preferred',
      ],
    })],
  ])('returns 400 for %s', async (_label, body) => {
    const response = await handleCompareRequest(request(body))
    expect(response.status).toBe(400)
  })

  it('returns 413 before parsing an oversized body', async () => {
    const response = await handleCompareRequest(new Request('https://ae.example/api/compare', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(20_000),
      },
      body: JSON.stringify(validBody),
    }))
    expect(response.status).toBe(413)
  })

  it('returns ordinary unavailable selections as a 200 unranked comparison', async () => {
    const response = await handleCompareRequest(request({
      selections: [
        ...selections,
        {
          businessId: 'business:missing',
          offeringRef: 'offering:missing',
          offeringRevision: 1,
          projectionObservedAt: 100,
        },
      ],
      priorities: [],
    }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: 'offering-comparison:v1',
      refusedSelectionCount: 1,
      ordering: { kind: 'unranked', reason: 'no_priority' },
    })
  })
})

function request(body: unknown): Request {
  return new Request('https://ae.example/api/compare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
