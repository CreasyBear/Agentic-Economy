/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import type { MutationCtx } from '../../../convex/_generated/server'
import {
  runAdminCommand,
  type AdminCommandSpec,
} from '../../../convex/lib/adminConsole/command-envelope'
import type { AdminCommandArgs } from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  convexModules,
  nonAdmin,
  ownerAdmin,
  reviewerAdmin,
  testConsequenceProof,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

type SuppressionArgs = AdminCommandArgs<'set_business_suppression'>
type SuppressionArgsWithoutProof = Omit<SuppressionArgs, 'proof'>

function identity(subject: string) {
  return {
    subject,
    tokenIdentifier: subject.replace(/^user_/u, 'token_'),
  }
}

function baseCommand(subject: string, operationKey: string): SuppressionArgsWithoutProof {
  return {
    operationKey,
    correlationId: `${operationKey}:correlation`,
    action: 'set_business_suppression',
    input: { businessId: `business:${subject}`, intent: 'suppress' },
    reasonCode: 'policy_violation',
    evidenceRefs: ['evidence:admin:test'],
    approval: { kind: 'execute' },
  }
}

function effectDigest(args: SuppressionArgsWithoutProof): string {
  return canonicalDigest({
    scope: 'admin_operator',
    action: args.action,
    input: args.input,
    reasonCode: args.reasonCode,
    evidenceRefs: args.evidenceRefs,
  })
}

function spec(
  ctx: Pick<MutationCtx, 'db'>,
  suffix: string,
): AdminCommandSpec<'set_business_suppression'> {
  return {
    targetType: 'business',
    targetRef: `business:${suffix}`,
    auditEventType: 'business.suppressed',
    currentStateDigest: async () => null,
    apply: async (actor) => {
      const now = Date.now()
      await ctx.db.insert('auditEvents', {
        eventId: `audit:test-apply:${suffix}`,
        eventType: 'business.suppressed',
        actorKind: 'admin',
        actorRef: actor.membership.clerkUserId,
        targetType: 'business',
        targetRef: `apply:${suffix}`,
        beforeState: 'discoverable',
        afterState: 'suppressed',
        outcome: 'suppressed',
        idempotencyKey: `test-apply:${suffix}`,
        correlationId: `test-apply:${suffix}`,
        reasonCode: 'policy_violation',
        evidenceRefs: ['evidence:admin:test'],
        redactedPayloadJson: '{}',
        payloadHash: canonicalDigest({ suffix }),
        createdAt: now,
      })
      return {
        kind: 'applied',
        code: 'business_suppressed',
        effectRefs: [`business:${suffix}`],
        beforeState: 'discoverable',
        afterState: 'suppressed',
      }
    },
  }
}

async function applyAuditCount(backend: ConvexFixtureBackend) {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('auditEvents').collect()
    return rows.filter((row) => row.eventId.startsWith('audit:test-apply:')).length
  })
}

describe('admin command fresh-verification and authority gates', () => {
  it('refuses a missing proof before apply writes', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-missing-proof'
    const admin = await ownerAdmin(backend, subject)
    const unsigned = baseCommand(subject, 'admin:test:missing-proof')
    const args = await withSourceWrite('admin_operator', unsigned)

    const receipt = await admin.run(async (ctx) => {
      // @ts-expect-error Exercises defense in depth below the required wire validator.
      return await runAdminCommand(ctx, args, spec(ctx, 'missing-proof'))
    })

    expect(receipt).toEqual({
      kind: 'refused',
      action: 'set_business_suppression',
      code: 'mfa_reverification_required',
      correlationId: unsigned.correlationId,
    })
    expect(await applyAuditCount(backend)).toBe(0)
  })

  it('refuses a stale proof before apply writes', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-stale-proof'
    const admin = await ownerAdmin(backend, subject)
    const base = baseCommand(subject, 'admin:test:stale-proof')
    const args = await withSourceWrite('admin_operator', {
      ...base,
      proof: {
        ...testConsequenceProof(identity(subject), effectDigest(base)),
        firstFactorAgeMinutes: 10,
      },
    })

    const receipt = await admin.run(async (ctx) =>
      await runAdminCommand(ctx, args, spec(ctx, 'stale-proof')))

    expect(receipt).toMatchObject({
      kind: 'refused',
      code: 'mfa_reverification_required',
    })
    expect(await applyAuditCount(backend)).toBe(0)
  })

  it('refuses a caller without an Admin membership', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-non-admin'
    const caller = await nonAdmin(backend, subject)
    const base = baseCommand(subject, 'admin:test:non-admin')
    const args: SuppressionArgs = {
      ...base,
      proof: testConsequenceProof(identity(subject), effectDigest(base)),
    }

    const receipt = await caller.run(async (ctx) =>
      await runAdminCommand(ctx, args, spec(ctx, 'non-admin')))

    expect(receipt).toMatchObject({ kind: 'refused', code: 'missing_membership' })
    expect(await applyAuditCount(backend)).toBe(0)
  })

  it('refuses a reviewer without suppress_business permission', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-reviewer'
    const caller = await reviewerAdmin(backend, subject)
    const base = baseCommand(subject, 'admin:test:reviewer')
    const args: SuppressionArgs = {
      ...base,
      proof: testConsequenceProof(identity(subject), effectDigest(base)),
    }

    const receipt = await caller.run(async (ctx) =>
      await runAdminCommand(ctx, args, spec(ctx, 'reviewer')))

    expect(receipt).toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
    expect(await applyAuditCount(backend)).toBe(0)
  })
})
