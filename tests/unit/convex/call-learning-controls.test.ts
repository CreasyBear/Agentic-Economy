import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, ownerAdmin, publishedBusinessOwner, reviewerAdmin, supportAdmin, testMfaConsequenceProof } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { retentionCall } from './content-retention-fixtures'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { CALL_FEEDBACK_RETENTION_MS, callFeedbackSchema, type CallFeedback } from '@/modules/capability-execution/call-feedback'
import { CALL_CONTENT_REVIEW_MS } from '@/lib/operator/admin-console/call-content-review'
import type { AdminCommandArgs } from '@/lib/operator/admin-console/contracts'
import { expireContentBatch } from '../../../convex/lib/capabilityExecution/contentRetention/cleanup'

afterEach(() => vi.useRealTimers())

async function feedbackFixture() {
  const backend = convexTestWithMarketComponents()
  const { owner, canonicalAccountRef } = await publishedBusinessOwner(backend, 'feedback')
  const id = await backend.run(ctx => ctx.db.insert('capabilityCalls', { ...retentionCall, ownerId: canonicalAccountRef }))
  return { backend, owner, id }
}

function feedbackArgs(feedback: CallFeedback, key = crypto.randomUUID()) {
  return withSourceWrite('protected_action', { callRef: retentionCall.callRef, feedback, operationKey: key, correlationId: key })
}

async function reviewArgs(subject: string, operationKey: string, options: { proof?: boolean; callRef?: string } = {}) {
  const command = {
    action: 'review_call_content' as const, operationKey, correlationId: operationKey,
    input: { callRef: options.callRef ?? retentionCall.callRef }, reasonCode: 'alpha_quality' as const,
    evidenceRefs: [retentionCall.callRef], approval: { kind: 'execute' as const },
  } satisfies Omit<AdminCommandArgs<'review_call_content'>, 'proof'>
  const digest = canonicalDigest({ scope: 'admin_operator', action: command.action, input: command.input,
    reasonCode: command.reasonCode, evidenceRefs: command.evidenceRefs })
  return withSourceWrite('admin_operator', { ...command,
    ...(options.proof === false ? {} : { proof: testMfaConsequenceProof({ subject }, digest) }),
  })
}

describe('owner usefulness feedback', () => {
  it('requires current ownership, completed delivery and a signed source request', async () => {
    const { backend, owner, id } = await feedbackFixture()
    const foreign = await publishedBusinessOwner(backend, 'foreign-feedback')
    const args = await feedbackArgs({ choice: 'useful' })
    expect(await backend.mutation(api.capabilityCallFeedback.writeOwner, args)).toEqual({ kind: 'refused', code: 'owner_required' })
    expect(await foreign.owner.query(api.capabilityCallFeedback.readOwner, { callRef: retentionCall.callRef })).toEqual({ kind: 'refused', code: 'owner_required' })
    expect(await foreign.owner.mutation(api.capabilityCallFeedback.writeOwner, args)).toEqual({ kind: 'refused', code: 'owner_required' })
    expect(await owner.mutation(api.capabilityCallFeedback.writeOwner, { callRef: retentionCall.callRef,
      feedback: { choice: 'useful' }, operationKey: 'unsigned', correlationId: 'unsigned' })).toEqual({ kind: 'refused', code: 'source_unavailable' })
    await backend.run(ctx => ctx.db.patch(id, { state: 'pending' }))
    expect(await owner.mutation(api.capabilityCallFeedback.writeOwner, args)).toEqual({ kind: 'refused', code: 'call_not_eligible' })
    expect(await backend.run(ctx => ctx.db.query('callUsefulnessFeedback').collect())).toEqual([])
    expect(callFeedbackSchema.safeParse({ choice: 'useful', comment: 'private content' }).success).toBe(false)
    expect(callFeedbackSchema.safeParse({ choice: 'not_useful', reason: 'private content' }).success).toBe(false)
  })

  it('serializes duplicate votes, preserves retry expiry, permits a changed vote, and never initiates a report', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = Date.now()
    const { backend, owner, id } = await feedbackFixture()
    const callBefore = await backend.run(ctx => ctx.db.get(id))
    const args = await Promise.all([feedbackArgs({ choice: 'useful' }), feedbackArgs({ choice: 'useful' })])
    const results = await Promise.all(args.map(item => owner.mutation(api.capabilityCallFeedback.writeOwner, item)))
    expect(results[0]).toEqual(results[1])
    expect(results[0]).toMatchObject({ kind: 'ready', expiresAt: now + CALL_FEEDBACK_RETENTION_MS })
    vi.setSystemTime(now + 1000)
    expect(await owner.mutation(api.capabilityCallFeedback.writeOwner, await feedbackArgs({ choice: 'useful' }))).toEqual(results[0])
    const changed = { choice: 'not_useful', reason: 'incomplete' } as const
    expect(await owner.mutation(api.capabilityCallFeedback.writeOwner, await feedbackArgs(changed)))
      .toMatchObject({ feedback: changed, expiresAt: now + 1000 + CALL_FEEDBACK_RETENTION_MS })
    expect(await backend.run(ctx => ctx.db.query('callUsefulnessFeedback').collect())).toHaveLength(1)
    expect(await backend.run(ctx => ctx.db.query('paidCallReports').collect())).toEqual([])
    expect(await backend.run(ctx => ctx.db.get(id))).toEqual(callBefore)
    await backend.run(ctx => expireContentBatch(ctx, 'feedback', null, now + 1000 + CALL_FEEDBACK_RETENTION_MS - 1))
    expect(await backend.run(ctx => ctx.db.query('callUsefulnessFeedback').collect())).toHaveLength(1)
    await backend.run(ctx => expireContentBatch(ctx, 'feedback', null, now + 1000 + CALL_FEEDBACK_RETENTION_MS))
    expect(await backend.run(ctx => ctx.db.query('callUsefulnessFeedback').collect())).toEqual([])
  })
})

