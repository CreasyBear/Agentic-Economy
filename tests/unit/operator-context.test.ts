import { describe, expect, it } from 'vitest'

import {
  OperatorSurfaceForbiddenError,
  admitOperatorContext,
  operatorSurfaceForPath,
  type OperatorContext,
} from '@/lib/operator/operator-context'

const owner: OperatorContext = {
  kind: 'authorized',
  userId: 'user_owner',
  principalRef: 'prn_owner',
  accountRef: 'acc_owner',
  allowedSurfaces: ['owner', 'developer'],
}

describe('operator route admission', () => {
  it.each([
    ['/owner/operations', 'owner'],
    ['/agent-access', 'owner'],
    ['/agent-access/authorize', 'owner'],
    ['/activity', 'owner'],
    ['/admin/index-health', 'admin'],
    ['/developers/discovery', 'developer'],
  ] as const)('maps %s to its protected surface', (pathname, surface) => {
    expect(operatorSurfaceForPath(pathname)).toBe(surface)
  })

  it('returns the context only when the requested surface is authorized', () => {
    expect(admitOperatorContext(owner, '/owner/operations')).toBe(owner)
    expect(admitOperatorContext(owner, '/developers/discovery')).toBe(owner)
  })

  it('rejects a disallowed surface before a route can continue', () => {
    expect(() => admitOperatorContext(owner, '/admin/index-health')).toThrow(OperatorSurfaceForbiddenError)
  })

  it('fails closed when canonical owner context is unavailable', () => {
    expect(() => admitOperatorContext(
      { kind: 'denied', reason: 'canonical_owner_required' },
      '/owner/operations',
    )).toThrow(OperatorSurfaceForbiddenError)
  })
})
