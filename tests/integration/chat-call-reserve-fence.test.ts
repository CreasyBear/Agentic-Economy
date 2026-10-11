import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { ACTIVE_CHAT_GENERATION_MS } from '../../convex/chatThreads'
import { buildDevelopmentPublishedToolEvidence } from '../unit/capability-supply/fixtures/development-published-tool-evidence'
import { convexTestWithMarketComponents, createTestAgentPrincipal, ownerAdmin } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import { startedTurn } from '../helpers/started-turn'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const callRef = `operation-invocation:v1:${'b'.repeat(64)}`
const quoteRef = `operation-commitment:v1:${'c'.repeat(64)}`
const toolJson = JSON.stringify(buildDevelopmentPublishedToolEvidence().tool)

// These tests own reservation, not background inference. Freeze scheduled jobs
// so an unrelated generator cannot race the active turn under inspection.
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

async function setup(suffix: string) {
  const backend = convexTestWithMarketComponents()
  const { principal: key, grantRef } = await createTestAgentPrincipal(backend, suffix)
  const principal = { kind: 'agent_key' as const, ...key }
  const turn = startedTurn(await backend.mutation(api.chatTurns.startTurn, await withSourceWrite('protected_action', {
    principal, clientTurnId: `call-${suffix}`, prompt: 'Run a Tool',
    operationKey: 'chat-turn.start', correlationId: `start-${suffix}`,
  })))
  expect(await backend.mutation(internal.chatTurns.finishTurn, {
    turnRef: turn.turnRef, promptMessageId: turn.promptMessageId, state: 'working',
  })).toBe(true)
  const grant = await backend.run(ctx => ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', q => q.eq('grantRef', grantRef)).unique())
  if (grant === null || grant.spendingPolicyDigest === undefined) throw new Error('grant_missing')
  const grantPolicyDigest = grant.spendingPolicyDigest
  const now = Date.now()
  await backend.run(ctx => ctx.db.insert('capabilityQuotes', {
    quoteRef, principalId: key.principalId, accountRef: key.ownerId,
    credentialId: key.credentialId, applicationRef: key.applicationRef,
    environment: key.environment, grantRef, grantGeneration: grant.generation,
    grantPolicyDigest, grantExpiresAt: grant.expiresAt,
    toolRef, toolVersion: 1, toolMaterialDigest: 'sha256:tool',
    currentToolDigest: 'sha256:current', toolJson, normalizedInputJson: '{}',
    inputDigest: 'sha256:input', pricingJson: '{}', pricingDigest: 'sha256:pricing',
    decisionAudUnits: '0', budgetPolicyRef: grant.budgetPolicyRef,
    budgetGeneration: 1, maximumSpendPerCallUnits: '0',
    formanceSchemaVersion: 'v1.4.0', policyGeneration: 1,
    legalCustomerRef: key.ownerId, legalCustomerGeneration: 1,
    buyerRevenueUnits: '0', buyerTaxUnits: '0', accountAvailableUnits: '0',
    budgetAvailableUnits: '0', legalExposureAvailableUnits: '0', balanceUnits: '0',
    commercialPolicyRefs: [], commercialPolicyDigest: 'sha256:commercial',
    evidenceDigest: 'sha256:evidence', state: 'issued', expiresAt: now + 60_000,
    createdAt: now, updatedAt: now,
  }))
  const reservation = {
    turnRef: turn.turnRef, quoteRef, callRef, principalId: key.principalId,
    ownerId: key.ownerId, credentialId: key.credentialId,
    applicationRef: key.applicationRef, grantRef, environment: key.environment,
    toolRef, idempotencyKey: `call-${suffix}`, inputDigest: 'sha256:input',
    requestDigest: 'sha256:request', grantGeneration: grant.generation,
    policyDigest: grant.spendingPolicyDigest, grantExpiresAt: grant.expiresAt,
    toolJson, inputJson: '{}', now,
  }
  const cancel = async () => backend.mutation(api.chatTurns.cancelTurn, await withSourceWrite('protected_action', {
    principal, turnRef: turn.turnRef, operationKey: 'chat-turn.cancel',
    correlationId: `cancel-${suffix}`,
  }))
  const snapshot = () => backend.run(async ctx => ({
    calls: await ctx.db.query('capabilityCalls')
      .withIndex('by_principalId_and_idempotencyKey', q => q
        .eq('principalId', key.principalId).eq('idempotencyKey', reservation.idempotencyKey)).collect(),
    quote: await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique(),
    turn: await ctx.db.query('chatTurns')
      .withIndex('by_turnRef', q => q.eq('turnRef', turn.turnRef)).unique(),
  }))
  return { backend, reservation, principal, cancel, snapshot }
}

describe('atomic key Turn Call reservation fence', () => {
  it('joins two Calls to one answer cost without changing either Call financial record', async () => {
    const { backend, reservation, snapshot } = await setup('model-cost-two-calls')
    const secondCallRef = `operation-invocation:v1:${'e'.repeat(64)}`
    const secondQuoteRef = `operation-commitment:v1:${'f'.repeat(64)}`
    await backend.run(async ctx => {
      const quote = await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
      if (quote === null) throw new Error('quote_missing')
      const { _id, _creationTime: _time, ...material } = quote
      await ctx.db.insert('capabilityQuotes', { ...material, quoteRef: secondQuoteRef })
    })
    expect(await backend.mutation(internal.capabilityCalls.reserve, reservation)).toMatchObject({ kind: 'reserved' })
    // The fixture's policy admits one concurrent Call. A two-Call answer can
    // complete its first contribution before purchasing the next one.
    await backend.run(async ctx => {
      const first = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
      if (first === null) throw new Error('call_missing')
      await ctx.db.patch(first._id, { state: 'completed' })
    })
    expect(await backend.mutation(internal.capabilityCalls.reserve, { ...reservation,
      callRef: secondCallRef, quoteRef: secondQuoteRef, idempotencyKey: 'second-model-cost-call',
    })).toMatchObject({ kind: 'reserved' })
    const turn = (await snapshot()).turn
    if (turn?.threadId === undefined || turn.promptMessageId === undefined) throw new Error('turn_missing')
    const binding = { turnRef: turn.turnRef, threadId: turn.threadId, promptMessageId: turn.promptMessageId }
    const before = await backend.run(ctx => ctx.db.query('capabilityCalls').collect())
    for (const [requestRef, amountUsd] of [['sdk:first:0', '0.1'], ['sdk:first:1', '0.2']] as const) {
      await backend.mutation(internal.chatModelCost.begin, { ...binding, requestRef,
        source: 'openrouter', purpose: 'initial', requestedModel: 'test/model',
      })
      await backend.mutation(internal.chatModelCost.observe, { ...binding, requestRef,
        model: 'test/model', inputTokens: 10, outputTokens: 20,
        accounting: { status: 'priced', amountUsd, source: 'inline' },
      })
    }
    await backend.mutation(internal.chatTurns.finishTurn, { turnRef: turn.turnRef,
      promptMessageId: turn.promptMessageId, state: 'completed' })
    const admin = await ownerAdmin(backend, 'user_answer-cost-admin')
    const views = await Promise.all([callRef, secondCallRef].map(async value =>
      admin.query(api.adminConsoleObjects.readAdminObject, { ref: { kind: 'call', ref: value } })))
    for (const view of views) {
      if (view.kind !== 'call') throw new Error('call_missing')
      expect(view.answerModelCost).toMatchObject({ cost: {
        turnRef: turn.turnRef, status: 'complete', knownCostUsd: '0.3', requestCount: 2, unknownRequestCount: 0,
      }, callRefs: [callRef, secondCallRef], callsTruncated: false })
      expect(view.receipt.usage).toBeUndefined()
      expect(JSON.stringify(view.answerModelCost)).not.toContain('Run a Tool')
    }
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual(before)
    expect(await backend.query(internal.chatModelCost.readTurn, { turnRef: turn.turnRef }))
      .toMatchObject({ knownCostUsd: '0.3' })
  })

  it('cancellation first leaves no Call and does not consume the Quote', async () => {
    const { backend, reservation, cancel, snapshot } = await setup('cancel-first')
    expect(await cancel()).toEqual({ kind: 'stopped', turnRef: reservation.turnRef, inFlightEffects: [] })
    expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
      .toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    const state = await snapshot()
    expect(state.calls).toEqual([])
    expect(state.quote).toMatchObject({ state: 'issued' })
  })

  it('reservation first is visible to cancellation and replay cannot bypass the fence', async () => {
    const { backend, reservation, cancel, snapshot } = await setup('reserve-first')
    expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
      .toMatchObject({ kind: 'reserved', reservation: { callRef } })
    const beforeCancel = await snapshot()
    expect(beforeCancel.calls[0]?.chatTurnRef).toBe(reservation.turnRef)
    expect(beforeCancel.quote).toMatchObject({ state: 'consumed', consumedCallRef: callRef })
    expect(beforeCancel.turn).toMatchObject({ inFlightCallRefs: [callRef] })
    // An older reservation without a Turn link must be repaired on replay,
    // using the stored CallRef rather than the newly derived request CallRef.
    await backend.run(async ctx => {
      const row = await ctx.db.query('chatTurns')
        .withIndex('by_turnRef', q => q.eq('turnRef', reservation.turnRef)).unique()
      if (row === null) throw new Error('turn_missing')
      await ctx.db.patch(row._id, { inFlightCallRefs: [] })
    })
    expect(await backend.mutation(internal.capabilityCalls.reserve, {
      ...reservation, callRef: `operation-invocation:v1:${'d'.repeat(64)}`,
    })).toMatchObject({ kind: 'replayed', reservation: { callRef } })
    expect((await snapshot()).turn?.inFlightCallRefs).toEqual([callRef])
    expect(await cancel()).toEqual({ kind: 'in_flight', turnRef: reservation.turnRef,
      inFlightEffects: [{ callRef }] })
    expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
      .toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    const afterCancel = await snapshot()
    expect(afterCancel.calls).toHaveLength(1)
    expect(afterCancel.turn?.inFlightCallRefs).toEqual([callRef])
  })

  it('abandoning a reserved Call clears its Turn and restores its Quote', async () => {
    const { backend, reservation, cancel, snapshot } = await setup('abandon-booking')
    expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
      .toMatchObject({ kind: 'reserved', reservation: { callRef } })
    const { toolJson: _toolJson, inputJson: _inputJson, now: _now, ...abandonment } = reservation
    expect(await backend.mutation(internal.capabilityCalls.abandon, abandonment))
      .toEqual({ kind: 'abandoned' })
    const state = await snapshot()
    expect(state.calls).toEqual([])
    expect(state.turn?.inFlightCallRefs).toEqual([])
    expect(state.quote).toMatchObject({ state: 'issued' })
    expect(await cancel()).toEqual({ kind: 'stopped', turnRef: reservation.turnRef, inFlightEffects: [] })
  })

  it('an abandonment after replay removes the stored CallRef, not the request CallRef', async () => {
    const { backend, reservation, snapshot } = await setup('replay-abandon')
    expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
      .toMatchObject({ kind: 'reserved' })
    const replay = await backend.mutation(internal.capabilityCalls.reserve, {
      ...reservation, callRef: `operation-invocation:v1:${'d'.repeat(64)}`,
    })
    expect(replay).toMatchObject({ kind: 'replayed', reservation: { callRef } })
    if (replay.kind !== 'replayed') throw new Error('replay_missing')
    expect(await backend.mutation(internal.capabilityCalls.abandon, {
      ...replay.reservation, ownerId: reservation.ownerId, turnRef: reservation.turnRef,
    })).toEqual({ kind: 'abandoned' })
    const state = await snapshot()
    expect(state.calls).toEqual([])
    expect(state.turn?.inFlightCallRefs).toEqual([])
    expect(state.quote).toMatchObject({ state: 'issued' })
  })

  it.each([
    ['principalRef', 'wrong-principal'],
    ['accountRef', 'wrong-account'],
    ['credentialLocator', 'wrong-credential'],
    ['grantRef', 'wrong-grant'],
  ] as const)('cannot unlink a Turn whose %s no longer matches the Call', async (field, wrong) => {
    const { backend, reservation, snapshot } = await setup(`unlink-${field}`)
    expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
      .toMatchObject({ kind: 'reserved' })
    await backend.run(async ctx => {
      const turn = await ctx.db.query('chatTurns')
        .withIndex('by_turnRef', q => q.eq('turnRef', reservation.turnRef)).unique()
      if (turn === null) throw new Error('turn_missing')
      await ctx.db.patch(turn._id, { [field]: wrong })
    })
    const { toolJson: _toolJson, inputJson: _inputJson, now: _now, ...abandonment } = reservation
    expect(await backend.mutation(internal.capabilityCalls.abandon, abandonment))
      .toEqual({ kind: 'abandoned' })
    const state = await snapshot()
    expect(state.calls).toEqual([])
    expect(state.turn?.inFlightCallRefs).toEqual([callRef])
  })

  it('does not unlink a Call when dispatch has started', async () => {
    const { backend, reservation, snapshot } = await setup('dispatch-started')
    expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
      .toMatchObject({ kind: 'reserved' })
    await backend.run(async ctx => {
      const call = await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
      if (call === null) throw new Error('call_missing')
      await ctx.db.patch(call._id, { dispatchState: 'enqueued' })
    })
    const { toolJson: _toolJson, inputJson: _inputJson, now: _now, ...abandonment } = reservation
    expect(await backend.mutation(internal.capabilityCalls.abandon, abandonment))
      .toEqual({ kind: 'dispatch_started' })
    const state = await snapshot()
    expect(state.calls).toHaveLength(1)
    expect(state.turn?.inFlightCallRefs).toEqual([callRef])
    expect(state.quote).toMatchObject({ state: 'consumed', consumedCallRef: callRef })
  })

  it('a settled Call stays in Turn history but cancellation is stopped', async () => {
    const { backend, reservation, principal, cancel, snapshot } = await setup('settled-call')
    expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
      .toMatchObject({ kind: 'reserved' })
    await backend.run(async ctx => {
      const call = await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
      if (call === null) throw new Error('call_missing')
      await ctx.db.patch(call._id, { state: 'completed' })
    })
    expect(await cancel()).toEqual({ kind: 'stopped', turnRef: reservation.turnRef, inFlightEffects: [] })
    const turn = await backend.query(api.chatTurns.readTurn, await withSourceWrite('protected_action', {
      principal, turnRef: reservation.turnRef, operationKey: 'chat-turn.read',
      correlationId: 'read-settled-call',
    }))
    expect(turn).toMatchObject({ callRefs: [callRef], inFlightCallRefs: [] })
    expect((await snapshot()).turn?.inFlightCallRefs).toEqual([callRef])
  })

  it('abandoning an unlinked public reservation does not change its Turn', async () => {
    const { backend, reservation, snapshot } = await setup('public-abandon')
    const { turnRef: _turnRef, toolJson: _toolJson, inputJson: _inputJson, now: _now, ...unlinked } = reservation
    expect(await backend.mutation(internal.capabilityCalls.reserve, {
      ...unlinked, toolJson, inputJson: '{}', now: reservation.now,
    })).toMatchObject({ kind: 'reserved', reservation: { callRef } })
    expect(await backend.mutation(internal.capabilityCalls.abandon, unlinked))
      .toEqual({ kind: 'abandoned' })
    const state = await snapshot()
    expect(state.calls).toEqual([])
    expect(state.turn?.inFlightCallRefs).toBeUndefined()
    expect(state.quote).toMatchObject({ state: 'issued' })
  })

  it.each(['supersede-first', 'reserve-first'] as const)(
    'a superseded Turn cannot reserve a Call (%s)',
    async order => {
      const { backend, reservation, principal, snapshot } = await setup(`call-stale-${order}`)
      if (order === 'reserve-first') {
        expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
          .toMatchObject({ kind: 'reserved', reservation: { callRef } })
      }
      const first = await snapshot()
      const threadId = first.turn?.threadId
      if (threadId === undefined) throw new Error('thread_missing')
      await backend.run(async ctx => {
        const thread = await ctx.db.query('chatThreads')
          .withIndex('by_threadId', q => q.eq('threadId', threadId)).unique()
        if (thread === null) throw new Error('thread_missing')
        await ctx.db.patch(thread._id, { activeStartedAt: Date.now() - ACTIVE_CHAT_GENERATION_MS - 1 })
      })
      const next = startedTurn(await backend.mutation(api.chatTurns.startTurn, await withSourceWrite('protected_action', {
        principal, threadId, clientTurnId: `next-${order}`, prompt: 'A newer request',
        operationKey: 'chat-turn.start', correlationId: `next-${order}`,
      })))
      expect(await backend.mutation(internal.chatTurns.finishTurn, {
        turnRef: next.turnRef, promptMessageId: next.promptMessageId, state: 'working',
      })).toBe(true)
      if (order === 'reserve-first') {
        expect(await backend.mutation(internal.capabilityCalls.reserve, {
          ...reservation, turnRef: next.turnRef,
        })).toMatchObject({ kind: 'replayed', reservation: { callRef } })
        expect((await snapshot()).calls[0]?.chatTurnRef).toBe(reservation.turnRef)
      }
      expect((await snapshot()).turn).toMatchObject({
        state: 'canceled', cancelRequestedAt: expect.any(Number),
      })
      expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
        .toMatchObject({ kind: 'refused', code: 'grant_not_found' })
      // The active-prompt check must still fence money even if an old worker
      // writes a stale working state after the supersession transition.
      await backend.run(async ctx => {
        const old = await ctx.db.query('chatTurns')
          .withIndex('by_turnRef', q => q.eq('turnRef', reservation.turnRef)).unique()
        if (old === null) throw new Error('turn_missing')
        await ctx.db.patch(old._id, { state: 'working', cancelRequestedAt: undefined })
      })
      expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
        .toMatchObject({ kind: 'refused', code: 'grant_not_found' })
      const final = await snapshot()
      expect(final.calls).toHaveLength(order === 'reserve-first' ? 1 : 0)
      expect(final.quote).toMatchObject({
        state: order === 'reserve-first' ? 'consumed' : 'issued',
      })
    },
  )

  it.each([
    ['credential', { credentialId: 'another-credential' }],
    ['principal', { principalId: 'another-principal' }],
    ['account', { ownerId: 'another-account' }],
    ['grant', { grantRef: 'another-grant' }],
  ])('rejects a mismatched %s before creating any Call', async (_field, mismatch) => {
    const { backend, reservation, snapshot } = await setup(`wrong-${_field}`)
    expect(await backend.mutation(internal.capabilityCalls.reserve, {
      ...reservation, ...mismatch,
    })).toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    const state = await snapshot()
    expect(state.calls).toEqual([])
    expect(state.quote).toMatchObject({ state: 'issued' })
  })

  it.each(['submitted', 'input-required', 'auth-required', 'completed', 'failed', 'rejected'] as const)(
    'refuses a non-working %s Turn before consuming its Quote',
    async state => {
      const { backend, reservation, snapshot } = await setup(`terminal-${state}`)
      await backend.run(async ctx => {
        const row = await ctx.db.query('chatTurns')
          .withIndex('by_turnRef', q => q.eq('turnRef', reservation.turnRef)).unique()
        if (row === null) throw new Error('turn_missing')
        await ctx.db.patch(row._id, { state })
      })
      expect(await backend.mutation(internal.capabilityCalls.reserve, reservation))
        .toMatchObject({ kind: 'refused', code: 'grant_not_found' })
      const result = await snapshot()
      expect(result.calls).toEqual([])
      expect(result.quote).toMatchObject({ state: 'issued' })
    },
  )
})
