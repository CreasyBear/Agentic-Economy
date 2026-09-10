/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'
import { buildDevelopmentPublishedToolEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'

// Call idempotency is keyed by the stable Principal tuple
// (principalId, ownerId, applicationRef, environment). The credential and the
// grant it was issued under are effect evidence retained on the stored Call, so
// a credential rotation must replay the original Call instead of minting a
// second reservation under the same idempotency key.

const NOW = Date.UTC(2026, 8, 9, 0, 0, 0)
const IDEMPOTENCY_KEY = 'purchase:rotation-one'
const CALL_REF = 'operation-invocation:v1:rotation-original'
const TOOL_REF = `operation:v1:${'a'.repeat(64)}`
const RESERVATION_REF = 'formance:reserve-rotation-original'
const TOOL_JSON = JSON.stringify(buildDevelopmentPublishedToolEvidence().tool)

const original = {
  quoteRef: 'operation-commitment:v1:rotation-original',
  callRef: CALL_REF,
  principalId: 'principal:rotation',
  ownerId: 'owner:rotation',
  credentialId: 'credential:rotation-a',
  applicationRef: 'application:rotation',
  toolRef: TOOL_REF,
  idempotencyKey: IDEMPOTENCY_KEY,
  environment: 'sandbox' as const,
  grantRef: 'grant:rotation-a',
  grantGeneration: 1,
  policyDigest: 'sha256:rotation-policy-a',
  grantExpiresAt: NOW + 600_000,
  toolJson: TOOL_JSON,
  inputJson: '{"query":"one"}',
  inputDigest: 'sha256:rotation-input',
  requestDigest: 'sha256:rotation-request',
  formanceFinancialState: 'reserved' as const,
  formanceReservationRefs: [RESERVATION_REF],
  formanceReservationDigest: 'sha256:rotation-reservation',
  state: 'pending' as const,
  createdAt: NOW - 1_000,
  updatedAt: NOW - 1_000,
}

// The rotated principal keeps principalId/ownerId/applicationRef/environment
// and presents a new credential, a new grant generation, and therefore a new
// derived callRef (canonicalCallRef mixes credentialId and grantGeneration in).
const rotated = {
  ...original,
  quoteRef: 'operation-commitment:v1:rotation-successor',
  callRef: 'operation-invocation:v1:rotation-successor',
  credentialId: 'credential:rotation-b',
  grantRef: 'grant:rotation-b',
  grantGeneration: 2,
  policyDigest: 'sha256:rotation-policy-b',
  now: NOW,
}

function reserveArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const {
    formanceFinancialState: _financialState,
    formanceReservationRefs: _reservationRefs,
    formanceReservationDigest: _reservationDigest,
    state: _state,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...args
  } = rotated
  return { ...args, ...overrides }
}

function stableIdentity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    callRef: CALL_REF,
    principalId: original.principalId,
    ownerId: original.ownerId,
    applicationRef: original.applicationRef,
    environment: original.environment,
    ...overrides,
  }
}

function obligation(callRef: string) {
  return {
    obligationRef: `provider-obligation:${callRef}`,
    callRef,
    toolRef: TOOL_REF,
    providerRef: 'provider:rotation',
    buyerAccountRef: original.ownerId,
    buyerAsset: 'AUD' as const,
    buyerExponent: 6 as const,
    buyerAmountUnits: '6000000',
    providerAsset: 'USDC' as const,
    providerExponent: 6 as const,
    providerAmountUnits: '5000000',
    settlementMethod: 'managed_x402' as const,
    state: 'accrued' as const,
    payoutEligibility: 'ineligible_x402' as const,
    evidenceRefs: [original.quoteRef, RESERVATION_REF],
    createdAt: NOW - 1_000,
    updatedAt: NOW - 1_000,
  }
}

async function seed(
  backend: ReturnType<typeof convexTestWithMarketComponents>,
  extra: readonly Record<string, unknown>[] = [],
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityCalls', original)
    await ctx.db.insert('moneyProviderObligations', obligation(CALL_REF))
    for (const row of extra) await ctx.db.insert('capabilityCalls', row as never)
  })
}

