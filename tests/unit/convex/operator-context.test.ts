import { describe, expect, it } from 'vitest'

import { api } from '../../../convex/_generated/api'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'
import { canonicalDigest } from '@/modules/common/canonical-digest'

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

  it('admits an active admin without granting owner access', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await activeAdminWithoutOwnership(backend, 'user_operator-context-admin-only')

    await expect(fixture.caller.query(api.operatorContext.readCurrent, {})).resolves.toEqual({
      kind: 'authorized',
      userId: 'user_operator-context-admin-only',
      principalRef: fixture.principalRef,
      allowedSurfaces: ['admin', 'developer'],
    })
  })
})

async function activeAdminWithoutOwnership(backend: ConvexFixtureBackend, subject: string) {
  const identity = {
    subject,
    issuer: 'https://identity.example',
    tokenIdentifier: `token_${subject}`,
    exp: 8_000_000_000,
  }
  const suffix = canonicalDigest({
    format: 'test-admin-only-principal:v1',
    tokenIdentifier: identity.tokenIdentifier,
  }).slice('sha256:'.length, 'sha256:'.length + 32)
  const principalRef = `prn_${suffix}`

  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef,
      kind: 'human',
      displayName: `${subject} admin`,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef: `eib_${suffix}`,
      principalRef,
      providerNamespace: 'clerk/user',
      providerIdentifier: identity.tokenIdentifier,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:${principalRef}`,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('adminMemberships', {
      clerkUserId: subject,
      tokenIdentifier: identity.tokenIdentifier,
      role: 'support',
      state: 'active',
      grantedBy: 'test-fixture',
      grantedAt: 1,
    })
  })

  return { caller: backend.withIdentity(identity), principalRef }
}
