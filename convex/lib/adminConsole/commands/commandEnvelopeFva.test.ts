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
  nonAdmin,
  ownerAdmin,
  reviewerAdmin,
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
  it.each(['first_factor_only', 'wrong_subject', 'elapsed_stale', 'future_anchor', 'first_factor_stale'] as const)(
    'refuses %s evidence before proof consumption, proposals or apply effects', async fault => {
      const backend = convexTest(schema, convexModules)
      const subject = `user_admin-mfa-${fault}`
      const admin = await ownerAdmin(backend, subject)
      const base = baseCommand(subject, `admin:test:mfa:${fault}`)
      const fresh = testMfaConsequenceProof(identity(subject), effectDigest(base))
      const proof = {
        ...fresh,
        ...(fault === 'first_factor_only' ? { secondFactorAgeMinutes: -1 } : {}),
        ...(fault === 'wrong_subject' ? { subject: 'user_other-admin' } : {}),
        ...(fault === 'elapsed_stale' ? { evidenceObservedAt: Date.now() - 600_000 } : {}),
        ...(fault === 'future_anchor' ? { evidenceObservedAt: Date.now() + 60_000 } : {}),
        ...(fault === 'first_factor_stale' ? { firstFactorAgeMinutes: 10 } : {}),
      }
      const args = await withSourceWrite('admin_operator', { ...base, proof })
      expect(await admin.run(ctx => runAdminCommand(ctx, args, spec(ctx, fault))))
        .toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
      expect(await applyAuditCount(backend)).toBe(0)
      expect(await backend.run(ctx => ctx.db.query('consequenceProofUses').collect())).toEqual([])
      expect(await backend.run(ctx => ctx.db.query('adminApprovalProposals').collect())).toEqual([])
    },
  )

  it('rejects factor evidence changed after signing before effects', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-mfa-tamper'
    const admin = await ownerAdmin(backend, subject)
    const base = baseCommand(subject, 'admin:test:mfa:tamper')
    const proof = testMfaConsequenceProof(identity(subject), effectDigest(base))
    const signed = await withSourceWrite('admin_operator', { ...base, proof })
    const tampered = { ...signed, proof: { ...proof, evidenceObservedAt: proof.evidenceObservedAt + 1 } }
    expect(await admin.run(ctx => runAdminCommand(ctx, tampered, spec(ctx, 'tamper'))))
      .toMatchObject({ kind: 'refused' })
    expect(await applyAuditCount(backend)).toBe(0)
    expect(await backend.run(ctx => ctx.db.query('consequenceProofUses').collect())).toEqual([])
  })

  it('accepts both fresh factors without a Convex fva claim', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-mfa-fresh'
    const admin = await ownerAdmin(backend, subject)
    const base = baseCommand(subject, 'admin:test:mfa:fresh')
    const args = await withSourceWrite('admin_operator', {
      ...base, proof: testMfaConsequenceProof(identity(subject), effectDigest(base)),
    })
    expect(await admin.run(ctx => runAdminCommand(ctx, args, spec(ctx, 'fresh'))))
      .toMatchObject({ kind: 'completed', code: 'business_suppressed' })
    expect(await applyAuditCount(backend)).toBe(1)
    expect(await backend.run(ctx => ctx.db.query('consequenceProofUses').collect())).toHaveLength(1)
  })

  it('refuses a missing proof before apply writes', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-missing-proof'
    const admin = await ownerAdmin(backend, subject)
    const unsigned = baseCommand(subject, 'admin:test:missing-proof')
    const args = await withSourceWrite('admin_operator', unsigned)

    const receipt = await admin.run(async (ctx) => {
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
        ...testMfaConsequenceProof(identity(subject), effectDigest(base)),
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

  it('does not audit an unsigned direct denial', async () => {
    const backend = convexTest(schema, convexModules)
    const caller = backend.withIdentity({
      subject: 'user_unsigned-admin',
      issuer: 'https://identity.example',
      tokenIdentifier: 'token_unsigned-admin',
    })
    const base = baseCommand('user_unsigned-admin', 'admin:test:unsigned')
    const receipt = await caller.run((ctx) => runAdminCommand(ctx, base, spec(ctx, 'unsigned')))
    expect(receipt).toMatchObject({ kind: 'refused', code: 'missing_source_write_admission' })
    expect(await backend.run((ctx) => ctx.db.query('auditEvents').collect())).toHaveLength(0)
  })

  it('does not consume proof on a stale target precondition', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-stale-target'
    const admin = await ownerAdmin(backend, subject)
    const base = {
      ...baseCommand(subject, 'admin:test:stale-target'),
      expectedStateDigest: 'sha256:stale',
    }
    const args = await withSourceWrite('admin_operator', {
      ...base,
      proof: testMfaConsequenceProof(identity(subject), canonicalDigest({
        scope: 'admin_operator', action: base.action, input: base.input,
        reasonCode: base.reasonCode, evidenceRefs: base.evidenceRefs,
        expectedStateDigest: base.expectedStateDigest,
      })),
    })
    expect(await admin.run((ctx) => runAdminCommand(ctx, args, spec(ctx, 'stale-target'))))
      .toMatchObject({ kind: 'refused', code: 'target_changed' })
    expect(await backend.run((ctx) => ctx.db.query('consequenceProofUses').collect())).toHaveLength(0)
  })

  it('does not consume proof when a second owner must approve', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-approval-precondition'
    const admin = await ownerAdmin(backend, subject)
    await ownerAdmin(backend, 'user_admin-command-second-owner')
    const base = baseCommand(subject, 'admin:test:approval-precondition')
    const args = await withSourceWrite('admin_operator', {
      ...base,
      proof: testMfaConsequenceProof(identity(subject), effectDigest(base)),
    })
    expect(await admin.run((ctx) => runAdminCommand(ctx, args, spec(ctx, 'approval-precondition'))))
      .toMatchObject({ kind: 'refused', code: 'approval_required' })
    expect(await backend.run((ctx) => ctx.db.query('consequenceProofUses').collect())).toHaveLength(0)
  })

  it('leaves proof unused when the proposal has expired', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-expired-proposal'
    const admin = await ownerAdmin(backend, subject)
    await ownerAdmin(backend, 'user_admin-command-proposer')
    const base = {
      ...baseCommand(subject, 'admin:test:expired-proposal'),
      approval: { kind: 'approve' as const, proposalRef: 'admin-proposal:expired' },
    }
    const commandDigest = effectDigest(base)
    await backend.run((ctx) => ctx.db.insert('adminApprovalProposals', {
      proposalRef: base.approval.proposalRef,
      action: base.action,
      commandDigest,
      commandJson: JSON.stringify({ input: base.input, reasonCode: base.reasonCode, evidenceRefs: base.evidenceRefs }),
      proposerRef: 'token_admin-command-proposer',
      status: 'awaiting_second_approval',
      createdAt: Date.now() - 86_400_000,
      expiresAt: Date.now() - 1,
    }))
    const args = await withSourceWrite('admin_operator', {
      ...base, proof: testMfaConsequenceProof(identity(subject), commandDigest),
    })
    expect(await admin.run((ctx) => runAdminCommand(ctx, args, spec(ctx, 'expired-proposal'))))
      .toMatchObject({ kind: 'refused', code: 'approval_expired' })
    expect(await backend.run((ctx) => ctx.db.query('consequenceProofUses').collect())).toHaveLength(0)
  })

  it('bounds evidence and opaque refs before admission or audit writes', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-bounds'
    const admin = await ownerAdmin(backend, subject)
    for (const [suffix, override, code] of [
      ['many', { evidenceRefs: Array.from({ length: 9 }, (_, index) => `evidence:${index}`) }, 'admin_missing_evidence'],
      ['long', { evidenceRefs: ['x'.repeat(201)] }, 'admin_missing_evidence'],
      ['key', { operationKey: 'invalid key' }, 'source_write_operation_mismatch'],
      ['correlation', { correlationId: 'invalid correlation' }, 'source_write_correlation_mismatch'],
    ] as const) {
      const base = { ...baseCommand(subject, `admin:test:bounds:${suffix}`), ...override }
      const args = await withSourceWrite('admin_operator', base)
      expect(await admin.run((ctx) => runAdminCommand(ctx, args, spec(ctx, suffix))))
        .toMatchObject({ kind: 'refused', code })
    }
    expect(await backend.run((ctx) => ctx.db.query('auditEvents').collect())).toHaveLength(0)
  })


  it('refuses a caller without an Admin membership', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-non-admin'
    const caller = await nonAdmin(backend, subject)
    const base = baseCommand(subject, 'admin:test:non-admin')
    const args = await withSourceWrite('admin_operator', {
      ...base,
      proof: testMfaConsequenceProof(identity(subject), effectDigest(base)),
    })
    const receipt = await caller.run(async (ctx) =>
      await runAdminCommand(ctx, args, spec(ctx, 'non-admin')))

    expect(receipt).toMatchObject({ kind: 'refused', code: 'missing_membership' })
    const denials = await backend.run((ctx) => ctx.db.query('auditEvents')
      .withIndex('by_eventType_and_createdAt', (query) => query.eq('eventType', 'admin.action_denied'))
      .collect())
    expect(denials).toHaveLength(1)
    expect(await applyAuditCount(backend)).toBe(0)
  })

  it('refuses a reviewer without suppress_business permission', async () => {
    const backend = convexTest(schema, convexModules)
    const subject = 'user_admin-command-reviewer'
    const caller = await reviewerAdmin(backend, subject)
    const base = baseCommand(subject, 'admin:test:reviewer')
    const args = await withSourceWrite('admin_operator', {
      ...base,
      proof: testMfaConsequenceProof(identity(subject), effectDigest(base)),
    })
    const receipt = await caller.run(async (ctx) =>
      await runAdminCommand(ctx, args, spec(ctx, 'reviewer')))

    expect(receipt).toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
    expect(await applyAuditCount(backend)).toBe(0)
  })
})
