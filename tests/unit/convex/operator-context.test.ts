import { describe, expect, it } from 'vitest'

import { api } from '../../../convex/_generated/api'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  publishedBusinessOwner,
} from '../../helpers/convex-fixtures'

describe('operator context', () => {
  it('admits a canonical owner to owner and developer surfaces', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'operator-context-owner')

    await expect(fixture.owner.query(api.operatorContext.readCurrent, {})).resolves.toEqual({
      kind: 'authorized',
      userId: 'user_operator-context-owner',
      principalRef: fixture.canonicalPrincipalRef,
      accountRef: fixture.canonicalAccountRef,
      allowedSurfaces: ['owner', 'developer'],
    })
  })

  it('adds admin only for the caller current active admin membership', async () => {
    const backend = convexTestWithMarketComponents()
    const caller = await ownerAdmin(backend, 'user_operator-context-admin')

    await expect(caller.query(api.operatorContext.readCurrent, {})).resolves.toMatchObject({
      kind: 'authorized',
      userId: 'user_operator-context-admin',
      allowedSurfaces: ['owner', 'admin', 'developer'],
    })
  })

  it('fails closed for an authenticated identity without canonical ownership', async () => {
    const backend = convexTestWithMarketComponents()
    const caller = backend.withIdentity({
      subject: 'user_operator-context-stranger',
      issuer: 'https://identity.example',
      exp: 8_000_000_000,
    })

    await expect(caller.query(api.operatorContext.readCurrent, {})).resolves.toEqual({
      kind: 'denied',
      reason: 'canonical_owner_required',
    })
  })
})
