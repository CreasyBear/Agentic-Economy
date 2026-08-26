import { convexTest, type TestConvex } from 'convex-test'
import { expect, it, vi } from 'vitest'

import schema from '../../convex/schema'
import {
  armInteractiveCredentialExpiryHandler,
  expireInteractiveCredential,
  reconcileInteractiveCredentialExpiry,
} from '../../convex/interactiveCredentialLifecycle'
import { deleteGenerationBatch } from '../../convex/marketExternalRegistry'
import { convexModules as modules } from '../helpers/convex-fixtures'

const NOW = 10_000
const PRINCIPAL_REF = `prn_${'1'.repeat(32)}`
const BINDING_REF = `eib_${'5'.repeat(32)}`
const CREDENTIAL_REF = `crd_${'6'.repeat(32)}`

it('expireInteractiveCredential stales only the exact credential generation and cannot grant or widen resource access', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const backend = convexTest(schema, modules)
  await seedCredential(backend)
  const scheduled = await backend.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, {
    bindingRef: BINDING_REF,
    credentialRef: CREDENTIAL_REF,
    expectedGeneration: 2,
  }))
  if (scheduled.kind !== 'scheduled') throw new Error('expected scheduled credential')
  vi.setSystemTime(NOW + 1)
  const handler = (expireInteractiveCredential as unknown as {
    _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
  })._handler
  await expect(backend.run(async (ctx) => handler(ctx, {
    bindingRef: BINDING_REF,
    credentialRef: CREDENTIAL_REF,
    expectedGeneration: 2,
    expectedExpiresAt: NOW + 1,
    scheduleNonce: scheduled.scheduleNonce,
  }))).resolves.toEqual({ kind: 'expired' })
  await expect(backend.run(async (ctx) => Promise.all([
    ctx.db.query('credentials').collect(),
    ctx.db.query('externalIdentityBindings').collect(),
    ctx.db.query('accounts').collect(),
    ctx.db.query('accountOwnerships').collect(),
    ctx.db.query('memberships').collect(),
    ctx.db.query('authorityDelegationGrants').collect(),
    ctx.db.query('connections').collect(),
  ]))).resolves.toMatchObject([
    [{ credentialRef: CREDENTIAL_REF, generation: 2, lifecycle: 'stale', staleAt: NOW + 1 }],
    [{ bindingRef: BINDING_REF, credentialGeneration: 2, lifecycle: 'active' }],
    [], [], [], [], [],
  ])
})

it('reconcileInteractiveCredentialExpiry fails closed on a missing chain and cannot create authority or resources', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const backend = convexTest(schema, modules)
  const handler = (reconcileInteractiveCredentialExpiry as unknown as {
    _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
  })._handler
  await expect(backend.run(async (ctx) => handler(ctx, {
    bindingRef: BINDING_REF,
    credentialRef: CREDENTIAL_REF,
    expectedGeneration: 2,
  }))).resolves.toEqual({ kind: 'refused', code: 'binding_missing' })
  await expect(backend.run(async (ctx) => Promise.all([
    ctx.db.query('credentials').collect(),
    ctx.db.query('externalIdentityBindings').collect(),
    ctx.db.query('accounts').collect(),
    ctx.db.query('accountOwnerships').collect(),
    ctx.db.query('memberships').collect(),
    ctx.db.query('authorityDelegationGrants').collect(),
    ctx.db.query('connections').collect(),
  ]))).resolves.toEqual([[], [], [], [], [], [], []])
})

it('deleteGenerationBatch removes only inactive public registry metadata and cannot touch the active generation', async () => {
  const backend = convexTest(schema, modules)
  await backend.run(async (ctx) => {
    await ctx.db.insert('marketExternalRegistryState', {
      key: 'registry', activeGeneration: 'generation:active', lastAttemptAt: 1, lastAttemptStatus: 'complete',
    })
    for (const generation of ['generation:active', 'generation:stale']) {
      await ctx.db.insert('marketExternalRegistryGenerations', {
        generation, status: 'complete', startedAt: 1, completedAt: 2, ingestedCount: 0,
      })
    }
  })
  const handler = (deleteGenerationBatch as unknown as {
    _handler: (ctx: unknown, args: { generation: string }) => Promise<null>
  })._handler
  await backend.run(async (ctx) => handler(ctx, { generation: 'generation:stale' }))
  await expect(backend.run(async (ctx) => Promise.all([
    ctx.db.query('marketExternalRegistryState').collect(),
    ctx.db.query('marketExternalRegistryGenerations').collect(),
    ctx.db.query('accounts').collect(),
    ctx.db.query('authorityDelegationGrants').collect(),
    ctx.db.query('connections').collect(),
  ]))).resolves.toMatchObject([
    [{ activeGeneration: 'generation:active' }],
    [{ generation: 'generation:active' }],
    [], [], [],
  ])
})

async function seedCredential(backend: TestConvex<typeof schema>): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef: BINDING_REF,
      principalRef: PRINCIPAL_REF,
      providerNamespace: 'clerk/user',
      providerIdentifier: 'https://clerk.example.test|user_sam',
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 2,
      bindIdempotencyRef: 'bind:sam',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('credentials', {
      credentialRef: CREDENTIAL_REF,
      bindingRef: BINDING_REF,
      principalRef: PRINCIPAL_REF,
      type: 'provider_token',
      lifecycle: 'active',
      generation: 2,
      issueIdempotencyRef: 'credential:sam',
      revision: 1,
      issuedAt: 1,
      expiresAt: NOW + 1,
      updatedAt: 1,
    })
  })
}
