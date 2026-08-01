/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { authorPlanEnvelope, type PlanContract, type PlanEnvelope } from '../src/modules/plan-proposal/public'
import { createSourceWriteAdmission, sourceWriteBodyDigest } from '../src/modules/security/source-write-admission'

const modules = import.meta.glob('./**/*.ts')
const SOURCE_WRITE_SECRET = 'engine-plan-local-source-write-secret'
const SOURCE_REQUEST = {
  method: 'POST',
  origin: 'http://127.0.0.1:3024',
  pathname: '/api/answer/turn',
  bodyDigest: sourceWriteBodyDigest(undefined),
}

const contract: PlanContract = {
  goalText: 'Compare local options',
  goalPredicate: { kind: 'options_compared', minCount: 1 },
  steps: [
    {
      id: 'first', title: 'Find options', actionId: 'registry.search', input: { query: 'dentist' },
      dependsOn: [], successCriterion: { kind: 'nonempty_results' },
    },
    {
      id: 'second', title: 'Find alternatives', actionId: 'registry.search', input: { query: 'orthodontist' },
      dependsOn: [], successCriterion: { kind: 'nonempty_results' },
    },
  ],
  rationale: 'Compare current published supply.',
}

describe('engine plan Convex store', () => {
  const previousSecret = process.env.AE_SOURCE_WRITE_SECRET

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AE_SOURCE_WRITE_SECRET
    else process.env.AE_SOURCE_WRITE_SECRET = previousSecret
  })

  it('supersedes revisions, journals monotonic seq, and enforces one in-progress step', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)

    await expect(recordRevision(backend, 1, 1_000)).resolves.toEqual({
      planId: 'plan:one', revision: 1, seq: 1,
    })
    await expect(recordEvent(backend, 'step_started', 'first', 1_010)).resolves.toEqual({
      planId: 'plan:one', seq: 2,
    })
    await expect(recordEvent(backend, 'step_started', 'second', 1_011)).rejects.toThrow(
      'plan_step_already_in_progress',
    )
    await expect(recordEvent(backend, 'step_completed', 'first', 1_020)).resolves.toEqual({
      planId: 'plan:one', seq: 3,
    })
    await expect(recordRevision(backend, 2, 2_000)).resolves.toEqual({
      planId: 'plan:one', revision: 2, seq: 4,
    })

    const stored = await backend.query(api.enginePlans.readPlanWithEvents, { threadId: 'thread:one' })
    expect(stored?.plan).toMatchObject({ planId: 'plan:one', revision: 2, status: 'active' })
    expect(stored?.events.map(({ seq }) => seq)).toEqual([1, 2, 3, 4])
    expect(JSON.parse(stored?.plan.stepStatusesJson ?? '{}')).toEqual({ first: 'pending', second: 'pending' })

    const revisions = await backend.run(async (ctx) => await ctx.db
      .query('enginePlans')
      .withIndex('by_planId_and_revision', (query) => query.eq('planId', 'plan:one'))
      .order('asc')
      .take(10))
    expect(revisions.map(({ revision, status }) => ({ revision, status }))).toEqual([
      { revision: 1, status: 'superseded' },
      { revision: 2, status: 'active' },
    ])
  })
  it('rejects stale fences, preserves operation idempotency, and expires at execution', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const envelope = authorPlanEnvelope({
      planId: 'plan:fenced', threadId: 'thread:fenced', revision: 1, authoredAt: 1_000, contract,
    })
    await expect(recordRevisionFor(backend, envelope, 'fenced-revision')).resolves.toMatchObject({ seq: 1 })
    const operationKey = 'plan:fenced:event'
    const correlationId = `${operationKey}:correlation`
    const eventArgs = {
      planId: envelope.planId,
      expectedRevision: 1,
      expectedPlanDigest: envelope.planDigest,
      kind: 'step_started' as const,
      stepId: 'first',
      payloadJson: '{}',
      at: 1_010,
      operationKey,
      correlationId,
      sourceWrite: admission(operationKey, correlationId, 'one'),
    }
    await expect(backend.mutation(api.enginePlans.recordPlanEvent, eventArgs)).resolves.toEqual({
      planId: envelope.planId, seq: 2,
    })
    await expect(backend.mutation(api.enginePlans.recordPlanEvent, {
      ...eventArgs,
      sourceWrite: admission(operationKey, correlationId, 'two'),
    })).resolves.toEqual({ planId: envelope.planId, seq: 2 })
    await expect(backend.mutation(api.enginePlans.recordPlanEvent, {
      ...eventArgs,
      payloadJson: '{"changed":true}',
      sourceWrite: admission(operationKey, correlationId, 'three'),
    })).rejects.toThrow('operation_key_conflict')
    await expect(backend.mutation(api.enginePlans.recordPlanEvent, {
      ...eventArgs,
      operationKey: 'plan:fenced:stale',
      correlationId: 'plan:fenced:stale:c',
      expectedRevision: 2,
      sourceWrite: admission('plan:fenced:stale', 'plan:fenced:stale:c', 'four'),
    })).rejects.toThrow('plan_revision_fence_mismatch')

    const expiryKey = 'plan:fenced:expiry'
    await expect(backend.mutation(api.enginePlans.recordPlanEvent, {
      ...eventArgs,
      operationKey: expiryKey,
      correlationId: `${expiryKey}:correlation`,
      at: envelope.bounds.expiresAt,
      sourceWrite: admission(expiryKey, `${expiryKey}:correlation`, 'five'),
    })).resolves.toMatchObject({ status: 'expired' })
    const stored = await backend.run(async (ctx) => await ctx.db
      .query('enginePlans')
      .withIndex('by_planId_and_revision', (query) => query.eq('planId', envelope.planId))
      .unique())
    expect(stored?.status).toBe('expired')
  })

  it('does not supersede an active revision with an in-progress step', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await recordRevision(backend, 1, 1_000)
    await recordEvent(backend, 'step_started', 'first', 1_010)
    await expect(recordRevision(backend, 2, 2_000)).rejects.toThrow('plan_revision_in_progress')
  })
})

