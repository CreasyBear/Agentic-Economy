import { beforeEach, describe, expect, it, vi } from 'vitest'

const authorityMocks = vi.hoisted(() => ({
  resolveBusinessActor: vi.fn(),
  readCanonicalCompatibilityOwner: vi.fn(),
  readActiveAdminMembership: vi.fn(),
}))

vi.mock('../../../convex/authz', () => authorityMocks)
vi.mock('../../../convex/sourceWriteAdmission', () => ({
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))

import { createBusinessOfferingHandler } from '../../../convex/catalogOfferingMutations'
import { payoutAuthorityAllowed } from '../../../convex/moneyPayoutTransferShared'

const actor = {
  kind: 'authenticated_owner' as const,
  clerkUserId: 'legacy-owner-locator',
  canonicalPrincipalRef: `prn_${'1'.repeat(32)}`,
  canonicalAccountRef: `acc_${'2'.repeat(32)}`,
  legacyOwnerId: 'owners:defensive',
  authorityRevision: {
    binding: 1,
    credential: 1,
    principal: 1,
    account: 1,
    access: 1,
    currentOwnership: 1,
    currentOwnerPrincipal: 1,
    compatibilityUpdatedAt: 1,
  },
  authorityProvenance: {
    providerNamespace: 'clerk/user' as const,
    bindingRef: `eib_${'3'.repeat(32)}`,
    credentialRef: `crd_${'4'.repeat(32)}`,
    credentialGeneration: 1,
    accessKind: 'ownership' as const,
    accessRef: `own_${'5'.repeat(32)}`,
    currentOwnershipRef: `own_${'5'.repeat(32)}`,
    resolvedAt: 1,
  },
}

describe('interactive consequence defensive denials', () => {
  beforeEach(() => {
    authorityMocks.resolveBusinessActor.mockReset().mockResolvedValue(actor)
    authorityMocks.readCanonicalCompatibilityOwner.mockReset().mockResolvedValue(null)
    authorityMocks.readActiveAdminMembership.mockReset()
  })

  it('catalog fails closed if the canonical compatibility owner disappears', async () => {
    const ctx = {
      db: { get: vi.fn() },
      auth: { getUserIdentity: vi.fn() },
      scheduler: {},
    }
    await expect(createBusinessOfferingHandler(ctx as never, {
      businessId: 'businesses:defensive' as never,
      offeringRef: 'offering:defensive',
      operationKey: 'catalog:defensive',
      correlationId: 'catalog:defensive',
      facts: {
        name: 'Defensive fixture',
        category: 'testing',
        summary: 'Canonical owner disappearance.',
      },
    })).resolves.toMatchObject({ kind: 'error', code: 'wrong_owner' })
    expect(ctx.db.get).not.toHaveBeenCalled()
  })

  it('catalog fails closed if the owned business disappears', async () => {
    authorityMocks.readCanonicalCompatibilityOwner.mockResolvedValue({
      _id: 'owners:defensive',
    })
    const ctx = {
      db: { get: vi.fn(async () => null) },
      auth: { getUserIdentity: vi.fn() },
      scheduler: {},
    }
    await expect(createBusinessOfferingHandler(ctx as never, {
      businessId: 'businesses:defensive' as never,
      offeringRef: 'offering:defensive',
      operationKey: 'catalog:defensive',
      correlationId: 'catalog:defensive',
      facts: {
        name: 'Defensive fixture',
        category: 'testing',
        summary: 'Business disappearance.',
      },
    })).resolves.toMatchObject({ kind: 'error', code: 'wrong_owner' })
  })

  it('payout fails closed if the exact compatibility owner disappears', async () => {
    await expect(payoutAuthorityAllowed({
      auth: { getUserIdentity: vi.fn() },
      db: {
        normalizeId: vi.fn(),
        get: vi.fn(),
      },
      scheduler: {},
    } as never, 'businesses:defensive', actor.canonicalPrincipalRef)).resolves.toBe(false)
  })
})
