import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import {
  capabilityProbeAuthorityMatches,
  recordCapabilityProbeResultHandler,
  readCurrentCapabilityProbeAuthority,
} from '../../../convex/capabilitySupplyProbes'
import schema from '../../../convex/schema'
import {
  convexModules as modules,
  publishedBusinessOwner,
} from '../../helpers/convex-fixtures'

describe('capability supply readiness authority', () => {
  it('derives readiness authority only from the current resource owner and pinned publisher', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'readiness-authority')
    const refs = await backend.run(async (ctx) => {
      const business = await ctx.db.get(businessId)
      if (business === null) throw new Error('business missing')
      const owner = await ctx.db.get(business.ownerId)
      if (owner?.canonicalPrincipalRef === undefined || owner.canonicalAccountRef === undefined) {
        throw new Error('canonical owner missing')
      }
      const publicationId = await ctx.db.insert('capabilityPublications', {
        publicationRef: 'publication:readiness-authority',
        operationRef: 'operation:readiness-authority',
        revision: 1,
        businessId,
        networkId: 'ae:public',
        runtimeEnvironment: 'production',
        capabilityId: 'reference.lookup',
        version: 1,
        contractDigest: `sha256:${'1'.repeat(64)}`,
        sourceKind: 'ae_envelope',
        sourceRevision: '1',
        sourceDigest: `sha256:${'2'.repeat(64)}`,
        publisherRef: owner.canonicalPrincipalRef,
        authorityMode: 'provider_owned',
        provenanceDigest: `sha256:${'3'.repeat(64)}`,
        offeringId: 'offering:readiness-authority',
        bindingId: 'binding:readiness-authority',
        disposition: 'current',
        credentialState: 'unobserved',
        healthState: 'unobserved',
        readinessEvidenceRefs: [],
        registrationEvidenceRefs: ['test:readiness-authority'],
        createdAt: 1,
        updatedAt: 1,
      })
      const principal = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', owner.canonicalPrincipalRef as never))
        .unique()
      const account = await ctx.db.query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', owner.canonicalAccountRef as never))
        .unique()
      if (principal === null || account === null) throw new Error('canonical authority missing')
      const ownership = await ctx.db.query('accountOwnerships')
        .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
        .unique()
      if (ownership === null) throw new Error('canonical ownership missing')
      return {
        businessId,
        ownerId: owner._id,
        publicationId,
        principalId: principal._id,
        accountId: account._id,
        ownershipId: ownership._id,
        principalRef: owner.canonicalPrincipalRef,
        accountRef: owner.canonicalAccountRef,
      }
    })

    const current = await backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:readiness-authority',
        expectedRevision: 1,
        now: Date.now(),
      }))
    expect(current).toMatchObject({
      mode: 'human_owner',
      publisherPrincipalRef: refs.principalRef,
      owningAccountRef: refs.accountRef,
    })
    if (current === null) throw new Error('human authority missing')

    await expect(backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:missing',
        expectedRevision: 1,
        now: Date.now(),
      }))).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(refs.publicationId, { disposition: 'withdrawn' }))
    await expect(backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:readiness-authority',
        expectedRevision: 1,
        now: Date.now(),
      }))).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(refs.publicationId, { disposition: 'current' }))
    await backend.run(async (ctx) => await ctx.db.patch(refs.businessId, { suppressedAt: Date.now() }))
    await expect(backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:readiness-authority',
        expectedRevision: 1,
        now: Date.now(),
      }))).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(refs.businessId, { suppressedAt: undefined }))
    await backend.run(async (ctx) => await ctx.db.patch(refs.ownerId, { canonicalAccountRef: undefined }))
    await expect(backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:readiness-authority',
        expectedRevision: 1,
        now: Date.now(),
      }))).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(refs.ownerId, { canonicalAccountRef: refs.accountRef }))

    await backend.run(async (ctx) => await ctx.db.patch(refs.accountId, { revision: 2 }))
    const revised = await backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:readiness-authority',
        expectedRevision: 1,
        now: Date.now(),
      }))
    expect(revised).not.toBeNull()
    if (revised === null) throw new Error('revised authority missing')
    expect(capabilityProbeAuthorityMatches(current, revised)).toBe(false)
    await backend.run(async (ctx) => await ctx.db.patch(refs.accountId, { revision: 1 }))

    await backend.run(async (ctx) => await ctx.db.patch(refs.ownershipId, { lifecycle: 'ended' }))
    await expect(backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:readiness-authority',
        expectedRevision: 1,
        now: Date.now(),
      }))).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(refs.ownershipId, { lifecycle: 'active' }))

    await backend.run(async (ctx) => await ctx.db.patch(refs.principalId, { lifecycle: 'suspended' }))
    await expect(backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:readiness-authority',
        expectedRevision: 1,
        now: Date.now(),
      }))).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(refs.principalId, { lifecycle: 'active' }))

    await backend.run(async (ctx) => {
      await ctx.db.patch(refs.publicationId, { publisherRef: 'credential:forged' })
    })
    await expect(backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:readiness-authority',
        expectedRevision: 1,
        now: Date.now(),
      }))).resolves.toBeNull()
  })

  it('pins an exact agent grant and denies revocation, expiry, generation drift, and cross-account attribution', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'readiness-agent-authority')
    const now = Date.now()
    const seeded = await backend.run(async (ctx) => {
      const business = await ctx.db.get(businessId)
      if (business === null) throw new Error('business missing')
      const owner = await ctx.db.get(business.ownerId)
      if (owner?.canonicalAccountRef === undefined) throw new Error('canonical owner missing')
      const principalId = 'agent:readiness-publisher'
      const grantRef = 'agent-grant:readiness-publisher'
      const policyDigest = `sha256:${'4'.repeat(64)}`
      const expiresAt = now + 300_000
      const agentId = await ctx.db.insert('agentAccessPrincipals', {
        principalId,
        ownerId: owner.canonicalAccountRef,
        credentialId: 'credential:readiness-publisher',
        applicationRef: 'application:readiness-publisher',
        environment: 'production',
        scopes: ['market_supply:manage'],
        authorityMode: 'bounded_mandate',
        grantGeneration: 7,
        policyDigest,
        lifecycle: 'active',
        expiresAt,
        recordedAt: 1,
        lastSeenAt: 1,
      })
      const grantId = await ctx.db.insert('agentAccessGrants', {
        format: 'ae.agent-access-grant:v1',
        grantRef,
        principalId,
        ownerId: owner.canonicalAccountRef,
        applicationRef: 'application:readiness-publisher',
        credentialId: 'credential:readiness-publisher',
        environment: 'production',
        operationAccess: 'all_admitted',
        authorityMode: 'bounded_mandate',
        policy: {
          format: 'ae.agent-access-policy:v1',
          operationAccess: 'all_admitted',
          environment: 'production',
          budget: {
            budgetPolicyRef: 'budget:readiness-publisher',
            generation: 7,
            currency: 'AUD',
            exponent: 2,
            maximumSpendPerInvocation: { currency: 'AUD', units: '0', exponent: 2 },
            maximumDailySpend: { currency: 'AUD', units: '0', exponent: 2 },
            maximumMonthlySpend: { currency: 'AUD', units: '0', exponent: 2 },
            maximumConcurrentInvocations: 1,
          },
          rate: {
            ratePolicyRef: 'rate:readiness-publisher',
            generation: 7,
            maximumCallsPerMinute: 1,
            maximumCallsPerHour: 1,
          },
        },
        budgetPolicyRef: 'budget:readiness-publisher',
        ratePolicyRef: 'rate:readiness-publisher',
        lifecycle: 'active',
        generation: 7,
        policyDigest,
        createdAt: 1,
        updatedAt: 1,
        expiresAt,
      })
      const publicationId = await ctx.db.insert('capabilityPublications', {
        publicationRef: 'publication:readiness-agent-authority',
        operationRef: 'operation:readiness-agent-authority',
        revision: 1,
        businessId,
        networkId: 'ae:public',
        runtimeEnvironment: 'production',
        capabilityId: 'reference.lookup',
        version: 1,
        contractDigest: `sha256:${'1'.repeat(64)}`,
        sourceKind: 'ae_envelope',
        sourceRevision: '1',
        sourceDigest: `sha256:${'2'.repeat(64)}`,
        publisherRef: principalId,
        authorityMode: 'provider_owned',
        provenanceDigest: `sha256:${'3'.repeat(64)}`,
        offeringId: 'offering:readiness-agent-authority',
        bindingId: 'binding:readiness-agent-authority',
        disposition: 'current',
        credentialState: 'unobserved',
        healthState: 'unobserved',
        readinessEvidenceRefs: [],
        registrationEvidenceRefs: ['test:readiness-agent-authority'],
        createdAt: 1,
        updatedAt: 1,
      })
      return { agentId, grantId, publicationId, principalId, grantRef, accountRef: owner.canonicalAccountRef }
    })
    const read = async (at = Date.now()) => await backend.run(async (ctx) =>
      await readCurrentCapabilityProbeAuthority(ctx, {
        publicationRef: 'publication:readiness-agent-authority',
        expectedRevision: 1,
        now: at,
      }))

    const pinned = await read()
    expect(pinned).toMatchObject({
      mode: 'agent_grant',
      publisherPrincipalRef: seeded.principalId,
      owningAccountRef: seeded.accountRef,
      grantRef: seeded.grantRef,
      grantGeneration: 7,
    })
    if (pinned === null) throw new Error('agent authority missing')
    expect(capabilityProbeAuthorityMatches(pinned, pinned)).toBe(true)

    await expect(read(now + 400_000)).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(seeded.agentId, { expiresAt: now + 100_000 }))
    await expect(read(now + 150_000)).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(seeded.agentId, { expiresAt: undefined }))
    await expect(read()).resolves.toMatchObject({ mode: 'agent_grant', grantRef: seeded.grantRef })
    await backend.run(async (ctx) => await ctx.db.patch(seeded.agentId, { expiresAt: now + 300_000 }))
    await backend.run(async (ctx) => await ctx.db.patch(seeded.agentId, { scopes: [] }))
    await expect(read()).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(seeded.agentId, { scopes: ['market_supply:manage'] }))

    await backend.run(async (ctx) => await ctx.db.patch(seeded.grantId, { lifecycle: 'revoked' }))
    await expect(read()).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(seeded.grantId, { lifecycle: 'active', generation: 8 }))
    await expect(read()).resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(seeded.grantId, { generation: 7, expiresAt: now - 1 }))
    await expect(read()).resolves.toBeNull()
    await backend.run(async (ctx) => {
      await ctx.db.patch(seeded.grantId, { expiresAt: now + 300_000 })
      const agent = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', seeded.principalId)).unique()
      if (agent === null) throw new Error('agent missing')
      await ctx.db.patch(agent._id, { ownerId: 'acc_cross_account' })
    })
    await expect(read()).resolves.toBeNull()

    await expect(backend.run(async (ctx) =>
      await recordCapabilityProbeResultHandler(ctx, {
        publicationRef: 'publication:readiness-agent-authority',
        expectedRevision: 1,
        targetDigest: `sha256:${'5'.repeat(64)}`,
        requestDigest: `sha256:${'6'.repeat(64)}`,
        outcome: 'healthy',
        credentialState: 'ready',
        healthState: 'healthy',
        observedAt: now,
        validUntil: now + 60_000,
        evidenceRefs: ['test:readiness-agent-authority'],
        resourceAuthority: pinned,
      }))).resolves.toEqual({ kind: 'refused', reason: 'target_changed' })
  })
})
