import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { createFormanceContext, installPackage4FormanceSchema } from '@/modules/money/formance'
import { adjustFormanceSpendingPeriod, readFormanceSpendingPeriod } from '@/modules/money/formance-workflows'
import { convexModules } from '../helpers/convex-fixtures'
import {
  acknowledgeAgentSpendingPeriod,
  prepareAgentSpendingPeriods,
  spendingPeriodsAreCurrent,
} from '../../convex/lib/agentSpendingPeriods'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { spendingPeriodAdjustmentReference, type SpendingPeriodAdjustment } from '@/modules/money/public'

const now = Date.UTC(2026, 8, 14, 12)
const input = {
  principalRef: 'principal:period-contract',
  dailyLimitUnits: '100',
  monthlyLimitUnits: '200',
  authorityDigest: canonicalDigest({ authority: 1 }),
  now,
}
const completedRef = (command: SpendingPeriodAdjustment) => [spendingPeriodAdjustmentReference(command)]
const backend = () => convexTest(schema, convexModules)

function callRow(overrides: { formanceFinancialState?: 'reservation_pending' | 'reserved' | 'outcome_unknown'; createdAt?: number } = {}) {
  return {
    callRef: 'call:pending', principalId: input.principalRef, ownerId: 'account:one',
    credentialId: 'credential:one', applicationRef: 'application:one', toolRef: 'tool:one',
    idempotencyKey: 'once', environment: 'sandbox' as const, grantRef: 'grant:one',
    grantGeneration: 1, policyDigest: input.authorityDigest, grantExpiresAt: now + 60_000,
    inputDigest: canonicalDigest({}), requestDigest: canonicalDigest({ request: 1 }),
    state: 'pending' as const, updatedAt: now, createdAt: now, ...overrides,
  }
}

