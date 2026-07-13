import { describe, expect, it } from 'vitest'

import { handleRoutingKernelDescriptorRequest } from '@/modules/routing-kernel/descriptor'

describe('routing kernel descriptor', () => {
  it('retires the legacy routing descriptor without advertising executable projections', async () => {
    const response = handleRoutingKernelDescriptorRequest(new Request('https://routing.example/.well-known/ae-routing.json'))

    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'routing_v1_retired',
        requestApi: '/api/v1/requests',
      },
    })
  })

  it('rejects non-GET methods', () => {
    const response = handleRoutingKernelDescriptorRequest(new Request('https://routing.example/.well-known/ae-routing.json', { method: 'POST' }))
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET')
  })
})