async function recordRevision(backend: TestConvex<typeof schema>, revision: number, createdAt: number) {
  const envelope = authorPlanEnvelope({
    planId: 'plan:one', threadId: 'thread:one', revision,
    ...(revision === 1 ? {} : { revisionOf: revision - 1 }),
    authoredAt: createdAt, contract,
  })
  return await recordRevisionFor(backend, envelope, `revision:${revision}`)
}

async function recordRevisionFor(
  backend: TestConvex<typeof schema>,
  envelope: PlanEnvelope,
  keySuffix: string,
) {
  const operationKey = `plan:revision:${keySuffix}`
  const correlationId = `plan:correlation:${keySuffix}`
  return await backend.mutation(api.enginePlans.recordPlanRevision, {
    planId: envelope.planId,
    threadId: envelope.threadId,
    revision: envelope.revision,
    ...(envelope.revisionOf === undefined ? {} : { revisionOf: envelope.revisionOf }),
    contractJson: JSON.stringify(envelope.contract),
    planDigest: envelope.planDigest,
    createdAt: envelope.bounds.expiresAt - 15 * 60 * 1_000,
    expiresAt: envelope.bounds.expiresAt,
    operationKey,
    correlationId,
    sourceWrite: admission(operationKey, correlationId),
  })
}

async function recordEvent(
  backend: TestConvex<typeof schema>,
  kind: 'step_started' | 'step_completed',
  stepId: string,
  at: number,
) {
  const operationKey = `plan:event:${kind}:${stepId}:${at}`
  const correlationId = `plan:correlation:${kind}:${stepId}:${at}`
  return await backend.mutation(api.enginePlans.recordPlanEvent, {
    planId: 'plan:one', kind, stepId, payloadJson: '{}', at,
    operationKey, correlationId, sourceWrite: admission(operationKey, correlationId),
  })
}

function admission(operationKey: string, correlationId: string, nonceSuffix = 'nonce') {
  return createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
    request: SOURCE_REQUEST,
    scope: 'answer_thread',
    operationKey,
    correlationId,
    nonce: `${operationKey}:${nonceSuffix}`,
  })
}

