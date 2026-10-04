import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { seedCommercialPolicies } from '../../helpers/quote-fixtures'
import { readCommercialPolicyGate } from '../../../convex/moneyCommercialPolicy'
import { digestReference } from '@/modules/money/public'
import { readFrozenMonthlyDraft, monthlyDraftRef, freezeMonthlyDraft } from '@/modules/capability-execution/monthly-usage-draft'
import { supportDigest } from '@/modules/capability-execution/service-usage-evidence'
import { createPublicToolRef } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { blockrunTool, blockrunChatReceipt } from '../capability-execution/fixtures/blockrun-service-unit-evidence'
import { upsertCallProjection } from '../../../convex/lib/capabilityExecution/callLifecycle/dispatchProjection'
const ledger = vi.hoisted(() => ({ listTransactions: vi.fn(), createTransaction: vi.fn(), revertTransaction: vi.fn() }))
vi.mock('@/modules/money/formance', async original => ({ ...await original<typeof import('@/modules/money/formance')>(),
  readFormanceConfiguration: () => ({ kind: 'configured', configuration: { ledger: process.env.AE_FORMANCE_LEDGER, environment: process.env.AE_FORMANCE_ENVIRONMENT, gatewayUrl: new URL(process.env.AE_FORMANCE_GATEWAY_URL!).origin } }),
  createFormanceContext: (configuration: Record<string,unknown>) => ({ configuration, sdk: { ledger: { v2: ledger } } }),
}))
const month = '2026-09', now = Date.UTC(2026, 9, 2), occurredAt = Date.UTC(2026, 8, 15)
const callRef = `operation-invocation:v1:${'a'.repeat(64)}`, hash = `sha256:${'a'.repeat(64)}`
const saleRef = `ae-p4:${'1'.repeat(64)}`, providerRef = `ae-p4:${'2'.repeat(64)}`
function page(accountRef: string, units = 10001n) {
  return { v2TransactionsCursorResponse: { cursor: { data: [{ id: 1n, reference: saleRef, template: 'BUYER_SALE_SETTLED', timestamp: new Date(occurredAt), insertedAt: new Date(occurredAt), reverted: false,
    metadata: { account_digest: digestReference('account', accountRef), call_digest: digestReference('call', callRef) },
    postings: [{ source: `calls:${digestReference('call', callRef)}:buyer_reserved`, destination: 'platform:revenue:sales', asset: 'AUD/6', amount: units }] }], hasMore: false, pageSize: 15 } } }
}
async function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'); vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'sandbox')
  vi.stubEnv('AE_FORMANCE_LEDGER', 'fixture'); vi.stubEnv('AE_FORMANCE_GATEWAY_URL', 'https://fixture.invalid')
  const backend = convexTestWithMarketComponents(), owner = await publishedBusinessOwner(backend, 'monthly-draft')
  const id = await backend.run(async ctx => {
    const id = await ctx.db.insert('capabilityCalls', { callRef, ownerId: owner.canonicalAccountRef, principalId: owner.canonicalPrincipalRef,
      credentialId: 'credential:original', applicationRef: 'application:one', toolRef: 'tool:one', idempotencyKey: 'key:one', environment: 'sandbox',
      grantRef: 'grant:one', grantGeneration: 1, policyDigest: hash, grantExpiresAt: now + 10000, inputDigest: hash, requestDigest: hash,
      state: 'completed', result: { kind: 'completed', callRef, toolRef: 'tool:one', output: {}, evidenceHash: hash },
      formanceFinancialState: 'settled', formanceSettlementRefs: [saleRef, providerRef], buyerSaleTransactionRef: saleRef, createdAt: occurredAt, updatedAt: occurredAt })
    await ctx.db.insert('capabilityServiceUsageRecords', { usageRef: 'usage:one', callRef, callDigest: digestReference('call', callRef), accountRef: owner.canonicalAccountRef, principalRef: owner.canonicalPrincipalRef,
      credentialRef: 'credential:original', applicationRef: 'application:one', toolRef: 'tool:one', providerRef: 'provider:one', environment: 'sandbox', unitDefinitionRef: 'delivered_request:v1',
      quantityUnits: '1', quantityExponent: 0, source: 'validated_call_result', priceDigest: hash, sourceEvidenceHash: hash, supportDigest: supportDigest({state: 'completed', resultKind: 'completed', evidenceHash: hash}),
      timeBasis: 'call_updated', callCreatedAt: occurredAt, occurredAt, observedAt: occurredAt })
    return id
  })
  ledger.listTransactions.mockResolvedValue(page(owner.canonicalAccountRef))
  return { backend, owner, id }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); Object.values(ledger).forEach(mock => mock.mockReset()) })
