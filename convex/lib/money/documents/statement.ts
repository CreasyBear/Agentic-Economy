import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { readCommercialPolicyGate } from '../../../moneyCommercialPolicy'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../../../../src/modules/common/stable-hash'
import { documentEnvironment } from './insert'
import { enqueueStatementPage } from './workpool'

export const createOwnerStatementArgs = v.object({
    environment: documentEnvironment,
    periodStart: v.number(),
    periodEnd: v.number(),
    purpose: v.optional(v.union(v.literal('statement'), v.literal('daily_close'))),
  })
export const createOwnerStatementResult = v.union(
    v.object({ kind: v.literal('created'), documentRef: v.string() }),
    v.object({ kind: v.literal('replayed'), documentRef: v.string() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  )
export const createOwnerStatementHandler = async (ctx: MutationCtx, args: Infer<typeof createOwnerStatementArgs>) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'authentication_required' }
    const purpose = args.purpose ?? 'statement'
    if (!Number.isSafeInteger(args.periodStart)
      || !Number.isSafeInteger(args.periodEnd)
      || args.periodStart < 0
      || args.periodEnd <= args.periodStart
      || args.periodEnd - args.periodStart > 366 * 24 * 60 * 60 * 1_000) {
      return { kind: 'refused' as const, code: 'statement_period_invalid' }
    }
    if (purpose === 'daily_close'
      && (args.periodEnd - args.periodStart !== 24 * 60 * 60 * 1_000
        || args.periodStart % (24 * 60 * 60 * 1_000) !== 0)) {
      return { kind: 'refused' as const, code: 'daily_close_period_invalid' }
    }
    const policy = await readCommercialPolicyGate(ctx.db, {
      environment: args.environment,
      now: Date.now(),
      ...(args.environment === 'sandbox'
        ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
        : {}),
    })
    if (policy.kind === 'refused') return { kind: 'refused' as const, code: policy.code }
    const snapshotCutoffAt = Date.now()
    const documentRef = `money-document:${purpose}:${canonicalDigest({
      format: 'ae.money-statement-identity:v2',
      accountRef: actor.canonicalAccountRef,
      environment: args.environment,
      purpose,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
    }).slice('sha256:'.length)}`
    const existing = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', documentRef))
      .unique()
    if (existing !== null) return { kind: 'replayed' as const, documentRef }
    const initialSnapshot = {
      format: 'ae.money-statement-snapshot:v2',
      documentRef,
      accountRef: actor.canonicalAccountRef,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      snapshotCutoffAt,
      purpose,
    } as const satisfies StableHashValue
    const documentId = await ctx.db.insert('moneyDocuments', {
      documentRef,
      accountRef: actor.canonicalAccountRef,
      kind: purpose,
      sourceTransactionRefs: [],
      amountUnits: '0',
      residualUnits: '0',
      policyRefs: [...policy.policyRefs],
      policyDigest: policy.policyDigest,
      templateVersion: 'ae.money-document:html:v1',
      renderInputJson: stableStringify(initialSnapshot),
      renderInputDigest: canonicalDigest(initialSnapshot),
      state: 'building',
      environment: args.environment,
      sourceCount: 0,
      snapshotDigest: canonicalDigest(initialSnapshot),
      snapshotCutoffAt,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      pageCount: 0,
      exactAmountUnits: '0',
      createdAt: snapshotCutoffAt,
    })
    const workId = await enqueueStatementPage(ctx, documentRef)
    await ctx.db.patch(documentId, { workId })
    return { kind: 'created' as const, documentRef }
  }

