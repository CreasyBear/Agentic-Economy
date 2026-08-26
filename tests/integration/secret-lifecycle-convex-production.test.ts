import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'

import schema from '../../convex/schema'
import { createConvexSecretLifecyclePersistence } from '../../convex/lib/secretLifecyclePersistence'
import {
  InfisicalCloudSecretStore,
  ProductionSecretGenerationValidator,
  ProductionSecretLifecycleService,
  secretGeneration,
  secretRef,
  withEphemeralSecretMaterial,
  type SecretMaterialSource,
} from '../../src/modules/secrets/public'
import {
  accountRef,
  principalRef,
} from '../../src/modules/principal-account/public'
import { delegationSnapshotRef } from '../../src/modules/authority/delegation/public'
import { convexModules } from '../helpers/convex-fixtures'

const NOW = 1_100
const ACCOUNT = accountRef('acc_00000000000040008000000000000051')
const ACTOR = principalRef('prn_00000000000040008000000000000051')
const REF = secretRef('sec_00000000000040008000000000000051')
const FIRST = secretGeneration('sgn_00000000000040008000000000000051')
const NEXT = secretGeneration('sgn_22222222222242228222222222222222')
const SNAPSHOT = delegationSnapshotRef('das_00000000000040008000000000000051')
const GRANT = 'grt_00000000000040008000000000000051'
const MATERIAL = 'rotation-canary-never-persist'

async function seed(backend: TestConvex<typeof schema>) {
  await backend.run(async (ctx) => {
    const seedAuthority = {
      operation: 'provision' as const,
      snapshotRef: 'das_00000000000040008000000000000050',
      accountRef: ACCOUNT,
      actorPrincipalRef: ACTOR,
      grantRef: 'grt_00000000000040008000000000000050',
      grantGeneration: 1,
      correlationRef: 'secret:seed',
      idempotencyRef: 'secret:seed',
      occurredAt: 1_000,
    }
    await ctx.db.insert('secretPointers', {
      secretRef: REF,
      owningAccountRef: ACCOUNT,
      activeGeneration: FIRST,
      revision: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
      lastAction: seedAuthority,
    })
    await ctx.db.insert('secretPointerCommands', {
      secretRef: REF,
      operation: 'provision',
      newGeneration: FIRST,
      previousRevision: 0,
      newRevision: 1,
      action: seedAuthority,
    })
    await ctx.db.insert('authorityDelegationSnapshots', {
      snapshotRef: SNAPSHOT,
      grantRef: GRANT,
      generation: 1,
      accountRef: ACCOUNT,
      accountRevision: 1,
      actorPrincipalRef: ACTOR,
      subjectPrincipalRef: ACTOR,
      scopes: ['secret:rotate'],
      resourceRefs: [`secret:${REF}`],
      budgetAmount: 0,
      admittedAt: NOW,
      expiresAt: 2_000,
      correlationRef: 'secret:rotate',
      idempotencyRef: 'secret:rotate:one',
      ancestryCount: 1,
    })
    await ctx.db.insert('authorityDelegationSnapshotAncestors', {
      snapshotRef: SNAPSHOT,
      position: 0,
      grantRef: GRANT,
      generation: 1,
      accountRef: ACCOUNT,
      actorPrincipalRef: ACTOR,
      subjectPrincipalRef: ACTOR,
      scopes: ['secret:rotate'],
      resourceRefs: [`secret:${REF}`],
      budgetLimit: 1,
      budgetUsedBefore: 0,
      expiresAt: 2_000,
    })
  })
}

