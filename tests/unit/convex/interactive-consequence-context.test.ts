import { convexTest } from 'convex-test'
import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { api } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import {
  runOwnerSupplyReadiness,
  runOwnerSupplyTest,
} from '../../../convex/capabilitySupplyOwnerSupply'
import { interactiveCredentialExpiryNonce } from '../../../convex/interactiveCredentialLifecycle'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { convexModules as modules, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const draftSource = { definitionUrl: 'https://provider.example/openapi.json', environment: 'sandbox', kind: 'openapi' } as const
const draftSourceDigest = `sha256:${'1'.repeat(64)}`
const draftSelector = { method: 'get', path: '/canonical-owner' }
const draftFacts = {
  title: 'Canonical authority Operation',
  description: 'An authority-context regression fixture.',
  category: 'testing',
  sourceKind: 'openapi' as const,
  sourceDescriptorJson: stableStringify(draftSource),
  sourceDigest: draftSourceDigest,
  sourceRevision: 'openapi:canonical-owner',
  candidateRef: canonicalDigest({ sourceDigest: draftSourceDigest, selector: draftSelector }),
  sourceSelectorJson: stableStringify(draftSelector),
}

describe('interactive consequence authority', () => {
  it('source-native draft accepts exact canonical ownership', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'catalog-canonical-owner')
    const input = {
      businessId,
      operationKey: 'catalog:canonical-owner:create',
      correlationId: 'catalog:canonical-owner:create',
      ...draftFacts,
    }
    const command = await withSourceWrite('catalog_publish', input)

    const first = await owner.mutation(api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft, command)
    const replay = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', input),
    )

    if (first.kind !== 'saved') throw new Error(`catalog_valid_owner_failed:${first.kind}`)
    expect(first).toMatchObject({ kind: 'saved', sourceDigest: draftFacts.sourceDigest })
    expect(replay).toMatchObject({
      kind: 'replayed',
      offeringRef: first.offeringRef,
      candidateRef: draftFacts.candidateRef,
    })
    await expect(
      backend.run((ctx) => ctx.db.query('businessOfferings').collect()),
    ).resolves.toHaveLength(1)
    const operations = await backend.run((ctx) => ctx.db.query('operationKeys').collect())
    expect(operations).toHaveLength(3)
    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorRef: expect.stringMatching(/^prn_[a-f0-9]{32}$/u),
        key: input.operationKey,
      }),
    ]))
  })

  it('source-native draft rejects hostile authority substitutions', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'catalog-account-a')
    const { owner: accountBOwner } = await publishedBusinessOwner(backend, 'catalog-account-b')


    const command = await withSourceWrite('catalog_publish', {
      businessId,
      operationKey: 'catalog:cross-account-substitution',
      correlationId: 'catalog:cross-account-substitution',
      ...draftFacts,
    })
    await expect(
      accountBOwner.mutation(api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft, command),
    ).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
    await expect(
      backend.run((ctx) => ctx.db.query('businessOfferings').collect()),
    ).resolves.toEqual([])
    await expect(
      backend.run((ctx) => ctx.db.query('sourceWriteNonces').collect()),
    ).resolves.toEqual([expect.objectContaining({
      operationKey: command.operationKey,
      consumedAt: expect.any(Number),
    })])

    await expect(accountBOwner.action(
      api.capabilitySupplyOwnerSupply.runOwnerSupplyReadiness,
      {
        businessId,
        offeringRef: 'offering:request-substitution',
        offeringRevision: 1,
        offeringSourceHash: 'source:request-substitution',
        publicationRef: 'publication:request-substitution',
        publicationRevision: 1,
        operationKey: 'request-substitution',
      },
    )).resolves.toEqual({
      step: 'readiness',
      state: 'refused',
      refusal: 'authorization_denied',
    })

    for (const lifecycle of ['revoked', 'expired'] as const) {
      const lifecycleBackend = convexTest(schema, modules)
      const slug = `catalog-${lifecycle}`
      const { businessId: lifecycleBusinessId, owner } = await publishedBusinessOwner(
        lifecycleBackend,
        slug,
      )
      await lifecycleBackend.run(async (ctx) => {
        const binding = await ctx.db
          .query('externalIdentityBindings')
          .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
            .eq('providerNamespace', 'clerk/user')
            .eq('providerIdentifier', `https://identity.example|user_${slug}`))
          .unique()
        if (binding === null) throw new Error('catalog_binding_fixture_missing')
        const credential = await ctx.db
          .query('credentials')
          .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
            .eq('bindingRef', binding.bindingRef)
            .eq('generation', binding.credentialGeneration)
            .eq('lifecycle', 'active'))
          .unique()
        if (credential === null) throw new Error('catalog_credential_fixture_missing')
        if (lifecycle === 'revoked') {
          await ctx.db.patch(credential._id, { lifecycle: 'revoked' })
        } else {
          await ctx.db.patch(credential._id, {
            issuedAt: 0,
            expiresAt: 1_000,
            expiryMaterialization: {
              state: 'scheduled',
              credentialGeneration: credential.generation,
              credentialExpiresAt: 1_000,
              scheduleNonce: interactiveCredentialExpiryNonce({
                bindingRef: credential.bindingRef,
                credentialRef: credential.credentialRef,
                generation: credential.generation,
                expiresAt: 1_000,
              }),
              scheduleRef: `scheduled:${credential.credentialRef}`,
              materializedAt: 1,
            },
          })
        }
      })
      const caller = lifecycle === 'expired'
        ? lifecycleBackend.withIdentity({
            subject: `user_${slug}`,
            issuer: 'https://identity.example',
            exp: 1,
          })
        : owner
      const lifecycleCommand = await withSourceWrite('catalog_publish', {
        businessId: lifecycleBusinessId,
        operationKey: `catalog:${slug}`,
        correlationId: `catalog:${slug}`,
        ...draftFacts,
        sourceRevision: `openapi:${slug}`,
        candidateRef: canonicalDigest({
          sourceDigest: draftSourceDigest,
          selector: { ...draftSelector, lifecycle },
        }),
        sourceSelectorJson: stableStringify({ ...draftSelector, lifecycle }),
      })
      await expect(
        caller.mutation(api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft, lifecycleCommand),
      ).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
    }
  })

  it('owner supply denies hostile authority before external calls', async () => {
    const externalProbe = vi.fn()
    let authorityReads = 0
    const handler = (runOwnerSupplyReadiness as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const currentAuthority = {
      principalRef: `prn_${'1'.repeat(32)}`,
      accountRef: `acc_${'2'.repeat(32)}`,
      revision: {
        binding: 1,
        credential: 1,
        principal: 1,
        account: 1,
        access: 1,
        currentOwnership: 1,
        currentOwnerPrincipal: 1,
      },
      provenance: {
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
    const ctx = {
      auth: {
        getUserIdentity: async () => ({
          subject: 'user_owner-supply',
          issuer: 'https://identity.example',
          tokenIdentifier: 'https://identity.example|user_owner-supply',
        }),
      },
      runQuery: async (reference: unknown) => {
        const functionName = getFunctionName(reference as never)
        if (functionName === 'catalog:authorizeProviderBusiness') return true
        if (functionName === 'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel') {
          return {
            kind: 'available',
            businessId: 'businesses:owner-supply',
            offerings: [{
              offeringRef: 'offering:owner-supply',
              revision: 1,
              sourceHash: 'source:owner-supply',
              publicationRef: 'publication:owner-supply',
              publication: {
                publicationRevision: 1,
                authorityMode: 'public_upstream',
                source: { kind: 'openapi_http' },
              },
              toolRef: 'operation:owner-supply',
              stepStates: { test: 'in_progress' },
            }],
          }
        }
        throw new Error(`unexpected_query:${functionName}`)
      },
      runAction: async (reference: unknown) => {
        const functionName = getFunctionName(reference as never)
        if (functionName === 'interactiveAuthority:resolveCurrentInteractiveAuthority') {
          authorityReads += 1
          return authorityReads === 1 ? currentAuthority : null
        }
        if (functionName === 'capabilitySupplyReadiness:probe') {
          externalProbe()
          return { kind: 'available', lifecycle: { state: 'active', reasons: [] } }
        }
        throw new Error(`unexpected_action:${functionName}`)
      },
    }

    await expect(handler(ctx, {
      businessId: 'businesses:owner-supply',
      offeringRef: 'offering:owner-supply',
      offeringRevision: 1,
      offeringSourceHash: 'source:owner-supply',
      publicationRef: 'publication:owner-supply',
      publicationRevision: 1,
      operationKey: 'owner-supply',
    })).resolves.toEqual({
      step: 'readiness',
      state: 'refused',
      refusal: 'authorization_denied',
    })
    expect(authorityReads).toBe(2)
    expect(externalProbe).not.toHaveBeenCalled()
  })

  it('owner supply refreshes authority before consequence', async () => {
    const externalProbe = vi.fn()
    const recordEffect = vi.fn()
    let authorityReads = 0
    const handler = (runOwnerSupplyReadiness as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const currentAuthority = ownerSupplyAuthority()
    const ctx = {
      auth: {
        getUserIdentity: async () => ({
          subject: 'user_current-owner',
          issuer: 'https://identity.example',
          tokenIdentifier: 'https://identity.example|user_current-owner',
        }),
      },
      runQuery: async (reference: unknown) => {
        const functionName = getFunctionName(reference as never)
        if (functionName === 'catalog:authorizeProviderBusiness') return true
        if (functionName === 'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel') {
          return {
            kind: 'available',
            businessId: 'businesses:current-owner',
            offerings: [{
              offeringRef: 'offering:current-owner',
              revision: 1,
              sourceHash: 'source:current-owner',
              publicationRef: 'publication:current-owner',
              publication: {
                publicationRevision: 1,
                authorityMode: 'public_upstream',
                source: { kind: 'openapi_http' },
              },
              toolRef: 'operation:current-owner',
              stepStates: { test: 'in_progress' },
            }],
          }
        }
        throw new Error(`unexpected_query:${functionName}`)
      },
      runAction: async (reference: unknown) => {
        const functionName = getFunctionName(reference as never)
        if (functionName === 'interactiveAuthority:resolveCurrentInteractiveAuthority') {
          authorityReads += 1
          return currentAuthority
        }
        if (functionName === 'capabilitySupplyReadiness:probe') {
          externalProbe()
          return { kind: 'available', lifecycle: { state: 'active', reasons: [] } }
        }
        throw new Error(`unexpected_action:${functionName}`)
      },
      runMutation: recordEffect,
    }

    await expect(handler(ctx, {
      businessId: 'businesses:current-owner',
      offeringRef: 'offering:current-owner',
      offeringRevision: 1,
      offeringSourceHash: 'source:current-owner',
      publicationRef: 'publication:current-owner',
      publicationRevision: 1,
      operationKey: 'current-owner',
    })).resolves.toMatchObject({ step: 'readiness', state: 'completed' })
    expect(authorityReads).toBe(3)
    expect(externalProbe).toHaveBeenCalledOnce()
    expect(recordEffect).not.toHaveBeenCalled()
  })

  it('owner supply rechecks authority after a probe before recording its effect', async () => {
    const externalProbe = vi.fn()
    const recordEffect = vi.fn()
    let authorityReads = 0
    const handler = (runOwnerSupplyTest as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const currentAuthority = ownerSupplyAuthority()
    const rotatedAuthority = {
      ...currentAuthority,
      provenance: {
        ...currentAuthority.provenance,
        credentialGeneration: 2,
      },
    }
    const ctx = ownerSupplyActionContext({
      authority: () => {
        authorityReads += 1
        return authorityReads < 3 ? currentAuthority : rotatedAuthority
      },
      sourceKind: 'openapi_http',
      externalProbe,
      recordEffect,
    })

    await expect(handler(ctx, ownerSupplyArgs())).resolves.toEqual({
      step: 'test',
      state: 'refused',
      refusal: 'authorization_denied',
    })
    expect(authorityReads).toBe(3)
    expect(externalProbe).toHaveBeenCalledOnce()
    expect(recordEffect).not.toHaveBeenCalled()
  })

  it('owner supply refuses readiness when the admitted authority changes during a probe', async () => {
    const externalProbe = vi.fn()
    let authorityReads = 0
    const handler = (runOwnerSupplyReadiness as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const currentAuthority = ownerSupplyAuthority()
    const ctx = ownerSupplyActionContext({
      authority: () => {
        authorityReads += 1
        return authorityReads < 3 ? currentAuthority : null
      },
      sourceKind: 'openapi_http',
      externalProbe,
    })

    await expect(handler(ctx, ownerSupplyArgs())).resolves.toEqual({
      step: 'readiness',
      state: 'refused',
      refusal: 'authorization_denied',
    })
    expect(authorityReads).toBe(3)
    expect(externalProbe).toHaveBeenCalledOnce()
  })

  it('owner supply surfaces refusal from the separately reauthenticated x402 canary mutation', async () => {
    let authorityReads = 0
    const handler = (runOwnerSupplyTest as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const currentAuthority = ownerSupplyAuthority()
    const ctx = ownerSupplyActionContext({
      authority: () => {
        authorityReads += 1
        return authorityReads === 1 ? currentAuthority : null
      },
      sourceKind: 'x402',
      readinessCompleted: true,
      canaryResult: { kind: 'refused', code: 'authorization_denied' },
    })

    await expect(handler(ctx, ownerSupplyArgs())).resolves.toEqual({
      step: 'test',
      state: 'refused',
      refusal: 'canary_admission_refused',
    })
    expect(authorityReads).toBe(1)
  })

  it('owner supply denies a test before reading the offering when no current authority exists', async () => {
    const externalProbe = vi.fn()
    const handler = (runOwnerSupplyTest as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const ctx = ownerSupplyActionContext({
      authority: () => null,
      sourceKind: 'openapi_http',
      externalProbe,
    })

    await expect(handler(ctx, ownerSupplyArgs())).resolves.toEqual({
      step: 'test',
      state: 'refused',
      refusal: 'authorization_denied',
    })
    expect(externalProbe).not.toHaveBeenCalled()
  })

  it('owner supply completes projected x402 test only with current authority', async () => {
    let authorityReads = 0
    const handler = (runOwnerSupplyTest as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const currentAuthority = ownerSupplyAuthority()
    const externalProbe = vi.fn()
    const ctx = ownerSupplyActionContext({
      authority: () => {
        authorityReads += 1
        return currentAuthority
      },
      sourceKind: 'x402',
      readinessCompleted: true,
      externalProbe,
    })

    await expect(handler(ctx, ownerSupplyArgs())).resolves.toMatchObject({
      step: 'test',
      state: 'completed',
      message: expect.stringContaining('queued on Base Sepolia'),
    })
    expect(authorityReads).toBe(1)
    expect(externalProbe).not.toHaveBeenCalled()
  })

  it('owner supply refuses an x402 canary before exact readiness has completed', async () => {
    const handler = (runOwnerSupplyTest as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const ctx = ownerSupplyActionContext({
      authority: () => ownerSupplyAuthority(),
      sourceKind: 'x402',
      readinessCompleted: false,
    })

    await expect(handler(ctx, ownerSupplyArgs())).resolves.toEqual({
      step: 'test',
      state: 'refused',
      refusal: 'health_unhealthy',
    })
  })

  it('owner supply denies authority revoked immediately before a test probe', async () => {
    let authorityReads = 0
    const handler = (runOwnerSupplyTest as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const currentAuthority = ownerSupplyAuthority()
    const externalProbe = vi.fn()
    const ctx = ownerSupplyActionContext({
      authority: () => {
        authorityReads += 1
        return authorityReads === 1 ? currentAuthority : null
      },
      sourceKind: 'openapi_http',
      externalProbe,
    })

    await expect(handler(ctx, ownerSupplyArgs())).resolves.toEqual({
      step: 'test',
      state: 'refused',
      refusal: 'authorization_denied',
    })
    expect(authorityReads).toBe(2)
    expect(externalProbe).not.toHaveBeenCalled()
  })

  it('owner supply records one test effect after all current-authority checks', async () => {
    let authorityReads = 0
    const handler = (runOwnerSupplyTest as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const currentAuthority = ownerSupplyAuthority()
    const externalProbe = vi.fn()
    const recordEffect = vi.fn(async () => ({ kind: 'recorded' }))
    const ctx = ownerSupplyActionContext({
      authority: () => {
        authorityReads += 1
        return currentAuthority
      },
      sourceKind: 'openapi_http',
      externalProbe,
      recordEffect,
    })

    await expect(handler(ctx, ownerSupplyArgs())).resolves.toMatchObject({
      step: 'test',
      state: 'completed',
    })
    expect(authorityReads).toBe(3)
    expect(externalProbe).toHaveBeenCalledOnce()
    expect(recordEffect).toHaveBeenCalledOnce()
  })
})

function ownerSupplyAuthority() {
  return {
    principalRef: `prn_${'b'.repeat(32)}`,
    accountRef: `acc_${'c'.repeat(32)}`,
    revision: {
      binding: 1,
      credential: 1,
      principal: 1,
      account: 1,
      access: 1,
      currentOwnership: 1,
      currentOwnerPrincipal: 1,
    },
    provenance: {
      providerNamespace: 'clerk/user' as const,
      bindingRef: `eib_${'d'.repeat(32)}`,
      credentialRef: `crd_${'e'.repeat(32)}`,
      credentialGeneration: 1,
      accessKind: 'ownership' as const,
      accessRef: `own_${'f'.repeat(32)}`,
      currentOwnershipRef: `own_${'f'.repeat(32)}`,
      resolvedAt: 1,
    },
  }
}

function ownerSupplyArgs() {
  return {
    businessId: 'businesses:authority-refresh',
    offeringRef: 'offering:authority-refresh',
    offeringRevision: 1,
    offeringSourceHash: 'source:authority-refresh',
    publicationRef: 'publication:authority-refresh',
    publicationRevision: 1,
    operationKey: 'authority-refresh',
    correlationId: 'owner-supply-test:authority-refresh',
    input: {},
  }
}

function ownerSupplyActionContext(options: Readonly<{
  authority: () => ReturnType<typeof ownerSupplyAuthority> | null
  sourceKind: 'openapi_http' | 'x402'
  readinessCompleted?: boolean
  externalProbe?: () => unknown
  recordEffect?: (...args: unknown[]) => unknown
  canaryResult?: { kind: 'enqueued'; canaryRef: string; callRef: string; toolRef: string }
    | { kind: 'refused'; code: string }
}>) {
  return {
    auth: {
      getUserIdentity: async () => ({
        subject: 'user_owner-supply-current',
        issuer: 'https://identity.example',
        tokenIdentifier: 'https://identity.example|user_owner-supply-current',
      }),
    },
    runQuery: async (reference: unknown) => {
      const functionName = getFunctionName(reference as never)
      if (functionName === 'catalog:authorizeProviderBusiness') return true
      if (functionName === 'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel') {
        return {
          kind: 'available',
          businessId: ownerSupplyArgs().businessId,
          offerings: [{
            offeringRef: ownerSupplyArgs().offeringRef,
            revision: 1,
            sourceHash: ownerSupplyArgs().offeringSourceHash,
            publicationRef: ownerSupplyArgs().publicationRef,
            publication: {
              publicationRevision: 1,
              authorityMode: 'public_upstream',
              source: { kind: options.sourceKind },
            },
            toolRef: 'operation:authority-refresh',
            stepStates: {
              readiness: options.readinessCompleted === true ? 'completed' : 'in_progress',
              test: 'in_progress',
            },
          }],
        }
      }
      throw new Error(`unexpected_query:${functionName}`)
    },
    runAction: async (reference: unknown) => {
      const functionName = getFunctionName(reference as never)
      if (functionName === 'interactiveAuthority:resolveCurrentInteractiveAuthority') {
        return options.authority()
      }
      if (functionName === 'capabilitySupplyReadiness:probe') {
        options.externalProbe?.()
        return { kind: 'available', lifecycle: { state: 'active', reasons: [] } }
      }
      throw new Error(`unexpected_action:${functionName}`)
    },
    runMutation: async (reference: unknown, ...args: unknown[]) => {
      const functionName = getFunctionName(reference as never)
      if (functionName === 'capabilitySupplyOwnerCanary:requestSellerOnboardingCanary') {
        return options.canaryResult ?? {
          kind: 'enqueued',
          canaryRef: 'seller-canary:test',
          callRef: 'seller-canary-invocation:test',
          toolRef: 'operation:authority-refresh',
        }
      }
      return await (options.recordEffect ?? vi.fn())(reference, ...args)
    },
  }
}