describe('audited founder review', () => {
  it('rejects anonymous, support, reviewer and owner-admin without MFA', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(ctx => ctx.db.insert('capabilityCalls', retentionCall))
    for (const [subject, actor] of [
      ['user_support-review', await supportAdmin(backend, 'user_support-review')],
      ['user_reviewer-review', await reviewerAdmin(backend, 'user_reviewer-review')],
    ] as const) {
      const response = await actor.mutation(api.adminCallContent.review, await reviewArgs(subject, `review:${subject}`))
      expect(response).toMatchObject({ kind: 'command', receipt: { kind: 'refused' } })
      expect(response).not.toHaveProperty('inputJson')
    }
    expect(await backend.mutation(api.adminCallContent.review, await reviewArgs('user_anonymous-review', 'review:anonymous')))
      .toMatchObject({ kind: 'command', receipt: { kind: 'refused' } })
    const admin = await ownerAdmin(backend, 'user_owner-review')
    expect(await admin.mutation(api.adminCallContent.review, await reviewArgs('user_owner-review', 'no-mfa', { proof: false })))
      .toMatchObject({ kind: 'command', receipt: { kind: 'refused', code: 'mfa_reverification_required' } })
    expect(await backend.run(ctx => ctx.db.query('auditEvents').collect())).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'admin.call_content_reviewed' }),
    ]))
  })

  it('returns only the selected content, records one content-free audit on replay and expires at ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = Date.now()
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_scoped-review')
    await backend.run(async ctx => {
      await ctx.db.insert('capabilityCalls', retentionCall)
      await ctx.db.insert('capabilityCalls', { ...retentionCall, callRef: 'call:other', inputJson: 'different-secret' })
    })
    const review = () => reviewArgs('user_scoped-review', 'review:scoped')
    const first = await admin.mutation(api.adminCallContent.review, await review())
    expect(first).toMatchObject({ kind: 'content', callRef: retentionCall.callRef, inputJson: retentionCall.inputJson,
      outputJson: JSON.stringify(retentionCall.result.output), expiresAt: now + CALL_CONTENT_REVIEW_MS })
    expect(JSON.stringify(first)).not.toContain('different-secret')
    vi.setSystemTime(now + CALL_CONTENT_REVIEW_MS - 1)
    expect(await admin.mutation(api.adminCallContent.review, await review())).toEqual(first)
    vi.setSystemTime(now + CALL_CONTENT_REVIEW_MS)
    expect(await admin.mutation(api.adminCallContent.review, await review()))
      .toMatchObject({ kind: 'command', receipt: { code: 'review_expired' } })
    const rows = await backend.run(async ctx => ({ audits: await ctx.db.query('auditEvents').collect(), operations: await ctx.db.query('operationKeys').collect() }))
    expect(rows.audits.filter(row => row.eventType === 'admin.call_content_reviewed')).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain('private')
    expect(JSON.stringify(rows)).not.toContain('different-secret')
  })

  it('rechecks current membership and content deletion on an accepted review replay', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_revoked-review')
    const id = await backend.run(ctx => ctx.db.insert('capabilityCalls', retentionCall))
    const review = () => reviewArgs('user_revoked-review', 'review:revoked')
    expect(await admin.mutation(api.adminCallContent.review, await review())).toMatchObject({ kind: 'content' })
    const membershipId = await backend.run(async ctx => {
      const row = await ctx.db.query('adminMemberships').withIndex('by_tokenIdentifier_and_state', q =>
        q.eq('tokenIdentifier', 'token_revoked-review').eq('state', 'active')).unique()
      if (row === null) throw new Error('fixture_membership_missing')
      await ctx.db.patch(row._id, { role: 'support' })
      return row._id
    })
    expect(await admin.mutation(api.adminCallContent.review, await review())).toMatchObject({ kind: 'command', receipt: { kind: 'refused' } })
    await backend.run(async ctx => {
      await ctx.db.patch(membershipId, { role: 'owner_admin' })
      await ctx.db.patch(id, { contentExpiredAt: Date.now(), inputJson: undefined,
        result: { kind: 'completed', callRef: retentionCall.callRef, toolRef: retentionCall.toolRef, evidenceHash: 'sha256:output', contentExpiredAt: Date.now() } })
    })
    expect(await admin.mutation(api.adminCallContent.review, await review())).toMatchObject({ kind: 'command', receipt: { code: 'content_expired' } })
  })
})