describe('read-only monthly draft boundary', () => {
  it('freezes provider quantities separately from money and preserves the old draft across a correction', async () => {
    const f = await fixture(), tool = blockrunTool()
    const toolRef = createPublicToolRef({operationId:tool.operationId,publicationRef:tool.identity.publicationRef,publicationRevision:tool.identity.publicationRevision,contractRef:tool.contract.ref})
    await f.backend.run(async ctx => {
      for (const row of await ctx.db.query('capabilityServiceUsageRecords').collect()) await ctx.db.delete(row._id)
      await ctx.db.insert('actionExecutionAttempts',{executionRef:callRef,attemptRef:`operation-attempt:${callRef}:1`,attemptNumber:1,effectGeneration:1,
        actor:{callerRef:'synthetic:caller',principalRef:f.owner.canonicalPrincipalRef},idempotency:{operationKey:'synthetic-operation',materialInputDigest:hash,effectIdentity:'synthetic-effect'},
        lease:{owner:'synthetic-lease',expiresAt:new Date(now+10000).toISOString()},release:{state:'released',observedAt:new Date(occurredAt).toISOString()},outcome:{state:'returned',businessOutcome:'operation_succeeded'},recordedAt:new Date(occurredAt).toISOString()})
      await ctx.db.patch(f.id,{toolRef,toolJson:JSON.stringify(tool),inputJson:'{"model":"requested-model"}',requestDigest:canonicalDigest('logical-request'),
        attemptRef:`operation-attempt:${callRef}:1`,result:{kind:'completed',callRef,toolRef,output:blockrunChatReceipt,evidenceHash:hash},evidenceHash:hash,
        usage:{usageRef:'usage:synthetic',observedAt:occurredAt,amount:{currency:'AUD',units:'10001',exponent:6},chargeState:'paid',priceDigest:tool.priceDigest}})
      const call = (await ctx.db.get(f.id))!
      await upsertCallProjection(ctx,call,{state:'completed',result:call.result!,attemptRef:call.attemptRef!,evidenceHash:hash,usage:call.usage!,dispatchState:'completed'},call.updatedAt)
    })
    const first = await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft,{month,revision:1})
    if(first.kind !== 'available')throw new Error(first.code)
    const snapshot = readFrozenMonthlyDraft(first.snapshotJson,first.snapshotDigest)
    expect(snapshot.snapshot.providerUnitEvidence?.[0]?.evidence.current?.units.map(unit=>unit.quantityUnits)).toEqual(['12','8'])
    expect(snapshot.reconciliation.totals.grossChargeUnits).toBe('10001')
    vi.setSystemTime(now+1000)
    await f.backend.run(async ctx=>{
      await ctx.db.patch(f.id,{result:{kind:'completed',callRef,toolRef,output:{...blockrunChatReceipt,usage:{prompt_tokens:14,completion_tokens:8,total_tokens:22}},evidenceHash:hash},updatedAt:now+1000})
      const call=(await ctx.db.get(f.id))!
      await upsertCallProjection(ctx,call,{state:'completed',result:call.result!,attemptRef:call.attemptRef!,evidenceHash:hash,usage:call.usage!,dispatchState:'completed'},call.updatedAt)
    })
    expect(await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft,{month,revision:1})).toEqual(first)
    const next=await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft,{month,revision:2})
    if(next.kind!=='available')throw new Error(next.code)
    const supplemented=readFrozenMonthlyDraft(next.snapshotJson,next.snapshotDigest)
    expect(supplemented.snapshot.providerUnitEvidence?.[0]?.evidence.current).toMatchObject({units:[{quantityUnits:'14'},{quantityUnits:'8'}],occurredAt})
    expect(supplemented.reconciliation.totals.grossChargeUnits).toBe('10001')
    expect(ledger.createTransaction).not.toHaveBeenCalled();expect(ledger.revertTransaction).not.toHaveBeenCalled()
  })
  it('preserves all admitted sources across retry, next-day replay and canonical correction; explicit supplement sees later facts', async () => {
    const f = await fixture(), args = {month, revision: 1}
    const first = await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, args)
    expect(first.kind).toBe('available')
    if (first.kind !== 'available') throw new Error(first.code)
    const frozen = readFrozenMonthlyDraft(first.snapshotJson, first.snapshotDigest)
    const {providerUnitEvidence: _providerUnits, ...legacy} = frozen.snapshot
    const legacyFrozen = freezeMonthlyDraft(legacy)
    expect(readFrozenMonthlyDraft(legacyFrozen.snapshotJson, legacyFrozen.snapshotDigest).snapshot).not.toHaveProperty('providerUnitEvidence')
    expect(frozen.reconciliation).toMatchObject({ totals: {grossChargeUnits: '10001'}, credentials: [{credentialRef: 'credential:original'}] })
    expect(frozen.snapshot).toMatchObject({ ledgerSnapshotAt: now, sourcesCapturedAt: now, measurements: [{evidence: {currentQuantityUnits: '1', revisions: []}}], issuedInvoice: false })
    vi.setSystemTime(now + 86_400_000)
    await f.backend.run(async ctx => await ctx.db.patch(f.id, { state: 'cancelled', result: undefined, updatedAt: now + 1000 }))
    await f.backend.mutation(internal.capabilityCallProjections.rebuild, {paginationOpts: {numItems: 100, cursor: null}})
    ledger.listTransactions.mockResolvedValue(page(f.owner.canonicalAccountRef, 20002n))
    expect(await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, args)).toEqual(first)
    expect(await f.owner.owner.query(api.moneyMonthlyUsageDraft.readOwnerDraft, {draftRef: first.draftRef})).toEqual(first)
    expect(ledger.listTransactions).toHaveBeenCalledTimes(1)
    const second = await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, {month, revision: 2})
    if (second.kind !== 'available') throw new Error(second.code)
    expect(readFrozenMonthlyDraft(second.snapshotJson, second.snapshotDigest)).toMatchObject({snapshot: {priorDraftDigest: first.snapshotDigest, measurements: [{evidence: {originalQuantityUnits: '1', currentQuantityUnits: null}}]}, reconciliation: {totals: {grossChargeUnits: '20002'}}})
    expect(first.draftRef).toBe(monthlyDraftRef(f.owner.canonicalAccountRef, month, 1))
    expect(await f.backend.run(async ctx => await ctx.db.query('moneyMonthlyUsageDrafts').collect())).toHaveLength(2)
    expect(ledger.createTransaction).not.toHaveBeenCalled(); expect(ledger.revertTransaction).not.toHaveBeenCalled()
  })
  it('uses the native normalized source identity for a valid trailing slash', async () => {
    const f = await fixture()
    vi.stubEnv('AE_FORMANCE_GATEWAY_URL', 'https://fixture.invalid/')
    expect(await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, {month, revision: 1})).toMatchObject({kind: 'available'})
  })
  it('keeps the admission cutoff after source failure and restarts the same intent without a new revision', async () => {
    const f = await fixture()
    ledger.listTransactions.mockRejectedValueOnce(new Error('fixture-ledger-unavailable'))
    expect(await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, {month, revision: 1})).toMatchObject({kind: 'unavailable'})
    vi.setSystemTime(now + 86_400_000)
    const result = await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, {month, revision: 1})
    if (result.kind !== 'available') throw new Error(result.code)
    expect(readFrozenMonthlyDraft(result.snapshotJson, result.snapshotDigest).snapshot.ledgerSnapshotAt).toBe(now)
    const nativeRequests = ledger.listTransactions.mock.calls.map(call => call[0] as {pit: Date})
    expect(nativeRequests.map(request => request.pit.getTime())).toEqual([now, now])
  })
  it('never rounds or books nonzero residuals even with a valid approved policy, including repeated scheduler-intent admissions', async () => {
    const f = await fixture()
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'); vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'production'); vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', '500000')
    await seedCommercialPolicies(f.backend, 'monthly-draft', Date.now())
    const gate = await f.backend.run(async ctx => await readCommercialPolicyGate(ctx.db, {environment: 'production', now: Date.now()}))
    expect(gate.kind).toBe('admitted')
    expect(10001n % 10000n).not.toBe(0n)
    const args = {month, revision: 1}
    const a = await f.owner.owner.mutation(internal.moneyMonthlyUsageDraft.admitOwnerDraft, args)
    const b = await f.owner.owner.mutation(internal.moneyMonthlyUsageDraft.admitOwnerDraft, args)
    expect(a).toEqual(b)
    const first = await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, args)
    expect(await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, args)).toEqual(first)
    expect(ledger.createTransaction).not.toHaveBeenCalled(); expect(ledger.revertTransaction).not.toHaveBeenCalled()
    expect(await f.backend.run(async ctx => await ctx.db.query('moneyDocuments').collect())).toEqual([])
    expect(await f.backend.run(async ctx => await ctx.db.query('moneyFundingCommands').collect())).toEqual([])
  })
  it('rejects other owners, an absent predecessor and open months, and rechecks authority after the ledger read', async () => {
    const f = await fixture(), other = await publishedBusinessOwner(f.backend, 'monthly-other')
    expect(await f.backend.action(api.moneyMonthlyUsageDraft.createOwnerDraft, {month, revision: 1})).toMatchObject({kind: 'refused'})
    expect(await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, {month, revision: 2})).toMatchObject({code: 'prior_draft_required'})
    expect(await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, {month: '2026-10', revision: 1})).toMatchObject({code: 'closed_month_required'})
    const first = await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, {month, revision: 1})
    if (first.kind !== 'available') throw new Error(first.code)
    expect(await other.owner.query(api.moneyMonthlyUsageDraft.readOwnerDraft, {draftRef: first.draftRef})).toMatchObject({kind: 'refused'})
    ledger.listTransactions.mockImplementationOnce(async () => {
      await f.backend.run(async ctx => { for (const row of await ctx.db.query('accountOwnerships').collect()) if (row.accountRef === f.owner.canonicalAccountRef) await ctx.db.delete(row._id) })
      return page(f.owner.canonicalAccountRef)
    })
    expect(await f.owner.owner.action(api.moneyMonthlyUsageDraft.createOwnerDraft, {month, revision: 2})).toMatchObject({kind: 'refused'})
  })
})
