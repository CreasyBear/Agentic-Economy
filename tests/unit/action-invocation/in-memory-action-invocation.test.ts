import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readPublicRegistryBusinessDetail } = vi.hoisted(() => ({
  readPublicRegistryBusinessDetail: vi.fn(),
}))

vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicRegistryBusinessDetail,
  readPublicRegistryCatalogPage: vi.fn(),
  readPublicRegistrySearchPage: vi.fn(),
}))

import { findAction } from '@/modules/actions'
import {
  createInMemoryActionInvocationTracer,
  type ActionInvocationOrigin,
} from '@/modules/action-invocation'

describe('in-memory Action Invocation tracer', () => {
  beforeEach(() => {
    readPublicRegistryBusinessDetail.mockReset()
    readPublicRegistryBusinessDetail.mockResolvedValue({
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No published business found for that slug.',
    })
  })

  it('runs the same registered source action for exact Request-owned and standalone lineage', async () => {
    const action = findAction('registry.detail')
    expect(action).toBeDefined()

    const tracer = createInMemoryActionInvocationTracer({
      action: action!,
      now: () => '2026-07-19T06:00:00.000Z',
      nextInvocationRef: (() => {
        let sequence = 0
        return () => `dev:action-invocation:${++sequence}`
      })(),
    })
    const origins: readonly ActionInvocationOrigin[] = [
      {
        kind: 'request_owned',
        requestRef: 'mock:request:perth-plumber',
        revision: 3,
      },
      {
        kind: 'standalone',
        callerRef: 'mock:caller:external-agent',
        principalRef: 'mock:principal:joel',
      },
    ]

    const views = await Promise.all(
      origins.map((origin) =>
        tracer.invoke({
          origin,
          input: { slug: 'mock-development-listing' },
          context: {},
        }),
      ),
    )

    expect(readPublicRegistryBusinessDetail).toHaveBeenCalledTimes(2)
    expect(readPublicRegistryBusinessDetail).toHaveBeenNthCalledWith(1, {
      slug: 'mock-development-listing',
    })
    expect(readPublicRegistryBusinessDetail).toHaveBeenNthCalledWith(2, {
      slug: 'mock-development-listing',
    })
    expect(views).toEqual([
      {
        invocationRef: 'dev:action-invocation:1',
        invocationVersion: 1,
        origin: origins[0],
        action: { id: 'registry.detail', contractVersion: 'registry.detail:v1' },
        desired: { state: 'invoke' },
        observedResolution: {
          state: 'succeeded',
          result: {
            kind: 'not_found',
            code: 'business_not_found',
            reason: 'No published business found for that slug.',
          },
        },
        freshness: {
          state: 'current',
          observedAt: '2026-07-19T06:00:00.000Z',
        },
        control: { state: 'terminal' },
      },
      {
        invocationRef: 'dev:action-invocation:2',
        invocationVersion: 1,
        origin: origins[1],
        action: { id: 'registry.detail', contractVersion: 'registry.detail:v1' },
        desired: { state: 'invoke' },
        observedResolution: {
          state: 'succeeded',
          result: {
            kind: 'not_found',
            code: 'business_not_found',
            reason: 'No published business found for that slug.',
          },
        },
        freshness: {
          state: 'current',
          observedAt: '2026-07-19T06:00:00.000Z',
        },
        control: { state: 'terminal' },
      },
    ])
    expect(tracer.inspect('dev:action-invocation:1')).toEqual(views[0])
    expect(tracer.inspect('dev:action-invocation:missing')).toBeUndefined()

    console.log(JSON.stringify({
      label: 'MOCK/DEVELOPMENT ONLY - no production effect or persistence',
      input: { slug: 'mock-development-listing' },
      invocationViews: views,
    }, null, 2))
  })
})
