import { MockLanguageModelV4 } from 'ai/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: 0,
  withCost: true,
  build: (_proposalId: string): unknown => undefined,
}))

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: () => () => new MockLanguageModelV4({
    doGenerate: async (request) => {
      mocks.calls += 1
      const proposalId = JSON.stringify(request.prompt).match(/[0-9a-f]{8}-[0-9a-f-]{27}/iu)?.[0]
      if (proposalId === undefined) throw new Error('proposal id missing from prompt')
      return {
        content: [{ type: 'text', text: JSON.stringify(mocks.build(proposalId)) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        ...(mocks.withCost ? { providerMetadata: { openrouter: { usage: { cost: 0.01 } } } } : {}),
        warnings: [],
      }
    },
  }),
}))

import {
  derivePlanMetrics,
  evaluateGoalPredicate,
  flattenProposalForTransport,
  runProposalSegment,
  type PlanContract,
  type PlanEvent,
  type Proposal,
} from '@/modules/plan-proposal/public'

const flat = (proposal: Proposal): unknown => flattenProposalForTransport(proposal)

const basePlan: PlanContract = {
  goalText: 'Find a local dentist',
  goalPredicate: { kind: 'options_compared', minCount: 1 },
  steps: [{
    id: 'search', title: 'Find dentists', actionId: 'registry.search', input: { query: 'dentist' },
    dependsOn: [], successCriterion: { kind: 'nonempty_results' },
  }],
  rationale: 'Find current published options first.',
}

const segmentInput = {
  query: 'Find a local dentist',
  threadContext: '',
  evidence: [],
  spentUsd: 0,
  segmentIndex: 0,
} as const

describe('proposal contract kernel', () => {
  beforeEach(() => {
    mocks.withCost = true
    mocks.calls = 0
    mocks.build = (proposalId) => flat({ kind: 'plan_revision', proposalId, plan: basePlan })
  })

  it('accepts a valid plan over the candidate menu', async () => {
    await expect(runProposalSegment(segmentInput)).resolves.toMatchObject({
      kind: 'proposal', proposal: { kind: 'plan_revision', plan: basePlan },
    })
  })

  it('refuses an action outside the menu', async () => {
    mocks.build = (proposalId) => flat({
      kind: 'plan_revision', proposalId,
      plan: { ...basePlan, steps: [{ ...basePlan.steps[0]!, actionId: 'inquiry.submit', input: {} }] },
    })
    await expect(runProposalSegment(segmentInput)).resolves.toMatchObject({
      kind: 'transport_failed', reason: 'proposal_action_not_in_menu',
    })
  })

  it('refuses cyclic dependencies', async () => {
    mocks.build = (proposalId) => flat({
      kind: 'plan_revision', proposalId,
      plan: {
        ...basePlan,
        steps: [
          { ...basePlan.steps[0]!, id: 'a', dependsOn: ['b'] },
          { ...basePlan.steps[0]!, id: 'b', dependsOn: ['a'] },
        ],
      },
    })
    await expect(runProposalSegment(segmentInput)).resolves.toMatchObject({
      kind: 'transport_failed', reason: 'proposal_plan_cyclic',
    })
  })

  it('refuses a non-frontier or completed next action', async () => {
    const activePlan: PlanContract = {
      ...basePlan,
      steps: [
        basePlan.steps[0]!,
        { ...basePlan.steps[0]!, id: 'detail', actionId: 'registry.detail', input: { slug: 'one' }, dependsOn: ['search'] },
      ],
    }
    mocks.build = (proposalId) => flat({ kind: 'next_action', proposalId, stepId: 'detail', rationale: 'Read it.' })

    await expect(runProposalSegment({
      ...segmentInput, activePlan: { contract: activePlan, stepStatuses: { search: 'pending', detail: 'pending' } },
    })).resolves.toMatchObject({ kind: 'transport_failed', reason: 'step_not_frontier' })

    await expect(runProposalSegment({
      ...segmentInput, activePlan: { contract: activePlan, stepStatuses: { search: 'completed', detail: 'completed' } },
    })).resolves.toMatchObject({ kind: 'transport_failed', reason: 'step_not_pending' })
  })

  it('refuses a second in-progress step before transport', async () => {
    await expect(runProposalSegment({
      ...segmentInput,
      activePlan: { contract: basePlan, stepStatuses: { first: 'in_progress', second: 'in_progress' } },
    })).resolves.toEqual({ kind: 'transport_failed', reason: 'multiple_steps_in_progress' })
    expect(mocks.calls).toBe(0)
  })

  it('enforces the segment budget before transport', async () => {
    await expect(runProposalSegment({ ...segmentInput, segmentIndex: 6 })).resolves.toEqual({
      kind: 'budget_exhausted', reason: 'turn_budget_exhausted',
    })
    expect(mocks.calls).toBe(0)
  })
  it('rejects a terminal recommendation without complete evidence or an allowed slug', async () => {
    mocks.build = (proposalId) => flat({
      kind: 'recommendation',
      proposalId,
      summary: 'Here is the result.',
      recommendedSlug: 'not-allowed',
      nextStep: 'Review it.',
    })
    const activePlan = { contract: basePlan, stepStatuses: { search: 'pending' as const } }
    await expect(runProposalSegment({
      ...segmentInput,
      activePlan,
    })).resolves.toMatchObject({ kind: 'transport_failed', reason: 'recommendation_evidence_required' })
    await expect(runProposalSegment({
      ...segmentInput,
      activePlan: { contract: basePlan, stepStatuses: { search: 'completed' as const } },
      evidence: [{ actionId: 'registry.search', resultJson: '{"items":[{"slug":"one"}]}' }],
    })).resolves.toMatchObject({ kind: 'transport_failed', reason: 'recommendation_slug_not_allowed' })
  })

  it('fails closed when provider cost metadata is missing', async () => {
    mocks.withCost = false
    await expect(runProposalSegment(segmentInput)).resolves.toMatchObject({
      kind: 'budget_exhausted', reason: 'provider_cost_unavailable', model: expect.anything(),
    })
  })
})

