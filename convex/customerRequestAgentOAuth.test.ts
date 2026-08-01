/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const grant = {
  grantRef: 'device:convex-cas',
  flow: 'device_code' as const,
  clientId: 'client-convex',
  requestedScopes: ['customer_requests:create', 'customer_requests:inspect_only'],
  deviceCodeHash: 'device-hash',
  userCodeHash: 'user-hash',
  status: 'pending' as const,
  createdAt: 1_000,
  expiresAt: 601_000,
  nextPollAt: 1_000,
  displayName: 'Convex persistence test',
}

describe('Customer Request OAuth Convex persistence adapter', () => {
  it('persists full machine state and accepts only one expected-status CAS', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(api.customerRequestAgentOAuth.insertGrant, { grant })
    const stored = await backend.query(api.customerRequestAgentOAuth.getGrantByRef, { grantRef: grant.grantRef })
    expect(stored).toMatchObject(grant)

    const first = await backend.mutation(api.customerRequestAgentOAuth.updateGrant, {
      grantRef: grant.grantRef,
      expectedStatus: 'pending',
      patch: { status: 'approved', ownerId: 'owner-convex', keyId: 'key-convex', approvedAt: 1_001 },
    })
    const second = await backend.mutation(api.customerRequestAgentOAuth.updateGrant, {
      grantRef: grant.grantRef,
      expectedStatus: 'pending',
      patch: { status: 'approved', ownerId: 'owner-race', keyId: 'key-race', approvedAt: 1_002 },
    })
    expect(first).toMatchObject({ status: 'approved', ownerId: 'owner-convex' })
    expect(second).toBeNull()
  })
})
