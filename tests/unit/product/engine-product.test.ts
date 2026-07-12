import { describe, expect, it } from 'vitest'

import { ENGINE_LIFECYCLE, ROUTING_OPERATIONS, routeRequestJson } from '@/modules/product/engine-product'

describe('engine product contract', () => {
  it('projects the executable kernel lifecycle without a wedge-specific step', () => {
    expect(ENGINE_LIFECYCLE.map((step) => step.id)).toEqual(['request', 'quote', 'approve', 'run', 'inspect'])
    expect(ROUTING_OPERATIONS.map((operation) => operation.id)).toEqual(['route', 'authorize', 'execute', 'inspect', 'reconcile', 'cancel'])
  })

  it('creates the same route input shape accepted by the HTTP kernel', () => {
    expect(JSON.parse(routeRequestJson('Purchase one parcel label.', 'network:au-first', 'AUD', 1_500))).toEqual({
      protocolVersion: 'ae-routing:v1',
      operation: 'route',
      input: {
        networkId: 'network:au-first',
        query: 'Purchase one parcel label.',
        constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
      },
    })
  })
})