describe('plan metrics', () => {
  const events: readonly PlanEvent[] = [
    { planId: 'p', seq: 1, kind: 'plan_authored', payloadJson: '{"stepsTotal":2}', at: 100 },
    { planId: 'p', seq: 2, kind: 'step_started', stepId: 'search', payloadJson: '{}', costUsd: 0.01, at: 110 },
    { planId: 'p', seq: 3, kind: 'step_completed', stepId: 'search', payloadJson: '{"actionId":"registry.search","resultKind":"ok"}', at: 120 },
    { planId: 'p', seq: 4, kind: 'step_started', stepId: 'quote', payloadJson: '{}', costUsd: 0.02, at: 125 },
    { planId: 'p', seq: 5, kind: 'step_completed', stepId: 'quote', payloadJson: '{"actionId":"sandbox.checkup_quote","resultKind":"quoted"}', at: 140 },
    { planId: 'p', seq: 6, kind: 'outcome_recorded', payloadJson: '{"recommendationDelivered":true}', at: 150 },
  ]

  it('derives replayable engagement, cost, and wall metrics', () => {
    expect(derivePlanMetrics(events)).toEqual({
      stepsCompleted: 2, stepsTotal: 2, optionsCompared: 1, quotesReceived: 1,
      recommendationDelivered: true, costUsd: 0.03, wallMs: 50, actionsUsed: 2,
    })
  })

  it.each([
    [{ kind: 'quotes_received', minCount: 1 } as const, true],
    [{ kind: 'quotes_received', minCount: 2 } as const, false],
    [{ kind: 'options_compared', minCount: 1 } as const, true],
    [{ kind: 'recommendation_delivered' } as const, true],
  ])('evaluates %o from the same metrics', (predicate, expected) => {
    expect(evaluateGoalPredicate(predicate, derivePlanMetrics(events))).toBe(expected)
  })
})
