import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Doc } from '../../../convex/_generated/dataModel'
import { convexTestWithMarketComponents, createTestAgentPrincipal } from '../../helpers/convex-fixtures'
import { api, internal } from '../../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { CALL_CONTENT_RETENTION_MS, callContentMayExpire, expireCallContent } from '../../../convex/lib/capabilityExecution/contentRetention/callContent'
import { recordHandler } from '../../../convex/lib/capabilityExecution/callLifecycle/callRecoveryProjection'
import { callResultSchema } from '@/modules/capability-execution/call-contracts'
import { expireContentBatch, LEARNING_RETENTION_MS } from '../../../convex/lib/capabilityExecution/contentRetention/cleanup'
import { toolProcureResultSchema, procureQuoteSnapshotSchema } from '@/modules/capability-execution/procure'
import { projectStoredProcureResult, storedToolProcureResultSchema } from '@/modules/capability-execution/convex'
import { retentionAttempt, retentionBooking, retentionObservation, retentionObligation, retentionQuote, retentionResolution } from './content-retention-fixtures'

const endedAt = 1_000
const now = endedAt + CALL_CONTENT_RETENTION_MS
afterEach(() => vi.useRealTimers())
const call: Omit<Doc<'capabilityCalls'>, '_id' | '_creationTime'> = {
  callRef: 'call:retention', principalId: 'principal:retention', ownerId: 'account:retention',
  credentialId: 'credential:retention', applicationRef: 'application:retention', toolRef: 'tool:retention',
  idempotencyKey: 'original-key', environment: 'sandbox', grantRef: 'grant:retention', grantGeneration: 1,
  policyDigest: 'sha256:policy', grantExpiresAt: 2_000, inputJson: '{"private":"input"}',
  inputDigest: 'sha256:input', requestDigest: 'sha256:request', state: 'completed', dispatchState: 'completed',
  result: { kind: 'completed', callRef: 'call:retention', toolRef: 'tool:retention', evidenceHash: 'sha256:output',
    output: { private: 'output' }, usage: { usageRef: 'usage:retention', observedAt: endedAt,
      chargeState: 'free_tier', amount: { currency: 'AUD', units: '0', exponent: 6 }, priceDigest: 'sha256:price' } },
  createdAt: 100, updatedAt: endedAt,
}

