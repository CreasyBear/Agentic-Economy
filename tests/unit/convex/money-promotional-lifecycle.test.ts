/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { promotionalCreditReference } from '@/modules/money/public'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { convexTestWithMarketComponents, ownerAdmin, supportAdmin, testConsequenceProof } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { claimPromotionalCredit, restorePromotionalCredit } from '../../../convex/lib/money/promotionalCredit/allocation'

const grantMutation = makeFunctionReference<'mutation', Record<string, unknown>, AdminCommandReceipt<'grant_promotional_credit'>>('moneyPromotionalCredit:grant')
const claimMutation = makeFunctionReference<'mutation', { grantRef: string }, Work | null>('moneyPromotionalCredit:claimWork')
const finishMutation = makeFunctionReference<'mutation', Work & { transactionRefs: string[] }, boolean>('moneyPromotionalCredit:finishWork')
const dueQuery = makeFunctionReference<'query', { now: number }, string[]>('moneyPromotionalCredit:due')
type Work = { kind: 'grant' | 'expiry'; grantRef: string; accountRef: string; environment: 'sandbox' | 'production'; amountUnits: string; expiresAt: number; commandDigest: string; revision: number }
type Backend = ReturnType<typeof convexTestWithMarketComponents>
const expiresAt = () => Date.now() + 86_400_000

function command(actor: string, accountRef: string, key: string, changes: Partial<AdminCommandArgs<'grant_promotional_credit'>> = {}): AdminCommandArgs<'grant_promotional_credit'> {
  const base: AdminCommandArgs<'grant_promotional_credit'> = {
    action: 'grant_promotional_credit', input: { accountRef, environment: 'sandbox', amountUnits: '1000000', expiresAt: expiresAt() },
    reasonCode: 'onboarding', evidenceRefs: ['evidence:promotional-grant'], operationKey: key, correlationId: key,
    approval: { kind: 'execute' }, proof: { reverificationId: 'placeholder', firstFactorAgeMinutes: 0, secondFactorAgeMinutes: -1 },
    ...changes,
  }
  const digest = canonicalDigest({ scope: 'admin_operator', action: base.action, input: base.input,
    reasonCode: base.reasonCode, evidenceRefs: base.evidenceRefs,
    ...(base.expectedStateDigest === undefined ? {} : { expectedStateDigest: base.expectedStateDigest }),
  })
  return { ...base, proof: testConsequenceProof({ subject: actor }, digest) }
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
    const work = await backend.mutation(claimMutation, { grantRef })
    if (!work) throw new Error('work missing')
    const transactionRef = promotionalCreditReference(grantRef, 1, 'grant')
    expect(await backend.mutation(finishMutation, { ...work, transactionRefs: [transactionRef] })).toBe(true)
    expect(await backend.mutation(finishMutation, { ...work, transactionRefs: [transactionRef] })).toBe(true)
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

  it('replays frozen expiry work, preserves future scheduling, and queues late restored credit', async () => {
    const { backend, admin, accountRef } = await setup()
    const { receipt } = await admitted(backend, admin, 'user_promo_owner', accountRef, 'promo:expiry')
    const grantRef = ref(receipt)
    const grant = await backend.mutation(claimMutation, { grantRef })
    if (!grant) throw new Error('grant work missing')
    const grantTransaction = promotionalCreditReference(grantRef, 1, 'grant')
    expect(await backend.mutation(finishMutation, { ...grant, transactionRefs: [grantTransaction] })).toBe(true)
    expect(await backend.mutation(claimMutation, { grantRef })).toBeNull()
    expect((await grantRow(backend, grantRef))?.nextWorkAt).toBe(grant.expiresAt)
    const allocation = await backend.run(ctx => claimPromotionalCredit(ctx, { accountRef, environment: 'sandbox', amountUnits: '400000', now: Date.now() }))
    if (allocation.kind !== 'claimed') throw new Error('allocation missing')
    vi.useFakeTimers()
    vi.setSystemTime(grant.expiresAt + 1)
    const expiry = await backend.mutation(claimMutation, { grantRef })
    expect(expiry).toMatchObject({ kind: 'expiry', amountUnits: '600000', revision: 1 })
    expect(await backend.mutation(claimMutation, { grantRef })).toEqual(expiry)
    const expireTransaction = promotionalCreditReference(grantRef, 1, 'expire')
    expect(await backend.mutation(finishMutation, { ...expiry!, transactionRefs: [expireTransaction] })).toBe(true)
    expect(await backend.run(ctx => restorePromotionalCredit(ctx, allocation.allocation, accountRef, 'sandbox', Date.now())))
      .toEqual({ kind: 'restored' })
    expect((await grantRow(backend, grantRef))?.nextWorkAt).toBeLessThanOrEqual(Date.now())
    const second = await backend.mutation(claimMutation, { grantRef })
    expect(second).toMatchObject({ kind: 'expiry', amountUnits: '400000', revision: 2 })
    expect(await backend.mutation(finishMutation, { ...second!, transactionRefs: [promotionalCreditReference(grantRef, 2, 'expire')] })).toBe(true)
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
})
