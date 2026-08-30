import { convexTest, type TestConvex } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import schema from '../../../convex/schema'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import {
  armInteractiveCredentialExpiryHandler,
  expireInteractiveCredentialHandler,
  reconcileInteractiveCredentialExpiryHandler,
} from '../../../convex/interactiveCredentialLifecycle'
import { convexModules as modules } from '../../helpers/convex-fixtures'

const NOW = 10_000
const PRINCIPAL_REF = `prn_${'1'.repeat(32)}`
const BINDING_REF = `eib_${'5'.repeat(32)}`
const CREDENTIAL_REF = `crd_${'6'.repeat(32)}`
type Backend = TestConvex<typeof schema>
const armExpiryRef = makeFunctionReference<'mutation', ReturnType<typeof lifecycleRequest>, unknown>(
  'interactiveCredentialLifecycle:armInteractiveCredentialExpiry',
)

describe('interactive credential materialized expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('arms exact expiry idempotently and binds the schedule to credential generation', async () => {
    const backend = convexTest(schema, modules)
    await seedCredential(backend, NOW + 100)

    const first = await backend.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
    }))
    const replay = await backend.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
    }))

    expect(first).toMatchObject({ kind: 'scheduled', credentialGeneration: 2, expiresAt: NOW + 100 })
    expect(replay).toEqual({ ...first, kind: 'duplicate' })
  })

  it('executes the registered durable scheduled mutation at expiry', async () => {
    const backend = convexTest(schema, modules)
    await seedCredential(backend, NOW + 100)
    await expect(backend.mutation(armExpiryRef, lifecycleRequest())).resolves.toMatchObject({
      kind: 'scheduled',
      credentialGeneration: 2,
    })

    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    await expect(readCredential(backend, CREDENTIAL_REF)).resolves.toMatchObject({
      lifecycle: 'stale',
      staleAt: NOW + 100,
      expiryMaterialization: { state: 'expired' },
    })
  })

  it('denies early callback and expires at the exact boundary', async () => {
    const backend = convexTest(schema, modules)
    await seedCredential(backend, NOW + 1)
    const scheduled = await backend.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
    }))
    if (scheduled.kind !== 'scheduled') throw new Error('expected scheduled credential')

    await expect(backend.run(async (ctx) => expireInteractiveCredentialHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
      expectedExpiresAt: NOW + 1,
      scheduleNonce: scheduled.scheduleNonce,
    }))).resolves.toEqual({ kind: 'not_due' })

    vi.setSystemTime(NOW + 1)
    await expect(backend.run(async (ctx) => expireInteractiveCredentialHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
      expectedExpiresAt: NOW + 1,
      scheduleNonce: scheduled.scheduleNonce,
    }))).resolves.toEqual({ kind: 'expired' })
    await expect(readCredential(backend, CREDENTIAL_REF)).resolves.toMatchObject({
      lifecycle: 'stale',
      staleAt: NOW + 1,
      expiryMaterialization: { state: 'expired' },
    })
  })

  it('cannot let a stale scheduled callback expire a rotated current credential', async () => {
    const backend = convexTest(schema, modules)
    await seedCredential(backend, NOW + 1)
    const scheduled = await backend.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
    }))
    if (scheduled.kind !== 'scheduled') throw new Error('expected scheduled credential')
    await rotateCredential(backend)
    vi.setSystemTime(NOW + 1)

    await backend.run(async (ctx) => expireInteractiveCredentialHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
      expectedExpiresAt: NOW + 1,
      scheduleNonce: scheduled.scheduleNonce,
    }))
    await expect(readCredential(backend, `crd_${'7'.repeat(32)}`)).resolves.toMatchObject({
      generation: 3,
      lifecycle: 'active',
    })
  })

  it('reconciles an unmaterialized late credential to expired and is replay safe', async () => {
    const backend = convexTest(schema, modules)
    await seedCredential(backend, NOW)

    await expect(backend.run(async (ctx) => reconcileInteractiveCredentialExpiryHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
    }))).resolves.toEqual({ kind: 'expired' })
    await expect(backend.run(async (ctx) => reconcileInteractiveCredentialExpiryHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
    }))).resolves.toEqual({ kind: 'duplicate_expired' })
  })

  it('expires immediately when arming an already-due credential', async () => {
    const backend = convexTest(schema, modules)
    await seedCredential(backend, NOW)
    await expect(backend.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, {
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      expectedGeneration: 2,
    }))).resolves.toEqual({ kind: 'expired' })
  })

  it('fails malformed and non-current credential chains closed', async () => {
    const cases: ReadonlyArray<Readonly<{
      expected: string
      prepare: (backend: Backend) => Promise<void>
      args?: { bindingRef?: string; credentialRef?: string; expectedGeneration?: number }
    }>> = [
      { expected: 'binding_missing', prepare: async (backend) => deleteBinding(backend) },
      { expected: 'credential_missing', prepare: async (backend) => deleteCredential(backend) },
      { expected: 'credential_mismatch', prepare: async () => {}, args: { expectedGeneration: 0 } },
      { expected: 'credential_mismatch', prepare: async () => {}, args: { expectedGeneration: 3 } },
      { expected: 'credential_mismatch', prepare: async (backend) => patchCredential(backend, { type: 'api_key' }) },
      { expected: 'credential_mismatch', prepare: async (backend) => patchCredential(backend, { bindingRef: `eib_${'8'.repeat(32)}` }) },
      { expected: 'binding_mismatch', prepare: async (backend) => patchBinding(backend, { principalRef: `prn_${'8'.repeat(32)}` }) },
      { expected: 'binding_mismatch', prepare: async (backend) => patchBinding(backend, { credentialGeneration: 3 }) },
      { expected: 'binding_mismatch', prepare: async (backend) => patchBinding(backend, { lifecycle: 'revoked' }) },
      { expected: 'binding_mismatch', prepare: async (backend) => patchBinding(backend, { providerNamespace: 'other/provider' }) },
      { expected: 'credential_not_active', prepare: async (backend) => patchCredential(backend, { lifecycle: 'revoked' }) },
    ]
    for (const entry of cases) {
      const backend = convexTest(schema, modules)
      await seedCredential(backend, NOW + 100)
      await entry.prepare(backend)
      await expect(backend.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, {
        bindingRef: entry.args?.bindingRef ?? BINDING_REF,
        credentialRef: entry.args?.credentialRef ?? CREDENTIAL_REF,
        expectedGeneration: entry.args?.expectedGeneration ?? 2,
      }))).resolves.toEqual({ kind: 'refused', code: entry.expected })
    }
  })

  it('rejects materialization substitution and resumes matching reconciliation state', async () => {
    const conflict = convexTest(schema, modules)
    await seedCredential(conflict, NOW + 100)
    await patchCredential(conflict, {
      expiryMaterialization: materialization({ scheduleNonce: 'sha256:substituted' }),
    })
    await expect(conflict.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, lifecycleRequest())))
      .resolves.toEqual({ kind: 'refused', code: 'materialization_conflict' })

    const expired = convexTest(schema, modules)
    await seedCredential(expired, NOW + 100)
    await patchCredential(expired, {
      expiryMaterialization: materialization({ state: 'expired' }),
    })
    await expect(expired.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, lifecycleRequest())))
      .resolves.toEqual({ kind: 'duplicate_expired' })

    const reconciliation = convexTest(schema, modules)
    await seedCredential(reconciliation, NOW + 100)
    await patchCredential(reconciliation, {
      expiryMaterialization: materialization({ state: 'reconciliation_required', scheduleRef: undefined }),
    })
    await expect(reconciliation.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, lifecycleRequest())))
      .resolves.toMatchObject({ kind: 'scheduled' })
  })

  it('rejects substituted callback provenance and replays an expired callback safely', async () => {
    for (const override of [
      { expectedExpiresAt: NOW + 101 },
      { scheduleNonce: 'sha256:substituted' },
    ]) {
      const backend = convexTest(schema, modules)
      await seedCredential(backend, NOW + 100)
      const scheduled = await backend.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, lifecycleRequest()))
      if (scheduled.kind !== 'scheduled') throw new Error('expected scheduled credential')
      await expect(backend.run(async (ctx) => expireInteractiveCredentialHandler(ctx, {
        ...lifecycleRequest(),
        expectedExpiresAt: NOW + 100,
        scheduleNonce: scheduled.scheduleNonce,
        ...override,
      }))).resolves.toEqual({ kind: 'refused', code: 'materialization_conflict' })
    }

    const backend = convexTest(schema, modules)
    await seedCredential(backend, NOW + 1)
    const scheduled = await backend.run(async (ctx) => armInteractiveCredentialExpiryHandler(ctx, lifecycleRequest()))
    if (scheduled.kind !== 'scheduled') throw new Error('expected scheduled credential')
    vi.setSystemTime(NOW + 1)
    const request = {
      ...lifecycleRequest(),
      expectedExpiresAt: NOW + 1,
      scheduleNonce: scheduled.scheduleNonce,
    }
    await expect(backend.run(async (ctx) => expireInteractiveCredentialHandler(ctx, request)))
      .resolves.toEqual({ kind: 'expired' })
    await expect(backend.run(async (ctx) => expireInteractiveCredentialHandler(ctx, request)))
      .resolves.toEqual({ kind: 'duplicate_expired' })
  })

  it('reconciles a future unmaterialized credential by scheduling it', async () => {
    const backend = convexTest(schema, modules)
    await seedCredential(backend, NOW + 100)
    await expect(backend.run(async (ctx) => reconcileInteractiveCredentialExpiryHandler(ctx, lifecycleRequest())))
      .resolves.toMatchObject({ kind: 'scheduled' })

    const missing = convexTest(schema, modules)
    await expect(missing.run(async (ctx) => reconcileInteractiveCredentialExpiryHandler(ctx, lifecycleRequest())))
      .resolves.toEqual({ kind: 'refused', code: 'binding_missing' })
  })

  it('does not treat an unrelated inactive credential as an expired callback replay', async () => {
    const backend = convexTest(schema, modules)
    await seedCredential(backend, NOW + 100)
    await patchCredential(backend, { lifecycle: 'revoked' })
    await expect(backend.run(async (ctx) => expireInteractiveCredentialHandler(ctx, {
      ...lifecycleRequest(),
      expectedExpiresAt: NOW + 100,
      scheduleNonce: 'sha256:not-scheduled',
    }))).resolves.toEqual({ kind: 'refused', code: 'credential_not_active' })
  })
})

