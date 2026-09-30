/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../schema'
import type { MutationCtx } from '../../../_generated/server'
import {
  runAdminCommand,
  type AdminCommandSpec,
} from './commandEnvelope'
import type { AdminCommandArgs } from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  convexModules,
  ownerAdmin,
  testMfaConsequenceProof,
  type ConvexFixtureBackend,
} from '../../../../tests/helpers/convex-fixtures'
import { withSourceWrite } from '../../../../tests/helpers/source-write-admission'

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
    proof: testMfaConsequenceProof(identity(subject), effectDigest(base)),
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

  it('replays an accepted operation after proof expiry but refuses its proof under a new operation key', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-proof-operation'
    const admin = await ownerAdmin(backend, subject)
    const first = await signedCommand(subject, 'admin:test:proof-operation', 'nonce:admin:proof-operation:1')
    const receipt = await admin.run(ctx => runAdminCommand(ctx, first, spec(ctx, 'proof-operation')))
    expect(receipt).toMatchObject({ kind: 'completed' })
    const proof = first.proof
    if (proof === undefined) throw new Error('fixture_proof_missing')
    const staleReplay = await withSourceWrite('admin_operator', {
      ...first, proof: { ...proof, evidenceObservedAt: Date.now() - 600_000 },
    }, { nonce: 'nonce:admin:proof-operation:2' })
    expect(await admin.run(ctx => runAdminCommand(ctx, staleReplay, spec(ctx, 'proof-operation')))).toEqual(receipt)
    const proofFreeReplay = await withSourceWrite('admin_operator',
      baseCommand(subject, first.operationKey), { nonce: 'nonce:admin:proof-operation:without-proof' })
    expect(await admin.run(ctx => runAdminCommand(ctx, proofFreeReplay, spec(ctx, 'proof-operation')))).toEqual(receipt)
    const reused = await withSourceWrite('admin_operator', {
      ...first, operationKey: 'admin:test:proof-operation:new', correlationId: 'admin:test:proof-operation:new',
    }, { nonce: 'nonce:admin:proof-operation:3' })
    expect(await admin.run(ctx => runAdminCommand(ctx, reused, spec(ctx, 'proof-operation'))))
      .toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    const rows = await adminRows(backend)
    expect(rows.applyAudits).toHaveLength(1)
    expect(rows.operationKeys).toHaveLength(1)
    expect(await backend.run(ctx => ctx.db.query('consequenceProofUses').collect())).toHaveLength(1)
  })
})
