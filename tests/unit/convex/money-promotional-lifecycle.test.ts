/// <reference types="vite/client" />
import { getFunctionName, makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { promotionalCreditReference } from '@/modules/money/public'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { convexTestWithMarketComponents, ownerAdmin, supportAdmin, testMfaConsequenceProof } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { claimPromotionalCredit, restorePromotionalCredit } from '../../../convex/lib/money/promotionalCredit/allocation'
import { processHandler } from '../../../convex/lib/money/promotionalCredit/lifecycle'
import type { ActionCtx } from '../../../convex/_generated/server'

const grantMutation = makeFunctionReference<'mutation', Record<string, unknown>, AdminCommandReceipt<'grant_promotional_credit'>>('moneyPromotionalCredit:grant')
const claimMutation = makeFunctionReference<'mutation', { grantRef: string }, ClaimResult>('moneyPromotionalCredit:claimWork')
const finishMutation = makeFunctionReference<'mutation', Work & { transactionRefs: string[] }, boolean>('moneyPromotionalCredit:finishWork')
const dueQuery = makeFunctionReference<'query', { now: number }, string[]>('moneyPromotionalCredit:due')
type Work = { kind: 'grant' | 'expiry'; grantRef: string; accountRef: string; environment: 'sandbox' | 'production'; amountUnits: string; expiresAt: number; commandDigest: string; revision: number }
type ClaimResult = Work | null | { kind: 'refused'; code: 'promotional_credit_authority_invalid' | 'promotional_credit_expiry_invalid' }
type Backend = ReturnType<typeof convexTestWithMarketComponents>
const expiresAt = () => Date.now() + 86_400_000

function command(actor: string, accountRef: string, key: string, changes: Partial<AdminCommandArgs<'grant_promotional_credit'>> = {}): AdminCommandArgs<'grant_promotional_credit'> {
  const base: AdminCommandArgs<'grant_promotional_credit'> = {
    action: 'grant_promotional_credit', input: { accountRef, environment: 'sandbox', amountUnits: '1000000', expiresAt: expiresAt() },
    reasonCode: 'onboarding', evidenceRefs: ['evidence:promotional-grant'], operationKey: key, correlationId: key,
    approval: { kind: 'execute' },
    ...changes,
  }
  const digest = canonicalDigest({ scope: 'admin_operator', action: base.action, input: base.input,
    reasonCode: base.reasonCode, evidenceRefs: base.evidenceRefs,
    ...(base.expectedStateDigest === undefined ? {} : { expectedStateDigest: base.expectedStateDigest }),
  })
  return { ...base, proof: testMfaConsequenceProof({ subject: actor }, digest) }
}

async function setup(subject = 'user_promo_owner') {
  const backend = convexTestWithMarketComponents()
  const admin = await ownerAdmin(backend, subject)
  const accountRef = await backend.run(async ctx => {
    const accounts = await ctx.db.query('accounts').collect()
    const account = accounts.find(row => row.displayName === `${subject} account`)
    if (!account) throw new Error('owner account missing')
    return account.accountRef
  })
  return { backend, admin, accountRef }
}
async function grantRow(backend: Backend, grantRef: string) {
  return await backend.run(ctx => ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', grantRef)).unique())
}
async function admitted(backend: Backend, admin: Awaited<ReturnType<typeof ownerAdmin>>, actor: string, accountRef: string, key: string, changes: Partial<AdminCommandArgs<'grant_promotional_credit'>> = {}) {
  const signed = await withSourceWrite('admin_operator', command(actor, accountRef, key, changes))
  return { signed, receipt: await admin.mutation(grantMutation, signed) }
}
function ref(receipt: AdminCommandReceipt<'grant_promotional_credit'>): string {
  if (receipt.kind !== 'pending') throw new Error(`pending expected: ${receipt.kind}`)
  const value = receipt.effectRefs[0]
  if (!value) throw new Error('grant ref missing')
  return value
}
function requireWork(result: ClaimResult): Work {
  if (result === null || result.kind === 'refused') throw new Error('work missing')
  return result
}
async function financialState(backend: Backend) {
  return await backend.run(async ctx => ({
    grants: await ctx.db.query('moneyPromotionalGrants').collect(),
    operations: await ctx.db.query('operationKeys').collect(),
    audits: await ctx.db.query('auditEvents').collect(),
  }))
}
function processingContext(backend: Backend, native: () => Promise<{ kind: 'completed'; transactionRefs: string[] }>) {
  const nativeAction = vi.fn(async (reference: Parameters<ActionCtx['runAction']>[0]) => {
    expect(getFunctionName(reference)).toBe('moneyFormance:grantPromotionalCredit')
    return await native()
  })
  return { nativeAction, ctx: {
    runMutation: (reference: Parameters<typeof backend.mutation>[0], args: never) => backend.mutation(reference, args),
    runAction: nativeAction,
  } as unknown as ActionCtx }
}

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('promotional grant lifecycle', () => {
  it('requires owner authority and fresh MFA, and refuses environment mismatch', async () => {
    const { backend, admin, accountRef } = await setup()
    const support = await supportAdmin(backend, 'user_promo_support')
    const supportCall = await withSourceWrite('admin_operator', command('user_promo_support', accountRef, 'promo:support'))
    expect(await support.mutation(grantMutation, supportCall)).toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
    const { proof: _proof, ...withoutProof } = command('user_promo_owner', accountRef, 'promo:no-proof')
    expect(await admin.mutation(grantMutation, await withSourceWrite('admin_operator', withoutProof)))
      .toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    const wrong = await admitted(backend, admin, 'user_promo_owner', accountRef, 'promo:wrong-env', {
      input: { accountRef, environment: 'production', amountUnits: '1000000', expiresAt: expiresAt() },
    })
    expect(wrong.receipt).toMatchObject({ kind: 'refused', code: 'environment_mismatch' })
    expect(await backend.run(ctx => ctx.db.query('moneyPromotionalGrants').collect())).toHaveLength(0)
  })

  it('keeps duplicate operation pending, then replays the same completed receipt after one booking', async () => {
    const { backend, admin, accountRef } = await setup()
    const { signed, receipt } = await admitted(backend, admin, 'user_promo_owner', accountRef, 'promo:once')
    expect(receipt.kind).toBe('pending')
    const grantRef = ref(receipt)
    expect(await admin.mutation(grantMutation, signed)).toEqual(receipt)
    expect(await grantRow(backend, grantRef)).toMatchObject({ bookingState: 'pending', availableUnits: '0' })
    const work = requireWork(await backend.mutation(claimMutation, { grantRef }))
    const transactionRef = promotionalCreditReference(grantRef, 1, 'grant')
    expect(await Promise.all([
      backend.mutation(finishMutation, { ...work, transactionRefs: [transactionRef] }),
      backend.mutation(finishMutation, { ...work, transactionRefs: [transactionRef] }),
    ])).toEqual([true, true])
    const finished = await financialState(backend)
    expect(await backend.mutation(finishMutation, { ...work, transactionRefs: [transactionRef] })).toBe(true)
    expect(await backend.mutation(finishMutation, { ...work, amountUnits: '2000000', transactionRefs: [transactionRef] })).toBe(false)
    expect(await backend.mutation(finishMutation, { ...work, revision: 2, transactionRefs: [transactionRef] })).toBe(false)
    expect(await financialState(backend)).toEqual(finished)
    expect(finished.audits.filter(row => row.eventType === 'money.promotional_credit_granted')).toHaveLength(1)
    const completed = await admin.mutation(grantMutation, signed)
    expect(completed).toMatchObject({ kind: 'completed', code: 'promotional_credit_granted', effectRefs: [grantRef, transactionRef] })
    expect(await admin.mutation(grantMutation, signed)).toEqual(completed)
    expect(await backend.run(ctx => ctx.db.query('moneyPromotionalGrants').collect())).toHaveLength(1)
    expect(await grantRow(backend, grantRef)).toMatchObject({ bookingState: 'booked', availableUnits: '1000000' })
  })

  it('requires distinct second owner approval for the exact command payload', async () => {
    const { backend, admin, accountRef } = await setup('user_promo_proposer')
    const second = await ownerAdmin(backend, 'user_promo_approver')
    const input = { accountRef, environment: 'sandbox' as const, amountUnits: '1000000', expiresAt: expiresAt() }
    expect((await admitted(backend, admin, 'user_promo_proposer', accountRef, 'promo:direct', { input })).receipt)
      .toMatchObject({ kind: 'refused', code: 'approval_required' })
    const proposed = (await admitted(backend, admin, 'user_promo_proposer', accountRef, 'promo:propose', {
      input, approval: { kind: 'propose' },
    })).receipt
    if (proposed.kind !== 'proposed') throw new Error(`proposal expected: ${proposed.kind}`)
    const mismatch = await admitted(backend, second, 'user_promo_approver', accountRef, 'promo:mismatch', {
      input: { ...input, amountUnits: '2000000' }, approval: { kind: 'approve', proposalRef: proposed.proposalRef },
    })
    expect(mismatch.receipt).toMatchObject({ kind: 'refused', code: 'approval_digest_mismatch' })
    const same = await admitted(backend, admin, 'user_promo_proposer', accountRef, 'promo:self', {
      input, approval: { kind: 'approve', proposalRef: proposed.proposalRef },
    })
    expect(same.receipt).toMatchObject({ kind: 'refused', code: 'approval_same_actor' })
    const approved = await admitted(backend, second, 'user_promo_approver', accountRef, 'promo:approve', {
      input, approval: { kind: 'approve', proposalRef: proposed.proposalRef },
    })
    expect(approved.receipt.kind).toBe('pending')
    expect(await backend.run(ctx => ctx.db.query('moneyPromotionalGrants').collect())).toHaveLength(1)
  })

  it.each([
    'missing_audit', 'wrong_audit_actor', 'wrong_audit_target', 'wrong_audit_command',
    'corrupt_audit_hash', 'missing_operation', 'wrong_request_hash',
    'wrong_receipt_grant', 'wrong_receipt_correlation', 'corrupt_receipt_hash', 'changed_grant_input',
  ] as const)('refuses %s with only claim retry clocks renewed and completion inert', async defect => {
    const { backend, admin, accountRef } = await setup()
    const { receipt } = await admitted(backend, admin, 'user_promo_owner', accountRef, `promo:${defect}`)
    const grantRef = ref(receipt)
    const work = requireWork(await backend.mutation(claimMutation, { grantRef }))
    await backend.run(async ctx => {
      const grant = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', grantRef)).unique()
      if (grant === null || grant.auditEventRef === undefined) throw new Error('grant missing')
      const auditEventRef = grant.auditEventRef
      const audit = await ctx.db.query('auditEvents').withIndex('by_eventId', q => q.eq('eventId', auditEventRef)).unique()
      const operation = await ctx.db.query('operationKeys').withIndex('by_actor_operation_key', q => q
        .eq('actorRef', grant.actorRef).eq('operationName', 'admin:grant_promotional_credit').eq('key', grant.operationKey)).unique()
      if (audit === null || operation === null) throw new Error('authority missing')
      if (defect === 'missing_audit') await ctx.db.delete(audit._id)
      else if (defect === 'wrong_audit_actor') await ctx.db.patch(audit._id, { actorRef: 'other-admin' })
      else if (defect === 'wrong_audit_target') await ctx.db.patch(audit._id, { targetRef: 'other-account' })
      else if (defect === 'wrong_audit_command') {
        const payload: unknown = JSON.parse(audit.redactedPayloadJson)
        if (!isRecord(payload)) throw new Error('audit payload missing')
        const changed = { ...payload, commandDigest: canonicalDigest('other-command') }
        await ctx.db.patch(audit._id, { redactedPayloadJson: JSON.stringify(changed), payloadHash: canonicalDigest(changed) })
      } else if (defect === 'corrupt_audit_hash') await ctx.db.patch(audit._id, { payloadHash: canonicalDigest('other-payload') })
      else if (defect === 'missing_operation') await ctx.db.delete(operation._id)
      else if (defect === 'wrong_request_hash') await ctx.db.patch(operation._id, { requestHash: canonicalDigest('other-request') })
      else if (defect === 'corrupt_receipt_hash') await ctx.db.patch(operation._id, { resultHash: canonicalDigest('other-receipt') })
      else if (defect === 'changed_grant_input') await ctx.db.patch(grant._id, { amountUnits: '2000000' })
      else {
        const changed = { ...receipt,
          ...(defect === 'wrong_receipt_grant' ? { effectRefs: ['other-grant'] } : { correlationId: 'other-correlation' }),
        }
        await ctx.db.patch(operation._id, { resultJson: JSON.stringify(changed), resultHash: canonicalDigest(changed) })
      }
    })
    const before = await financialState(backend)
    const claimStartedAt = Date.now()
    expect(await backend.mutation(claimMutation, { grantRef })).toEqual({ kind: 'refused', code: 'promotional_credit_authority_invalid' })
    const processing = processingContext(backend, async () => ({ kind: 'completed', transactionRefs: [promotionalCreditReference(grantRef, 1, 'grant')] }))
    expect(await processHandler(processing.ctx, { grantRef })).toBe(false)
    expect(processing.nativeAction).not.toHaveBeenCalled()
    const afterClaim = await financialState(backend)
    expect(afterClaim.grants).toHaveLength(1)
    const claimed = afterClaim.grants[0]
    if (claimed === undefined) throw new Error('grant missing')
    expect(claimed.updatedAt).toBeGreaterThanOrEqual(claimStartedAt)
    expect(claimed.nextWorkAt).toBe(claimed.updatedAt + 60_000)
    expect(afterClaim).toEqual({ ...before, grants: before.grants.map(row => ({
      ...row, updatedAt: claimed.updatedAt, nextWorkAt: claimed.nextWorkAt,
    })) })
    expect(await backend.mutation(finishMutation, { ...work, transactionRefs: [promotionalCreditReference(grantRef, 1, 'grant')] })).toBe(false)
    expect(await financialState(backend)).toEqual(afterClaim)
  })

  it('retains pending credit when original authority disappears during the native action', async () => {
    const { backend, admin, accountRef } = await setup()
    const { receipt } = await admitted(backend, admin, 'user_promo_owner', accountRef, 'promo:lost-authority')
    const grantRef = ref(receipt)
    if (receipt.kind !== 'pending') throw new Error('pending receipt missing')
    const processing = processingContext(backend, async () => {
      await backend.run(async ctx => {
        const audit = await ctx.db.query('auditEvents').withIndex('by_eventId', q => q.eq('eventId', receipt.auditEventRef)).unique()
        if (audit === null) throw new Error('audit missing')
        await ctx.db.delete(audit._id)
      })
      return { kind: 'completed', transactionRefs: [promotionalCreditReference(grantRef, 1, 'grant')] }
    })
    expect(await processHandler(processing.ctx, { grantRef })).toBe(false)
    expect(processing.nativeAction).toHaveBeenCalledTimes(1)
    const state = await financialState(backend)
    expect(state.grants).toHaveLength(1)
    expect(state.grants[0]).toMatchObject({ bookingState: 'pending', availableUnits: '0' })
    expect(state.grants[0]?.transactionRef).toBeUndefined()
    expect(state.operations.find(row => row.key === 'promo:lost-authority')).toMatchObject({ status: 'in_progress' })
    expect(state.audits.filter(row => row.eventType === 'money.promotional_credit_granted')).toHaveLength(0)
  })

  it('retries processing a booked grant without another native action or credit initialization', async () => {
    const { backend, admin, accountRef } = await setup()
    const { receipt } = await admitted(backend, admin, 'user_promo_owner', accountRef, 'promo:process-once')
    const grantRef = ref(receipt)
    const processing = processingContext(backend, async () => ({ kind: 'completed', transactionRefs: [promotionalCreditReference(grantRef, 1, 'grant')] }))
    expect(await processHandler(processing.ctx, { grantRef })).toBe(true)
    // A later legitimate spend must not be reset by replaying the original grant worker.
    const allocation = await backend.run(ctx => claimPromotionalCredit(ctx, { accountRef, environment: 'sandbox', amountUnits: '400000', now: Date.now() }))
    expect(allocation.kind).toBe('claimed')
    expect(await processHandler(processing.ctx, { grantRef })).toBe(true)
    expect(processing.nativeAction).toHaveBeenCalledTimes(1)
    expect(await grantRow(backend, grantRef)).toMatchObject({ bookingState: 'booked', availableUnits: '600000' })
    expect((await financialState(backend)).audits.filter(row => row.eventType === 'money.promotional_credit_granted')).toHaveLength(1)
  })

  it('replays frozen expiry work, preserves future scheduling, and queues late restored credit', async () => {
    const { backend, admin, accountRef } = await setup()
    const { receipt } = await admitted(backend, admin, 'user_promo_owner', accountRef, 'promo:expiry')
    const grantRef = ref(receipt)
    const grant = requireWork(await backend.mutation(claimMutation, { grantRef }))
    const grantTransaction = promotionalCreditReference(grantRef, 1, 'grant')
    expect(await backend.mutation(finishMutation, { ...grant, transactionRefs: [grantTransaction] })).toBe(true)
    expect(await backend.mutation(claimMutation, { grantRef })).toBeNull()
    expect((await grantRow(backend, grantRef))?.nextWorkAt).toBe(grant.expiresAt)
    const allocation = await backend.run(ctx => claimPromotionalCredit(ctx, { accountRef, environment: 'sandbox', amountUnits: '400000', now: Date.now() }))
    if (allocation.kind !== 'claimed') throw new Error('allocation missing')
    vi.useFakeTimers()
    vi.setSystemTime(grant.expiresAt + 1)
    const expiry = requireWork(await backend.mutation(claimMutation, { grantRef }))
    expect(expiry).toMatchObject({ kind: 'expiry', amountUnits: '600000', revision: 1 })
    expect(await backend.mutation(claimMutation, { grantRef })).toEqual(expiry)
    const expireTransaction = promotionalCreditReference(grantRef, 1, 'expire')
    expect(await backend.mutation(finishMutation, { ...expiry, transactionRefs: [expireTransaction] })).toBe(true)
    expect(await backend.run(ctx => restorePromotionalCredit(ctx, allocation.allocation, accountRef, 'sandbox', Date.now())))
      .toEqual({ kind: 'restored' })
    expect((await grantRow(backend, grantRef))?.nextWorkAt).toBeLessThanOrEqual(Date.now())
    const second = requireWork(await backend.mutation(claimMutation, { grantRef }))
    expect(second).toMatchObject({ kind: 'expiry', amountUnits: '400000', revision: 2 })
    expect(await backend.mutation(finishMutation, { ...second, transactionRefs: [promotionalCreditReference(grantRef, 2, 'expire')] })).toBe(true)
    expect((await grantRow(backend, grantRef))?.availableUnits).toBe('0')
    vi.useRealTimers()
  })

  it('finds due work beyond 25 unscheduled rows', async () => {
    const { backend, admin, accountRef } = await setup()
    const { receipt } = await admitted(backend, admin, 'user_promo_owner', accountRef, 'promo:due')
    const grantRef = ref(receipt)
    await backend.run(async ctx => {
      const row = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', grantRef)).unique()
      if (!row) throw new Error('row missing')
      const { _id, _creationTime, nextWorkAt: _nextWorkAt, ...values } = row
      for (let i = 0; i < 30; i += 1) await ctx.db.insert('moneyPromotionalGrants', {
        ...values, grantRef: `unscheduled:${i}`, operationKey: `unscheduled:${i}`,
      })
    })
    expect(await backend.query(dueQuery, { now: Date.now() + 1_000 })).toContain(grantRef)
  })

  it.each(['foreign_reference', 'invalid_revision', 'revision_mismatch'] as const)(
    'refuses frozen expiry %s before native I/O while renewing only retry clocks', async defect => {
      const { backend, admin, accountRef } = await setup()
      const { receipt } = await admitted(backend, admin, 'user_promo_owner', accountRef, `promo:expiry-${defect}`)
      const grantRef = ref(receipt)
      const grant = requireWork(await backend.mutation(claimMutation, { grantRef }))
      expect(await backend.mutation(finishMutation, { ...grant, transactionRefs: [promotionalCreditReference(grantRef, 1, 'grant')] })).toBe(true)
      vi.useFakeTimers()
      vi.setSystemTime(grant.expiresAt + 1)
      const originalExpiry = requireWork(await backend.mutation(claimMutation, { grantRef }))
      await backend.run(async ctx => {
        const row = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', grantRef)).unique()
        if (row === null || row.pendingExpiry === undefined) throw new Error('expiry missing')
        await ctx.db.patch(row._id, { pendingExpiry: { ...row.pendingExpiry,
          ...(defect === 'foreign_reference' ? { commandRef: 'other-expiry' }
            : defect === 'invalid_revision' ? { revision: 0 }
            : { revision: 2, commandRef: promotionalCreditReference(grantRef, 2, 'expire') }),
        } })
      })
      const before = await financialState(backend)
      vi.setSystemTime(Date.now() + 1_000)
      const now = Date.now()
      const processing = processingContext(backend, async () => ({ kind: 'completed', transactionRefs: [] }))
      expect(await backend.mutation(claimMutation, { grantRef })).toEqual({ kind: 'refused', code: 'promotional_credit_expiry_invalid' })
      expect(await processHandler(processing.ctx, { grantRef })).toBe(false)
      expect(processing.nativeAction).not.toHaveBeenCalled()
      const afterClaim = await financialState(backend)
      expect(afterClaim).toEqual({ ...before, grants: before.grants.map(row => ({ ...row, updatedAt: now, nextWorkAt: now + 60_000 })) })
      expect(await backend.mutation(finishMutation, { ...originalExpiry, transactionRefs: [promotionalCreditReference(grantRef, 1, 'expire')] })).toBe(false)
      if (defect === 'revision_mismatch') {
        expect(await backend.mutation(finishMutation, { ...originalExpiry, revision: 2, transactionRefs: [promotionalCreditReference(grantRef, 2, 'expire')] })).toBe(false)
      }
      expect(await financialState(backend)).toEqual(afterClaim)
    },
  )

  it('moves 25 invalid pending grants behind later valid work by renewing their retry clocks', async () => {
    const { backend, admin, accountRef } = await setup()
    const { receipt } = await admitted(backend, admin, 'user_promo_owner', accountRef, 'promo:valid-after-lost-authority')
    const grantRef = ref(receipt)
    vi.useFakeTimers()
    const now = Date.now()
    vi.setSystemTime(now)
    const invalidRefs = await backend.run(async ctx => {
      const valid = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', grantRef)).unique()
      if (valid === null) throw new Error('grant missing')
      await ctx.db.patch(valid._id, { nextWorkAt: now - 1 })
      const { _id, _creationTime, ...values } = valid
      const refs: string[] = []
      // Synthetic restored rows have canonical input identities but lost original operation rows.
      for (let index = 0; index < 25; index += 1) {
        const operationKey = `promo:lost-authority:${index}`
        const lostRef = canonicalDigest({ format: 'ae.promotional-credit-grant:v1', actorRef: valid.actorRef, operationKey,
          input: { accountRef, environment: valid.environment, amountUnits: valid.amountUnits, expiresAt: valid.expiresAt },
        })
        await ctx.db.insert('moneyPromotionalGrants', { ...values, grantRef: lostRef, operationKey, nextWorkAt: now - 2 })
        refs.push(lostRef)
      }
      return refs
    })
    const firstDue = await backend.query(dueQuery, { now })
    expect([...firstDue].sort()).toEqual([...invalidRefs].sort())
    for (const lostRef of invalidRefs) {
      expect(await backend.mutation(claimMutation, { grantRef: lostRef })).toEqual({ kind: 'refused', code: 'promotional_credit_authority_invalid' })
    }
    expect(await backend.query(dueQuery, { now })).toEqual([grantRef])
    expect(requireWork(await backend.mutation(claimMutation, { grantRef })).kind).toBe('grant')
    expect(await grantRow(backend, grantRef)).toMatchObject({ bookingState: 'pending', availableUnits: '0' })
  })
})