describe('Agent spending period control contracts', () => {
  it('prepares identical initialization commands until exact acknowledgement, then admits the same period', async () => {
    const t = backend()
    const [first, competing] = await Promise.all([
      t.run((ctx) => prepareAgentSpendingPeriods(ctx, input)),
      t.run((ctx) => prepareAgentSpendingPeriods(ctx, input)),
    ])
    expect(competing).toEqual(first)
    expect(first.kind).toBe('prepared')
    if (first.kind !== 'prepared') throw new Error('expected periods')
    expect(first.commands).toHaveLength(2)
    const retries = await Promise.all([
      t.run((ctx) => prepareAgentSpendingPeriods(ctx, input)),
      t.run((ctx) => prepareAgentSpendingPeriods(ctx, input)),
    ])
    expect(retries).toEqual([first, first])
    expect(await t.run((ctx) => spendingPeriodsAreCurrent(ctx, { ...input, spendingPeriods: first.spendingPeriods }))).toBe(false)
    for (const command of first.commands) {
      expect(await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, {
        command, transactionRefs: [`ae-p4:${'a'.repeat(64)}:unrelated`],
      }))).toEqual({ kind: 'conflict' })
      expect(await t.run((ctx) => spendingPeriodsAreCurrent(ctx, { ...input, spendingPeriods: first.spendingPeriods }))).toBe(false)
      const result = { command, transactionRefs: completedRef(command) }
      expect(await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, result))).toEqual({ kind: 'applied' })
      expect(await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, result))).toEqual({ kind: 'replayed' })
    }
    expect(await t.run((ctx) => spendingPeriodsAreCurrent(ctx, { ...input, spendingPeriods: first.spendingPeriods }))).toBe(true)
    expect(await t.run((ctx) => ctx.db.query('agentSpendingPeriods').collect())).toHaveLength(2)
  })

  it('recovers a pending ceiling unchanged before deriving the next policy delta from applied configuration', async () => {
    const t = backend()
    const first = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, input))
    if (first.kind !== 'prepared') throw new Error('expected periods')
    const changed = { ...input, dailyLimitUnits: '50', monthlyLimitUnits: '50', authorityDigest: canonicalDigest({ authority: 2 }) }
    // A lost acknowledgement and newer policy must not rewrite already submitted material.
    expect(await t.run((ctx) => prepareAgentSpendingPeriods(ctx, changed))).toEqual(first)
    for (const command of first.commands) await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, { command, transactionRefs: completedRef(command) }))
    const second = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, changed))
    if (second.kind !== 'prepared') throw new Error('expected adjustment')
    expect(second.commands.map((command) => [command.revision, command.previousLimitUnits, command.targetLimitUnits]))
      .toEqual([[2, '100', '50'], [2, '200', '50']])
    expect(await t.run((ctx) => spendingPeriodsAreCurrent(ctx, { ...input, spendingPeriods: first.spendingPeriods }))).toBe(false)
    const command = second.commands[0]!
    expect(await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, {
      command: { ...command, previousLimitUnits: '0' }, transactionRefs: completedRef(command),
    }))).toEqual({ kind: 'conflict' })
    expect((await t.run((ctx) => prepareAgentSpendingPeriods(ctx, changed)))).toEqual(second)
  })

  it('fences a policy delta behind an unresolved admitted reservation and permits it after reservation completion', async () => {
    const t = backend()
    const first = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, input))
    if (first.kind !== 'prepared') throw new Error('expected periods')
    for (const command of first.commands) await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, { command, transactionRefs: completedRef(command) }))
    const id = await t.run((ctx) => ctx.db.insert('capabilityCalls', callRow({ formanceFinancialState: 'reservation_pending' })))
    const changed = { ...input, monthlyLimitUnits: '150' }
    expect(await t.run((ctx) => prepareAgentSpendingPeriods(ctx, changed))).toEqual({ kind: 'refused', reason: 'spending_period_reservation_recovery_pending' })
    await t.run((ctx) => ctx.db.patch(id, { formanceFinancialState: 'outcome_unknown' }))
    expect(await t.run((ctx) => prepareAgentSpendingPeriods(ctx, changed))).toEqual({ kind: 'refused', reason: 'spending_period_reservation_recovery_pending' })
    await t.run((ctx) => ctx.db.patch(id, { formanceFinancialState: 'reserved', formanceReservationRefs: ['aud', 'usdc', 'obligation'] }))
    const resumed = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, changed))
    expect(resumed.kind).toBe('prepared')
    if (resumed.kind === 'prepared') expect(resumed.commands).toMatchObject([{ revision: 2, previousLimitUnits: '200', targetLimitUnits: '150' }])
  })

  it('rejects ambiguous legacy current-month history without minting capacity and rechecks at a clean month', async () => {
    const t = backend()
    await t.run((ctx) => ctx.db.insert('capabilityCalls', callRow()))
    expect(await t.run((ctx) => prepareAgentSpendingPeriods(ctx, input))).toEqual({ kind: 'refused', reason: 'spending_period_legacy_history_requires_support' })
    expect(await t.run((ctx) => ctx.db.query('agentSpendingPeriods').collect())).toEqual([])
    const fresh = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, { ...input, now: Date.UTC(2026, 9, 1) }))
    expect(fresh.kind).toBe('prepared')
  })

  it('expires old-day snapshots while retaining the acknowledged monthly revision', async () => {
    const t = backend()
    const first = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, input))
    if (first.kind !== 'prepared') throw new Error('expected periods')
    for (const command of first.commands) await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, { command, transactionRefs: completedRef(command) }))
    const tomorrow = { ...input, now: Date.UTC(2026, 8, 15) }
    expect(await t.run((ctx) => spendingPeriodsAreCurrent(ctx, { ...tomorrow, spendingPeriods: first.spendingPeriods }))).toBe(false)
    const next = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, tomorrow))
    if (next.kind !== 'prepared') throw new Error('expected next day')
    expect(next.commands).toHaveLength(1)
    expect(next.commands[0]?.periodKind).toBe('day')
    expect(next.spendingPeriods.monthly).toEqual(first.spendingPeriods.monthly)
  })

  it('initializes a new day without releasing or moving an old uncertain reservation', async () => {
    const t = backend()
    const first = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, input))
    if (first.kind !== 'prepared') throw new Error('expected periods')
    for (const command of first.commands) await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, { command, transactionRefs: completedRef(command) }))
    const id = await t.run((ctx) => ctx.db.insert('capabilityCalls', callRow({ formanceFinancialState: 'outcome_unknown' })))
    const next = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, { ...input, now: Date.UTC(2026, 8, 15) }))
    if (next.kind !== 'prepared') throw new Error('expected next day')
    expect(next.commands).toMatchObject([{ periodKind: 'day', previousLimitUnits: '0', targetLimitUnits: '100' }])
    expect(next.spendingPeriods.monthly).toEqual(first.spendingPeriods.monthly)
    expect((await t.run((ctx) => ctx.db.get(id)))?.formanceFinancialState).toBe('outcome_unknown')
  })

  it('acknowledges a zero ceiling without fabricating a ledger transaction', async () => {
    const t = backend()
    const zero = { ...input, dailyLimitUnits: '0', monthlyLimitUnits: '0' }
    const prepared = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, zero))
    if (prepared.kind !== 'prepared') throw new Error('expected zero configuration')
    for (const command of prepared.commands) {
      expect(await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, { command, transactionRefs: [] }))).toEqual({ kind: 'applied' })
      expect(await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, { command, transactionRefs: [] }))).toEqual({ kind: 'replayed' })
    }
    expect(await t.run((ctx) => spendingPeriodsAreCurrent(ctx, { ...zero, spendingPeriods: prepared.spendingPeriods }))).toBe(true)
  })

  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('recovers real ledger success before acknowledgement without reminting or losing a newer ceiling', async () => {
    const t = backend()
    const context = createFormanceContext({ environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069',
      ledger: `ae-period-control-${Date.now()}-${process.pid}`, requestTimeoutMs: 10_000 })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
    const first = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, input))
    if (first.kind !== 'prepared') throw new Error('expected initial periods')
    for (const command of first.commands) {
      const result = await adjustFormanceSpendingPeriod(context, command)
      if (result.kind !== 'completed') throw new Error(`initial_effect:${JSON.stringify(result)}`)
      await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, { command, transactionRefs: [...result.transactionRefs] }))
    }
    const lowered = { ...input, dailyLimitUnits: '50', monthlyLimitUnits: '50' }
    const pending = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, lowered))
    if (pending.kind !== 'prepared') throw new Error('expected reduction')
    const command = pending.commands[0]!
    const appliedWithoutAcknowledgement = await adjustFormanceSpendingPeriod(context, command)
    expect(appliedWithoutAcknowledgement).toMatchObject({ kind: 'completed', replayed: false })
    const raised = { ...input, dailyLimitUnits: '75', monthlyLimitUnits: '150' }
    const recovery = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, raised))
    expect(recovery).toEqual(pending)
    if (recovery.kind !== 'prepared') throw new Error('expected exact pending recovery')
    for (const saved of recovery.commands) {
      const result = await adjustFormanceSpendingPeriod(context, saved)
      if (result.kind !== 'completed') throw new Error(`recovery_effect:${JSON.stringify(result)}`)
      if (saved.periodKind === command.periodKind) expect(result).toMatchObject({ replayed: true,
        transactionRefs: appliedWithoutAcknowledgement.kind === 'completed' ? appliedWithoutAcknowledgement.transactionRefs : [] })
      expect(await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, { command: saved, transactionRefs: [...result.transactionRefs] })))
        .toEqual({ kind: 'applied' })
    }
    const next = await t.run((ctx) => prepareAgentSpendingPeriods(ctx, raised))
    if (next.kind !== 'prepared') throw new Error('expected newest configuration')
    expect(next.commands.map(c => c.previousLimitUnits)).toEqual(['50', '50'])
    for (const saved of next.commands) {
      const result = await adjustFormanceSpendingPeriod(context, saved)
      if (result.kind !== 'completed') throw new Error(`latest_effect:${JSON.stringify(result)}`)
      await t.run((ctx) => acknowledgeAgentSpendingPeriod(ctx, { command: saved, transactionRefs: [...result.transactionRefs] }))
      expect(await readFormanceSpendingPeriod(context, saved)).toMatchObject({ kind: 'available', units: saved.targetLimitUnits })
    }
    expect(await t.run((ctx) => spendingPeriodsAreCurrent(ctx, { ...raised, spendingPeriods: next.spendingPeriods }))).toBe(true)
  })

  it('rejects malformed periods and unsupported limits without state changes', async () => {
    const t = backend()
    for (const invalid of [
      { ...input, now: Number.NaN }, { ...input, dailyLimitUnits: '-1' },
      { ...input, monthlyLimitUnits: '01' }, { ...input, dailyLimitUnits: '300' },
      { ...input, authorityDigest: 'invalid' },
    ]) expect(await t.run((ctx) => prepareAgentSpendingPeriods(ctx, invalid))).toEqual({ kind: 'refused', reason: 'spending_period_input_invalid' })
    expect(await t.run((ctx) => ctx.db.query('agentSpendingPeriods').collect())).toEqual([])
  })
})