function infisicalFetch() {
  let createCount = 0
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/v1/auth/oidc-auth/login') {
      return Response.json({
        accessToken: 'access-token',
        tokenType: 'Bearer',
        expiresIn: 60,
        accessTokenMaxTTL: 60,
      })
    }
    const expectedKey = `${REF}--${NEXT}`
    if (url.pathname === `/api/v4/secrets/${expectedKey}` && init?.method === 'POST') {
      createCount += 1
      expect(String(init.body)).toContain(MATERIAL)
      return Response.json({ secret: {
        id: 'infisical-secret-version',
        version: 1,
        secretKey: expectedKey,
        environment: 'production',
        workspace: 'project-platform',
      } })
    }
    if (url.pathname === `/api/v4/secrets/${expectedKey}` && init?.method === 'GET') {
      return Response.json({ secret: {
        secretKey: expectedKey,
        secretValue: MATERIAL,
        environment: 'production',
        workspace: 'project-platform',
      } })
    }
    throw new Error('unexpected_infisical_request')
  })
  return { createCount: () => createCount, fetchMock }
}

describe('production secret lifecycle Convex composition', () => {
  it('writes and validates the real Infisical generation before one canonical pointer advance and exact replay', async () => {
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    const transport = infisicalFetch()
    const store = new InfisicalCloudSecretStore({
      baseUrl: 'https://app.infisical.com',
      projectId: 'project-platform',
      environment: 'production',
      secretPath: '/agentic-economy',
      machineIdentityId: 'machine-identity',
      identityTokenProvider: {
        getIdentityToken: async () => ({ jwt: 'oidc.jwt.value', expiresAt: 100_000 }),
      },
      fetch: transport.fetchMock,
      now: () => NOW,
    })
    const validator = new ProductionSecretGenerationValidator({
      validate: async (target, lease) => {
        expect(target).toEqual({ secretRef: REF, generation: NEXT })
        await lease.useBytes(async (bytes) => {
          expect(new TextDecoder().decode(bytes)).toBe(MATERIAL)
        })
      },
    })
    const materialSource: SecretMaterialSource = {
      withMaterial: async (operation) => {
        const bytes = new TextEncoder().encode(MATERIAL)
        try {
          await withEphemeralSecretMaterial(bytes, operation)
        } finally {
          bytes.fill(0)
        }
      },
    }
    const authority = {
      operation: 'rotate' as const,
      snapshotRef: SNAPSHOT,
      accountRef: ACCOUNT,
      actorPrincipalRef: ACTOR,
      grantRef: GRANT,
      grantGeneration: 1,
      correlationRef: 'secret:rotate',
      idempotencyRef: 'secret:rotate:one',
      occurredAt: NOW,
    }
    const first = await backend.run(async (ctx) => {
      const persistence = createConvexSecretLifecyclePersistence(ctx, authority)
      return await new ProductionSecretLifecycleService({
        store,
        validator,
        ...persistence,
        now: () => NOW,
        randomUuid: () => '22222222-2222-4222-8222-222222222222',
      }).rotate({ secretRef: REF, idempotencyRef: authority.idempotencyRef, materialSource })
    })
    const replay = await backend.run(async (ctx) => {
      const persistence = createConvexSecretLifecyclePersistence(ctx, authority)
      return await new ProductionSecretLifecycleService({
        store,
        validator,
        ...persistence,
        now: () => NOW,
        randomUuid: () => '22222222-2222-4222-8222-222222222222',
      }).rotate({ secretRef: REF, idempotencyRef: authority.idempotencyRef, materialSource })
    })
    expect(replay).toEqual(first)
    expect(first).toMatchObject({ activeGeneration: NEXT, pointerRevision: 2, state: 'active' })
    expect(transport.createCount()).toBe(1)
    const persisted = await backend.run(async (ctx) => ({
      pointer: await ctx.db.query('secretPointers').collect(),
      commands: await ctx.db.query('secretPointerCommands').collect(),
      journal: await ctx.db.query('secretLifecycleJournal').collect(),
    }))
    expect(persisted.pointer[0]).toMatchObject({ activeGeneration: NEXT, revision: 2 })
    expect(persisted.commands).toHaveLength(2)
    expect(persisted.journal).toHaveLength(1)
    expect(persisted.journal[0]).toMatchObject({ state: 'active', targetGeneration: NEXT })
    expect(JSON.stringify(persisted)).not.toContain(MATERIAL)
  })
})