async function seedCredential(backend: Backend, expiresAt: number) {
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
      expiresAt,
      updatedAt: 1,
    })
  })
}

async function rotateCredential(backend: Backend) {
  await backend.run(async (ctx) => {
    const binding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', BINDING_REF)).unique()
    if (binding === null) throw new Error('binding missing')
    await ctx.db.patch(binding._id, { credentialGeneration: 3, revision: 2 })
    await ctx.db.insert('credentials', {
      credentialRef: `crd_${'7'.repeat(32)}`,
      bindingRef: BINDING_REF,
      principalRef: PRINCIPAL_REF,
      type: 'provider_token',
      lifecycle: 'active',
      generation: 3,
      issueIdempotencyRef: 'credential:sam:rotated',
      revision: 1,
      issuedAt: NOW,
      expiresAt: NOW + 1_000,
      updatedAt: NOW,
    })
  })
}

async function readCredential(
  backend: Backend,
  ref: string,
) {
  return await backend.run(async (ctx) => await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', ref)).unique())
}

function lifecycleRequest() {
  return {
    bindingRef: BINDING_REF,
    credentialRef: CREDENTIAL_REF,
    expectedGeneration: 2,
  }
}

function materialization(overrides: Partial<{
  state: 'scheduled' | 'reconciliation_required' | 'expired'
  credentialGeneration: number
  credentialExpiresAt: number
  scheduleNonce: string
  scheduleRef: string | undefined
  materializedAt: number
}> = {}) {
  return {
    state: 'scheduled' as const,
    credentialGeneration: 2,
    credentialExpiresAt: NOW + 100,
    scheduleNonce: canonicalDigest({
      kind: 'interactive_credential_expiry:v1',
      bindingRef: BINDING_REF,
      credentialRef: CREDENTIAL_REF,
      generation: 2,
      expiresAt: NOW + 100,
    }),
    scheduleRef: 'scheduled:test',
    materializedAt: NOW,
    ...overrides,
  }
}

async function patchCredential(backend: Backend, patch: Record<string, unknown>) {
  await backend.run(async (ctx) => {
    const row = await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', CREDENTIAL_REF)).unique()
    if (row === null) throw new Error('credential missing')
    await ctx.db.patch(row._id, patch as never)
  })
}

async function patchBinding(backend: Backend, patch: Record<string, unknown>) {
  await backend.run(async (ctx) => {
    const row = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', BINDING_REF)).unique()
    if (row === null) throw new Error('binding missing')
    await ctx.db.patch(row._id, patch as never)
  })
}

async function deleteBinding(backend: Backend) {
  await backend.run(async (ctx) => {
    const row = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', BINDING_REF)).unique()
    if (row !== null) await ctx.db.delete(row._id)
  })
}

async function deleteCredential(backend: Backend) {
  await backend.run(async (ctx) => {
    const row = await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', CREDENTIAL_REF)).unique()
    if (row !== null) await ctx.db.delete(row._id)
  })
}
