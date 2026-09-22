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
        eventType: isAdmin ? 'admin.action_denied' : 'account.session.created',
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

async function insertNewestAuditEvent(backend: ConvexFixtureBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('auditEvents', {
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
  })
}

describe('admin audit pagination', () => {
  it('keeps cursor pages duplicate-free when a newer event arrives', async () => {
    const backend = convexTest(schema, convexModules)
    const admin = await ownerAdmin(backend, 'user_admin-audit-reader')
    const originalIds = await seedAuditEvents(backend)

    const first = await admin.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: {},
      paginationOpts: { numItems: PAGE_SIZE, cursor: null },
    })
    await insertNewestAuditEvent(backend)
    const second = await admin.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: {},
      paginationOpts: { numItems: PAGE_SIZE, cursor: first.continueCursor },
    })
    const third = await admin.query(api.adminConsoleAudit.listAdminAuditEvents, {
      filter: {},
      paginationOpts: { numItems: PAGE_SIZE, cursor: second.continueCursor },
    })

    const rows = [...first.page, ...second.page, ...third.page]
    const seenIds = rows.map(({ id }) => id)
    expect(new Set(seenIds).size).toBe(seenIds.length)
    expect(originalIds.every((id) => seenIds.includes(id))).toBe(true)

    const adminRow = rows.find(({ eventType }) => eventType === 'admin.action_denied')
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
      filter: { eventType: 'admin.action_denied' },
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(byEvent.page.every(({ eventType }) => eventType === 'admin.action_denied')).toBe(true)

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
