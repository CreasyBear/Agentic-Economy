/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { makeFunctionReference } from 'convex/server'
import {
  convexTestWithMarketComponents,
  nonAdmin,
  ownerAdmin,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const callRef = `operation-invocation:v1:${'a'.repeat(64)}`
const unknownCallRef = `operation-invocation:v1:${'f'.repeat(64)}`
const readAdminObject = makeFunctionReference<
  'query',
  { ref: { kind: 'call'; ref: string } },
  unknown
>('adminConsoleObjects:readAdminObject')
const searchAdminObjects = makeFunctionReference<
  'query',
  { kind: 'call'; ref: string },
  unknown
>('adminConsoleObjects:searchAdminObjects')

async function seedCall(backend: ConvexFixtureBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityCalls', {
      callRef,
      principalId: `prn_${'b'.repeat(32)}`,
      ownerId: `acc_${'c'.repeat(32)}`,
      credentialId: 'credential:admin-call-view',
      applicationRef: 'application:admin-call-view',
      toolRef: `operation:v1:${'d'.repeat(64)}`,
      idempotencyKey: 'idempotency:admin-call-view',
      environment: 'sandbox',
      grantRef: 'grant:admin-call-view',
      grantGeneration: 1,
      policyDigest: 'sha256:admin-call-view-policy',
      grantExpiresAt: 1_900_000_000_000,
      inputDigest: 'sha256:admin-call-view-input',
      requestDigest: 'sha256:admin-call-view-request',
      state: 'pending',
      createdAt: 1_800_000_000_000,
      updatedAt: 1_800_000_000_000,
    })
  })
}

describe('admin object reads', () => {
  it('refuses an authenticated non-admin', async () => {
    const backend = convexTestWithMarketComponents()
    await seedCall(backend)
    const caller = await nonAdmin(backend, 'user_admin-read-non-admin')

    await expect(caller.query(readAdminObject, {
      ref: { kind: 'call', ref: callRef },
    })).resolves.toEqual({ kind: 'refused', code: 'missing_membership' })
  })

  it('returns a PII-free Call view to an owner admin', async () => {
    const backend = convexTestWithMarketComponents()
    await seedCall(backend)
    const caller = await ownerAdmin(backend, 'user_admin-read-owner')

    const result = await caller.query(readAdminObject, {
      ref: { kind: 'call', ref: callRef },
    })

    expect(result).toMatchObject({ kind: 'call', ref: callRef })
    expect(JSON.stringify(result)).not.toContain('inputJson')
  })

  it('returns object_not_found for an unknown canonical Call ref', async () => {
    const backend = convexTestWithMarketComponents()
    const caller = await ownerAdmin(backend, 'user_admin-read-missing')

    await expect(caller.query(readAdminObject, {
      ref: { kind: 'call', ref: unknownCallRef },
    })).resolves.toEqual({ kind: 'object_not_found' })
  })

  it('returns the parser error for malformed exact-ref search', async () => {
    const backend = convexTestWithMarketComponents()
    const caller = await ownerAdmin(backend, 'user_admin-read-malformed')

    await expect(caller.query(searchAdminObjects, {
      kind: 'call',
      ref: 'not-a-call-ref',
    })).resolves.toEqual({ kind: 'malformed', code: 'malformed_call_ref' })
  })
})
