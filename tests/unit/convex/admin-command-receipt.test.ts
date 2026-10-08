import { describe, expect, it } from 'vitest'
import { api } from '../../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { convexTestWithMarketComponents, ownerAdmin } from '../../helpers/convex-fixtures'

const identity = { action: 'set_payments_paused' as const, operationKey: 'admin:recovery', correlationId: 'admin:recovery:correlation' }
const receipt = { kind: 'completed' as const, action: identity.action, code: 'payments_paused' as const, auditEventRef: 'audit:pause', effectRefs: ['payments:paused'], correlationId: identity.correlationId }

describe('admin command receipt observation', () => {
  it('reads the actor-owned receipt without replaying and refuses a different actor or correlation', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = await ownerAdmin(backend, 'user_recovery-owner')
    const stranger = await ownerAdmin(backend, 'user_recovery-stranger')
    await backend.run(async ctx => { await ctx.db.insert('operationKeys', {
      scope: 'admin_operator', actorKind: 'admin', actorRef: 'user_recovery-owner', operationName: 'admin:set_payments_paused', key: identity.operationKey,
      requestHash: 'request:one', status: 'succeeded', resultHash: canonicalDigest(receipt), resultJson: JSON.stringify(receipt), effectRefs: [], createdAt: 1, updatedAt: 1,
    }) })
    expect(await owner.query(api.adminConsoleAudit.readAdminCommandReceipt, identity)).toEqual({ kind: 'recorded', receipt })
    expect(await stranger.query(api.adminConsoleAudit.readAdminCommandReceipt, identity)).toEqual({ kind: 'unrecorded' })
    expect(await owner.query(api.adminConsoleAudit.readAdminCommandReceipt, { ...identity, correlationId: 'other:correlation' })).toEqual({ kind: 'unavailable' })
    expect(await backend.query(api.adminConsoleAudit.readAdminCommandReceipt, identity)).toMatchObject({ kind: 'refused' })
    const rows = await backend.run(async ctx => ({ operations: await ctx.db.query('operationKeys').collect(), audit: await ctx.db.query('auditEvents').collect() }))
    expect(rows.operations).toHaveLength(1)
    expect(rows.audit).toHaveLength(0)
  })
  it('reports pending as pending, rejects tampered receipts and enforces current command permission', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = await ownerAdmin(backend, 'user_recovery-pending')
    const pending = { kind: 'pending' as const, action: identity.action, auditEventRef: 'audit:pending', effectRefs: [], correlationId: identity.correlationId }
    const operationId = await backend.run(async ctx => await ctx.db.insert('operationKeys', {
      scope: 'admin_operator', actorKind: 'admin', actorRef: 'user_recovery-pending', operationName: 'admin:set_payments_paused', key: identity.operationKey,
      requestHash: 'request:one', status: 'in_progress', resultHash: canonicalDigest(pending), resultJson: JSON.stringify(pending), effectRefs: [], createdAt: 1, updatedAt: 1,
    }))
    expect(await owner.query(api.adminConsoleAudit.readAdminCommandReceipt, identity)).toEqual({ kind: 'recorded', receipt: pending })
    await backend.run(async ctx => { await ctx.db.patch(operationId, { resultHash: 'tampered' }) })
    expect(await owner.query(api.adminConsoleAudit.readAdminCommandReceipt, identity)).toEqual({ kind: 'unavailable' })
    await backend.run(async ctx => {
      const membership = await ctx.db.query('adminMemberships').withIndex('by_clerkUserId_and_state', q => q.eq('clerkUserId', 'user_recovery-pending').eq('state', 'active')).unique()
      if (membership === null) throw new Error('fixture missing')
      await ctx.db.patch(membership._id, { role: 'support' })
    })
    expect(await owner.query(api.adminConsoleAudit.readAdminCommandReceipt, identity)).toMatchObject({ kind: 'refused' })
  })
})
