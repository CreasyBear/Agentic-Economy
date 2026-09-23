/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  convexModules,
  nonAdmin,
  ownerAdmin,
  reviewerAdmin,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const PAGE_SIZE = 10

async function seedAuditEvents(backend: ConvexFixtureBackend): Promise<readonly string[]> {
  return await backend.run(async (ctx) => {
    const ids: string[] = []
    for (let index = 0; index < 30; index += 1) {
      const isAdmin = index === 0
      const id = await ctx.db.insert('auditEvents', {
        eventId: `audit:admin-page:${index}`,
        eventType: isAdmin ? 'business.suppressed' : 'account.session.created',
        actorKind: isAdmin ? 'admin' : 'owner',
        actorRef: isAdmin ? 'user_admin-audit-reader' : `user_audit-${index % 3}`,
        targetType: isAdmin ? 'business' : 'session',
        targetRef: isAdmin ? 'business:audit-test' : `session:audit-${index}`,
        ...(isAdmin
          ? {
              beforeState: 'discoverable',
              afterState: 'suppressed',
              outcome: 'suppressed',
            }
          : {}),
        idempotencyKey: `audit-page:${index}`,
        correlationId: `correlation:audit-${index % 2}`,
        ...(isAdmin ? { reasonCode: 'policy_violation' } : {}),
        evidenceRefs: isAdmin ? ['evidence:audit-test'] : [],
        redactedPayloadJson: JSON.stringify(isAdmin
          ? {
              permission: 'suppress_business',
              reasonCode: 'policy_violation',
              evidenceRefs: ['evidence:audit-test'],
            }
          : {}),
        payloadHash: canonicalDigest({ index }),
        createdAt: 1_000 + index,
      })
      ids.push(String(id))
    }
    return ids
  })
}

async function insertNewestAuditEvent(backend: ConvexFixtureBackend): Promise<string> {
  return await backend.run(async (ctx) => {
    const id = await ctx.db.insert('auditEvents', {
      eventId: 'audit:admin-page:newest',
      eventType: 'account.session.created',
      actorKind: 'owner',
      actorRef: 'user_audit-newest',
      targetType: 'session',
      targetRef: 'session:audit-newest',
      idempotencyKey: 'audit-page:newest',
      correlationId: 'correlation:audit-newest',
      evidenceRefs: [],
      redactedPayloadJson: '{}',
      payloadHash: canonicalDigest({ newest: true }),
      createdAt: 2_000,
    })
    return String(id)
  })
}

describe('admin audit pagination', () => {
  it('keeps cursor pages duplicate-free when a newer event arrives', async () => {
    const backend = convexTest(schema, convexModules)
    const admin = await ownerAdmin(backend, 'user_admin-audit-reader')
    await expect(admin.query(api.adminConsoleAudit.readAdminAuditAccess, {}))
      .resolves.toEqual({ kind: 'allowed', role: 'owner_admin' })
    const originalIds = await seedAuditEvents(backend)

    const first = await admin.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: {},
      paginationOpts: { numItems: PAGE_SIZE, cursor: null },
    })
    const newestId = await insertNewestAuditEvent(backend)
    const refreshed = await admin.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: {},
      paginationOpts: { numItems: PAGE_SIZE, cursor: null },
    })
    expect(refreshed.page[0]?.id).toBe(newestId)
    const second = await admin.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: {},
      paginationOpts: { numItems: PAGE_SIZE, cursor: first.continueCursor },
    })
    const third = await admin.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: {},
      paginationOpts: { numItems: PAGE_SIZE, cursor: second.continueCursor },
    })

    expect(first.page.map(({ id }) => id)).toEqual(originalIds.slice(20).reverse())
    expect(second.page.map(({ id }) => id)).toEqual(originalIds.slice(10, 20).reverse())
    expect(third.page.map(({ id }) => id)).toEqual(originalIds.slice(0, 10).reverse())
    const rows = [...first.page, ...second.page, ...third.page]
    const seenIds = rows.map(({ id }) => id)
    expect(seenIds).not.toContain(newestId)
    expect(new Set(seenIds).size).toBe(seenIds.length)

    const adminRow = rows.find(({ eventType }) => eventType === 'business.suppressed')
    const nonAdminRow = rows.find(({ eventType }) => eventType === 'account.session.created')
    expect(adminRow?.admin).toEqual({
      permission: 'suppress_business',
      reasonCode: 'policy_violation',
      evidenceRefs: ['evidence:audit-test'],
      beforeState: 'discoverable',
      afterState: 'suppressed',
    })
    expect(nonAdminRow?.admin).toBeNull()
  })

  it('combines indexed event filters with inclusive-exclusive time bounds', async () => {
    const backend = convexTest(schema, convexModules)
    const admin = await ownerAdmin(backend, 'user_admin-audit-filters')
    await seedAuditEvents(backend)

    const byEvent = await admin.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: { eventType: 'business.suppressed' },
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(byEvent.page.every(({ eventType }) => eventType === 'business.suppressed')).toBe(true)

    const byWindow = await admin.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: { from: 1_005, to: 1_010 },
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(byWindow.page.map(({ createdAt }) => createdAt)).toEqual([
      1_009,
      1_008,
      1_007,
      1_006,
      1_005,
    ])
  })

  it('redacts approval command material from reviewer readbacks', async () => {
    const backend = convexTest(schema, convexModules)
    const owner = await ownerAdmin(backend, 'user_admin-audit-owner')
    const reviewer = await reviewerAdmin(backend, 'user_admin-audit-reviewer')
    await backend.run((ctx) => ctx.db.insert('adminApprovalProposals', {
      proposalRef: 'admin-proposal:reviewer-redaction',
      action: 'set_business_suppression',
      commandDigest: 'sha256:reviewer-redaction',
      commandJson: JSON.stringify({
        input: { businessId: 'business:secret', intent: 'suppress' },
        reasonCode: 'policy_violation', evidenceRefs: ['evidence:secret'],
      }),
      proposerRef: 'owner-token',
      status: 'awaiting_second_approval',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    }))
    const ownerProposals = await owner.query(api.adminConsoleAudit.listAdminApprovalProposals, {})
    const reviewerProposals = await reviewer.query(api.adminConsoleAudit.listAdminApprovalProposals, {})
    if ('kind' in ownerProposals || 'kind' in reviewerProposals) throw new Error('approval_readback_denied')
    expect(ownerProposals[0]?.commandJson).toContain('business:secret')
    expect(reviewerProposals).toEqual([{ ...ownerProposals[0], commandJson: null }])
  })

  it('returns an empty page plus an explicit access refusal for a non-admin caller', async () => {
    const backend = convexTest(schema, convexModules)
    const caller = await nonAdmin(backend, 'user_admin-audit-non-admin')

    await expect(caller.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: {},
      paginationOpts: { numItems: PAGE_SIZE, cursor: null },
    })).resolves.toMatchObject({ page: [], isDone: true, continueCursor: '' })
    await expect(caller.query(api.adminConsoleAudit.readAdminAuditAccess, {}))
      .resolves.toEqual({ kind: 'refused', code: 'missing_membership' })
  })
})