describe('content-free alpha learning sample', () => {
  it('requires an admin role, bounds each signal, excludes old records and projects no content', async () => {
    const backend = convexTestWithMarketComponents()
    const now = Date.now()
    const from = now - CALL_FEEDBACK_RETENTION_MS
    const admin = await ownerAdmin(backend, 'user_metrics')
    const support = await supportAdmin(backend, 'user_metrics-support')
    await backend.run(async ctx => {
      await ctx.db.insert('capabilityCalls', retentionCall)
      for (let i = 0; i < 53; i++) {
        const createdAt = i === 52 ? from - 1 : now - i
        await ctx.db.insert('capabilityCallProjections', {
          callRef: `call:metrics:${i}`, accountRef: 'account:metrics', principalRef: 'principal:metrics',
          credentialRef: 'credential:metrics', applicationRef: 'application:metrics', toolRef: 'tool:metrics', providerRef: 'provider:metrics',
          toolLabel: 'private provider display label', state: 'completed', deliveryState: 'delivered', paymentState: 'settled',
          audAmountUnits: '10000', latencyMs: 100, createdAt, updatedAt: createdAt,
        })
        await ctx.db.insert('toolSelectionDecisions', { kind: 'procure', correlationId: `selection:metrics:${i}`,
          offered: [], fit: [], tier: i === 0 ? 'private old diagnostic' : i % 2 === 0 ? 'no_match' : 'selection_unavailable',
          latencyMs: 50, createdAt })
        await ctx.db.insert('callUsefulnessFeedback', { callRef: `call:metrics:${i}`, accountRef: 'account:metrics',
          toolRef: 'tool:metrics', feedback: { choice: 'useful' }, createdAt, updatedAt: createdAt, expiresAt: createdAt + CALL_FEEDBACK_RETENTION_MS })
      }
    })
    expect(await backend.query(api.adminConsoleMetrics.readAlphaLearningSample, { now })).toMatchObject({ kind: 'refused' })
    const result = await admin.query(api.adminConsoleMetrics.readAlphaLearningSample, { now })
    expect(result).toMatchObject({ kind: 'learning', sampleLimit: 50, truncated: true, from, asOf: now })
    if (result.kind !== 'learning') throw new Error('learning_missing')
    expect(result.calls).toHaveLength(50)
    expect(result.feedback).toHaveLength(50)
    expect(result.selections).toHaveLength(50)
    expect(JSON.stringify(result)).not.toMatch(/private|account:metrics|call:metrics:52/u)
    expect(result.selections[0]?.outcome).toBe('no_selection')
    expect(await support.query(api.adminConsoleMetrics.readAlphaLearningSample, { now })).toEqual(result)
  })

  it('records empty chat searches once per prompt without accepting contradictory picks', async () => {
    const backend = convexTestWithMarketComponents()
    const args = { kind: 'chat_recommend' as const, accountRef: 'account:learning', correlationId: 'thread:prompt',
      threadId: 'thread', promptMessageId: 'prompt', offered: [], fit: [], tier: 'no_match', latencyMs: 23, shown: false }
    await Promise.all([backend.mutation(internal.capabilitySelectionDecisions.recordInternal, args),
      backend.mutation(internal.capabilitySelectionDecisions.recordInternal, args)])
    const records = await backend.query(internal.capabilitySelectionDecisions.recent, { limit: 10 })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ offered: [], fit: [], tier: 'no_match' })
    await expect(backend.mutation(internal.capabilitySelectionDecisions.recordInternal, { ...args, pickedToolRef: 'tool:contradiction' }))
      .rejects.toThrow('empty_outcome_invalid')
  })
})
