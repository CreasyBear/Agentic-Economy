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
  ownerAdmin,
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

function baseCommand(
  subject: string,
  operationKey: string,
  reasonCode: SuppressionArgs['reasonCode'] = 'policy_violation',
): SuppressionArgsWithoutProof {
  return {
    operationKey,
    correlationId: `${operationKey}:correlation`,
    action: 'set_business_suppression',
    input: { businessId: `business:${subject}`, intent: 'suppress' },
    reasonCode,
    evidenceRefs: ['evidence:admin:idempotency'],
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
        evidenceRefs: ['evidence:admin:idempotency'],
        redactedPayloadJson: '{}',
        payloadHash: canonicalDigest({ suffix }),
        createdAt: Date.now(),
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

async function signedCommand(
  subject: string,
  operationKey: string,
  nonce: string,
  reasonCode: SuppressionArgs['reasonCode'] = 'policy_violation',
) {
  const base = baseCommand(subject, operationKey, reasonCode)
  return await withSourceWrite('admin_operator', {
    ...base,
    proof: testConsequenceProof(identity(subject), effectDigest(base)),
  }, { nonce })
}

async function adminRows(backend: ConvexFixtureBackend) {
  return await backend.run(async (ctx) => {
    const auditEvents = await ctx.db.query('auditEvents').collect()
    const operationKeys = await ctx.db.query('operationKeys').collect()
    return {
      applyAudits: auditEvents.filter((row) => row.eventId.startsWith('audit:test-apply:')),
      operationKeys: operationKeys.filter((row) => row.scope === 'admin_operator'),
    }
  })
}

describe('admin command idempotency', () => {
  it('replays identical bytes without repeating effects', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-idempotent'
    const admin = await ownerAdmin(backend, subject)
    const operationKey = 'admin:test:idempotent'
    const firstArgs = await signedCommand(subject, operationKey, 'nonce:admin:idempotent:1')
    const replayArgs = await signedCommand(subject, operationKey, 'nonce:admin:idempotent:2')

    const first = await admin.run(async (ctx) =>
      await runAdminCommand(ctx, firstArgs, spec(ctx, 'idempotent')))
    const replay = await admin.run(async (ctx) =>
      await runAdminCommand(ctx, replayArgs, spec(ctx, 'idempotent')))

    expect(JSON.stringify(replay)).toBe(JSON.stringify(first))
    const rows = await adminRows(backend)
    expect(rows.applyAudits).toHaveLength(1)
    expect(rows.operationKeys).toHaveLength(1)
  })

  it('refuses a reused key when material changes', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-conflict'
    const admin = await ownerAdmin(backend, subject)
    const operationKey = 'admin:test:conflict'
    const firstArgs = await signedCommand(subject, operationKey, 'nonce:admin:conflict:1')
    const changedArgs = await signedCommand(
      subject,
      operationKey,
      'nonce:admin:conflict:2',
      'legal_notice',
    )

    await admin.run(async (ctx) =>
      await runAdminCommand(ctx, firstArgs, spec(ctx, 'conflict')))
    const conflict = await admin.run(async (ctx) =>
      await runAdminCommand(ctx, changedArgs, spec(ctx, 'conflict')))

    expect(conflict).toMatchObject({ kind: 'refused', code: 'idempotency_conflict' })
    const rows = await adminRows(backend)
    expect(rows.applyAudits).toHaveLength(1)
    expect(rows.operationKeys).toHaveLength(1)
  })
})