async function calls(
  backend: ReturnType<typeof convexTestWithMarketComponents>,
): Promise<Doc<'capabilityCalls'>[]> {
  return await backend.run(async (ctx) => await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_idempotencyKey', (query) => query
      .eq('principalId', original.principalId)
      .eq('idempotencyKey', IDEMPOTENCY_KEY))
    .take(10))
}

describe('call idempotency across a credential rotation', () => {
  it('replays the original Call and its single money reservation under the rotated credential', async () => {
    const backend = convexTestWithMarketComponents()
    await seed(backend)

    const result = await backend.mutation(internal.capabilityCalls.reserve, reserveArgs() as never)

    expect(result).toMatchObject({
      kind: 'replayed',
      reservation: {
        // The stored effect identity is returned, not the rotated request's.
        callRef: CALL_REF,
        credentialId: original.credentialId,
        grantRef: original.grantRef,
        grantGeneration: original.grantGeneration,
        quoteRef: original.quoteRef,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    })

    const rows = await calls(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      callRef: CALL_REF,
      credentialId: original.credentialId,
      formanceFinancialState: 'reserved',
      formanceReservationRefs: [RESERVATION_REF],
    })
    const obligations = await backend.run(async (ctx) =>
      await ctx.db.query('moneyProviderObligations').take(10))
    expect(obligations.map((row) => row.callRef)).toEqual([CALL_REF])
  })

  it('finds the Call for replay and recovery reads made under the rotated credential', async () => {
    const backend = convexTestWithMarketComponents()
    await seed(backend)

    await expect(backend.query(internal.capabilityCalls.readReplay, stableIdentity() as never))
      .resolves.toMatchObject({ toolRef: TOOL_REF, state: 'pending' })
    // Recovery/status/cancel resolve the Call by callRef plus principalId and
    // read the stored credential back as evidence.
    await expect(backend.query(internal.capabilityCalls.readRecovery, {
      callRef: CALL_REF,
      principalId: original.principalId,
    })).resolves.toMatchObject({
      callRef: CALL_REF,
      credentialId: original.credentialId,
      ownerId: original.ownerId,
      applicationRef: original.applicationRef,
      environment: original.environment,
      state: 'pending',
    })
    await expect(backend.query(internal.capabilityCalls.readOwnerRecovery, { callRef: CALL_REF }))
      .resolves.toMatchObject({ callRef: CALL_REF, credentialId: original.credentialId })

    await backend.mutation(internal.capabilityCalls.projectRecovery, {
      callRef: CALL_REF,
      principalId: original.principalId,
      state: 'cancelled',
      clearResult: true,
      clearWorkId: true,
      clearAttemptRef: true,
      clearEvidenceHash: true,
      clearDispatchState: true,
      now: NOW,
    })
    const rows = await calls(backend)
    expect(rows[0]).toMatchObject({ state: 'cancelled', credentialId: original.credentialId })
  })

  it('refuses a Principal that shares the principalId but not the rest of the stable tuple', async () => {
    const backend = convexTestWithMarketComponents()
    await seed(backend)

    for (const divergence of [
      { ownerId: 'owner:rotation-other' },
      { applicationRef: 'application:rotation-other' },
      { environment: 'production' as const },
    ]) {
      await expect(backend.mutation(
        internal.capabilityCalls.reserve,
        reserveArgs(divergence) as never,
      )).resolves.toEqual({ kind: 'conflict' })
      await expect(backend.query(
        internal.capabilityCalls.readReplay,
        stableIdentity(divergence) as never,
      )).resolves.toBeNull()
    }
    expect(await calls(backend)).toHaveLength(1)
  })

  it('conflicts without throwing when two stored Calls already share the key', async () => {
    const backend = convexTestWithMarketComponents()
    await seed(backend, [{
      ...original,
      callRef: 'operation-invocation:v1:rotation-duplicate',
      quoteRef: 'operation-commitment:v1:rotation-duplicate',
    }])

    await expect(backend.mutation(internal.capabilityCalls.reserve, reserveArgs() as never))
      .resolves.toEqual({ kind: 'conflict' })
    expect(await calls(backend)).toHaveLength(2)
  })
})