describe('Call content retention boundary', () => {
  it('rejects an invalid cutoff or a continuation without its cutoff before deleting content', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const backend = convexTestWithMarketComponents()
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const id = await backend.run(ctx => ctx.db.insert('capabilityCalls', call))
    for (const args of [{ asOf: -1 }, { asOf: now + 1 }, { asOf: 1.5 }, { cursor: 'cursor:without-cutoff' }]) {
      await expect(backend.mutation(internal.workloadCron.expireAlphaContent, args)).rejects.toThrow('content_retention_checkpoint_invalid')
    }
    expect((await backend.run(ctx => ctx.db.get(id)))?.inputJson).toBe(call.inputJson)
  })

  it('finishes scheduled pages using one cutoff while later eligible content waits for the next sweep', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const backend = convexTestWithMarketComponents()
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const { result: _result, ...pendingCall } = call
    const ids = await backend.run(async ctx => ({
      first: await ctx.db.insert('capabilityCalls', { ...call, callRef: 'call:first' }),
      pending: await ctx.db.insert('capabilityCalls', { ...pendingCall, callRef: 'call:pending', createdAt: 101, state: 'pending' }),
      laterPage: await ctx.db.insert('capabilityCalls', { ...call, callRef: 'call:later-page', createdAt: 102 }),
      boundary: await ctx.db.insert('capabilityCalls', { ...call, callRef: 'call:boundary', createdAt: 103, updatedAt: endedAt + 1 }),
    }))
    await backend.mutation(internal.workloadCron.expireAlphaContent, {})
    vi.setSystemTime(now + 100)
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    const rows = await backend.run(async ctx => ({ first: await ctx.db.get(ids.first), laterPage: await ctx.db.get(ids.laterPage),
      pending: await ctx.db.get(ids.pending), boundary: await ctx.db.get(ids.boundary) }))
    expect(rows.first?.contentExpiredAt).toBe(now)
    expect(rows.laterPage?.contentExpiredAt).toBe(now)
    expect(rows.pending?.inputJson).toBe(call.inputJson)
    expect(rows.boundary?.inputJson).toBe(call.inputJson)
    await backend.mutation(internal.workloadCron.expireAlphaContent, {})
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await backend.run(ctx => ctx.db.get(ids.boundary)))?.contentExpiredAt).toBe(now + 100)
  })

  it('expires exactly at the boundary, preserves identity and prevents a delayed writer restoring output', async () => {
    const backend = convexTestWithMarketComponents()
    const id = await backend.run(ctx => ctx.db.insert('capabilityCalls', call))
    const expire = (at: number) => backend.run(async ctx => {
      const row = await ctx.db.get(id)
      if (row === null) throw new Error('call_missing')
      return await expireCallContent(ctx, row, at)
    })
    expect(await expire(now - 1)).toBe(false)
    expect(await expire(now)).toBe(true)
    expect(await expire(now + 1)).toBe(false)
    const after = await backend.run(ctx => ctx.db.get(id))
    expect(after).toMatchObject({ callRef: call.callRef, idempotencyKey: call.idempotencyKey, state: 'completed',
      inputDigest: call.inputDigest, requestDigest: call.requestDigest, updatedAt: endedAt,
      result: { kind: 'completed', evidenceHash: 'sha256:output', contentExpiredAt: now } })
    expect(after).not.toHaveProperty('inputJson')
    expect(after?.result).not.toHaveProperty('output')
    expect(callResultSchema.parse(after?.result)).toEqual(after?.result)
    expect(callResultSchema.safeParse({ ...after?.result, output: 'restored' }).success).toBe(false)
    await backend.run(ctx => recordHandler(ctx, { callRef: call.callRef, principalId: call.principalId,
      state: 'completed', result: call.result!, now: now + 2 }))
    expect(await backend.run(ctx => ctx.db.get(id))).toEqual(after)
  })

  it.each(['pending', 'reconciliation_required'] as const)('retains %s content despite its age', async state => {
    const backend = convexTestWithMarketComponents()
    const id = await backend.run(ctx => ctx.db.insert('capabilityCalls', { ...call, state }))
    expect(await backend.run(async ctx => callContentMayExpire(ctx, (await ctx.db.get(id))!, now))).toBe(false)
    expect((await backend.run(ctx => ctx.db.get(id)))?.inputJson).toBe(call.inputJson)
  })

  it('retains a financial Call without a final Purchase resolution record', async () => {
    const backend = convexTestWithMarketComponents()
    const id = await backend.run(ctx => ctx.db.insert('capabilityCalls', { ...call, formanceFinancialState: 'settled', attemptRef: 'attempt:retention' }))
    expect(await backend.run(async ctx => callContentMayExpire(ctx, (await ctx.db.get(id))!, now))).toBe(false)
  })

  it('uses the final resolution clock and keeps content through a dispute, reversal or pending report', async () => {
    const backend = convexTestWithMarketComponents()
    const ids = await backend.run(async ctx => ({
      call: await ctx.db.insert('capabilityCalls', { ...call, formanceFinancialState: 'settled' }),
      resolution: await ctx.db.insert('purchaseResolutionRecords', { ...retentionResolution, resolvedAt: endedAt + 1 }),
      obligation: await ctx.db.insert('moneyProviderObligations', retentionObligation),
    }))
    const eligible = () => backend.run(async ctx => callContentMayExpire(ctx, (await ctx.db.get(ids.call))!, now))
    expect(await eligible()).toBe(false)
    await backend.run(ctx => ctx.db.patch(ids.resolution, { resolvedAt: endedAt, terminalState: 'disputed' }))
    expect(await eligible()).toBe(false)
    await backend.run(async ctx => {
      await ctx.db.patch(ids.resolution, { terminalState: 'completed' })
      await ctx.db.patch(ids.obligation, { reversalState: 'outcome_unknown' })
    })
    expect(await eligible()).toBe(false)
    await backend.run(ctx => ctx.db.patch(ids.obligation, { reversalState: undefined }))
    const { createdAt: _createdAt, ...originalResolution } = retentionResolution
    const reportId = await backend.run(ctx => ctx.db.insert('paidCallReports', {
      reportRef: 'report:retention', callRef: call.callRef, accountRef: call.ownerId, reporterRef: 'owner:retention',
      toolRef: call.toolRef, providerRef: 'provider:retention', environment: 'sandbox', reason: 'answer_not_useful',
      booking: retentionBooking, originalSettlementRefs: ['settlement:retention'], originalResolution,
      reportDigest: 'sha256:report', createdAt: endedAt, updatedAt: endedAt, state: 'pending', nextWorkAt: now,
    }))
    expect(await eligible()).toBe(false)
    await backend.run(async ctx => {
      const report = (await ctx.db.get(reportId))!
      const { _id, _creationTime, ...fields } = report
      const { nextWorkAt: _nextWorkAt, ...base } = fields.state === 'pending' ? fields : { ...fields, nextWorkAt: 0 }
      await ctx.db.replace(reportId, { ...base, state: 'posted', postedAt: endedAt,
        buyerRefundTransactionRef: 'refund:retention', transactionRefs: ['refund:retention'] })
      await ctx.db.patch(ids.resolution, { terminalState: 'refunded' })
    })
    expect(await eligible()).toBe(true)
  })

  it('removes every purchase copy in repeatable batches while preserving settlement identities and digests', async () => {
    const backend = convexTestWithMarketComponents()
    const delivered = {
      schemaVersion: 'tool.procure:v1', kind: 'delivered', status: 'delivered', idempotencyKey: 'original-key',
      toolRef: call.toolRef, quoteRef: retentionQuote.quoteRef, callRef: call.callRef,
      input: { private: 'input' }, output: { private: 'output' }, endpoint: 'https://provider.test?private=input',
      price: { totalAud: 'A$0.01', netAud: 'A$0.01', gstAud: 'A$0.00' },
      audit: { routingLatencyMs: 1, executionLatencyMs: 2, totalLatencyMs: 3, jevDecisionsCostAud: '0' },
    }
    const ids = await backend.run(async ctx => ({
      call: await ctx.db.insert('capabilityCalls', { ...call, quoteRef: retentionQuote.quoteRef, formanceFinancialState: 'settled' }),
      quote: await ctx.db.insert('capabilityQuotes', retentionQuote),
      resolution: await ctx.db.insert('purchaseResolutionRecords', retentionResolution),
      obligation: await ctx.db.insert('moneyProviderObligations', retentionObligation),
      attempt: await ctx.db.insert('moneyX402PaymentAttempts', retentionAttempt),
      observation: await ctx.db.insert('providerConsequenceJournal', retentionObservation),
      cache: await ctx.db.insert('operationKeys', { scope: 'capability_execution', actorKind: 'agent',
        actorRef: call.principalId, operationName: 'tool.procure', key: 'original-key', requestHash: 'sha256:request',
        status: 'succeeded', resultHash: 'sha256:original-result', resultJson: JSON.stringify(delivered),
        effectRefs: [retentionQuote.quoteRef, call.callRef], createdAt: 100, updatedAt: endedAt }),
    }))
    const before = await backend.run(async ctx => ({ resolution: await ctx.db.get(ids.resolution), obligation: await ctx.db.get(ids.obligation) }))
    await Promise.all([1, 2].map(() => backend.run(ctx => expireContentBatch(ctx, 'calls', null, now))))
    for (const phase of ['quotes', 'attempts', 'observations', 'procure'] as const) {
      await backend.run(ctx => expireContentBatch(ctx, phase, null, now))
      await backend.run(ctx => expireContentBatch(ctx, phase, null, now + 1))
    }
    const after = await backend.run(async ctx => ({ call: await ctx.db.get(ids.call), quote: await ctx.db.get(ids.quote),
      attempt: await ctx.db.get(ids.attempt), observation: await ctx.db.get(ids.observation), cache: await ctx.db.get(ids.cache),
      resolution: await ctx.db.get(ids.resolution), obligation: await ctx.db.get(ids.obligation) }))
    expect(after).toMatchObject(before)
    expect(JSON.stringify(after)).not.toContain('private')
    expect(after.call).toMatchObject({ callRef: call.callRef, inputDigest: call.inputDigest, contentExpiredAt: now })
    expect(after.quote).toMatchObject({ inputDigest: retentionQuote.inputDigest, evidenceDigest: retentionQuote.evidenceDigest })
    expect(after.attempt).toMatchObject({ paymentIdentifier: retentionAttempt.paymentIdentifier,
      amountUnits: retentionAttempt.amountUnits, quarantinedResponseDigest: retentionAttempt.quarantinedResponseDigest })
    expect(after.observation).toMatchObject({ observationDigest: retentionObservation.observationDigest })
    expect(after.cache).toMatchObject({ status: 'succeeded', resultHash: 'sha256:original-result', effectRefs: [retentionQuote.quoteRef, call.callRef] })
    const stored = storedToolProcureResultSchema.parse(JSON.parse(after.cache!.resultJson!))
    expect(stored).toMatchObject({ kind: 'delivered', contentExpiredAt: now, price: delivered.price })
    expect(projectStoredProcureResult(stored)).toMatchObject({ kind: 'delivered', contentExpiredAt: now, money: { kind: 'historical_display_only' } })
  })

  it('expires an unused Quote and its procurement checkpoint after 24 hours without deleting the retry identity', async () => {
    const backend = convexTestWithMarketComponents()
    const expiryTime = retentionQuote.expiresAt + 24 * 60 * 60 * 1000
    const cacheId = await backend.run(async ctx => {
      const { consumedCallRef: _consumedCallRef, ...unused } = retentionQuote
      await ctx.db.insert('capabilityQuotes', { ...unused, state: 'issued' })
      return await ctx.db.insert('operationKeys', { scope: 'capability_execution', actorKind: 'agent', actorRef: call.principalId,
        operationName: 'tool.procure', key: 'original-key', requestHash: 'sha256:request', status: 'in_progress',
        resultJson: JSON.stringify({ quoteRef: retentionQuote.quoteRef, toolRef: call.toolRef, price: { currency: 'AUD', units: '10000', exponent: 6 },
          input: { private: 'input' }, endpoint: 'https://provider.test?private=input', routingLatencyMs: 1 }),
        effectRefs: [retentionQuote.quoteRef], createdAt: 100, updatedAt: endedAt })
    })
    await backend.run(ctx => expireContentBatch(ctx, 'quotes', null, expiryTime - 1))
    await backend.run(ctx => expireContentBatch(ctx, 'procure', null, expiryTime - 1))
    expect((await backend.run(ctx => ctx.db.get(cacheId)))?.contentExpiredAt).toBeUndefined()
    await backend.run(ctx => expireContentBatch(ctx, 'quotes', null, expiryTime))
    await backend.run(ctx => expireContentBatch(ctx, 'procure', null, expiryTime))
    const row = (await backend.run(ctx => ctx.db.get(cacheId)))!
    expect(procureQuoteSnapshotSchema.parse(JSON.parse(row.resultJson!))).toMatchObject({ quoteRef: retentionQuote.quoteRef, contentExpiredAt: expiryTime })
    expect(row.status).toBe('in_progress')
    expect(row.effectRefs).toEqual([retentionQuote.quoteRef])
    expect(row.resultJson).not.toContain('private')
  })

  it('deletes learning decisions at 90 days and retains recent decisions', async () => {
    const backend = convexTestWithMarketComponents()
    const end = endedAt + LEARNING_RETENTION_MS
    const insert = (at: number) => backend.run(ctx => ctx.db.insert('toolSelectionDecisions', {
      kind: 'procure', correlationId: `selection:${at}`, offered: [], tier: 'no_match', fit: [], latencyMs: 1, createdAt: at,
    }))
    const old = await insert(endedAt)
    const recent = await insert(endedAt + 1)
    await backend.run(ctx => expireContentBatch(ctx, 'learning', null, end))
    expect(await backend.run(ctx => ctx.db.get(old))).toBeNull()
    expect(await backend.run(ctx => ctx.db.get(recent))).not.toBeNull()
  })

  it('cannot restore content when a delayed procurement completion follows an expired checkpoint', async () => {
    const backend = convexTestWithMarketComponents()
    const { principal } = await createTestAgentPrincipal(backend, 'expired-procure', { environment: 'sandbox' })
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    const input = { kind: 'exact', toolRef, input: { private: 'input' }, maxSpendAud: '0.50', idempotencyKey: 'original-key' }
    const expiredAt = Date.now() - 1
    const id = await backend.run(ctx => ctx.db.insert('operationKeys', { scope: 'capability_execution', actorKind: 'agent',
      actorRef: principal.principalId, operationName: 'tool.procure', key: input.idempotencyKey, requestHash: canonicalDigest(input),
      status: 'in_progress', effectRefs: ['quote:retention'], createdAt: expiredAt - 100, updatedAt: expiredAt,
      contentExpiredAt: expiredAt, resultJson: JSON.stringify({ quoteRef: 'quote:retention', toolRef,
        contentExpiredAt: expiredAt, price: { currency: 'AUD', units: '10000', exponent: 6 }, routingLatencyMs: 1 }) }))
    const result = { schemaVersion: 'tool.procure:v1', kind: 'delivered', status: 'delivered', idempotencyKey: input.idempotencyKey,
      toolRef, quoteRef: 'quote:retention', callRef: 'call:retention', input: input.input, output: { private: 'output' },
      endpoint: 'https://provider.test?private=input', money: { kind: 'recorded', price: { currency: 'AUD', units: '10000', exponent: 6 },
        usage: { usageRef: 'usage:retention', observedAt: 1, chargeState: 'paid',
          amount: { currency: 'AUD', units: '10000', exponent: 6 }, priceDigest: 'sha256:price' } },
      audit: { routingLatencyMs: 1, executionLatencyMs: 2, totalLatencyMs: 3, jevDecisionsCostAud: '0' } }
    const complete = async () => backend.mutation(api.capabilityProcure.complete, await withSourceWrite('protected_action', {
      principal, idempotencyKey: input.idempotencyKey, inputJson: JSON.stringify(input), resultJson: JSON.stringify(result),
      operationKey: `complete:${crypto.randomUUID()}`, correlationId: 'complete:expired',
    }))
    const first = await complete()
    expect(first).toMatchObject({ kind: 'replay', quoteRef: 'quote:retention' })
    if (first.kind !== 'replay') throw new Error('completion_missing')
    expect(toolProcureResultSchema.parse(JSON.parse(first.resultJson!))).toMatchObject({ status: 'delivered', contentExpiredAt: expiredAt })
    expect(first.resultJson).not.toContain('private')
    expect(await complete()).toEqual(first)
    expect(await backend.run(ctx => ctx.db.get(id))).toMatchObject({ status: 'succeeded', requestHash: canonicalDigest(input),
      contentExpiredAt: expiredAt, effectRefs: ['quote:retention', 'call:retention'], resultJson: first.resultJson })
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
  })
})
