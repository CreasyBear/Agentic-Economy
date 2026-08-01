import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const model = vi.hoisted(() => ({
  call: 0,
  build: (_proposalId: string, _call: number): unknown => undefined,
}))

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: () => () => new MockLanguageModelV4({
    doGenerate: async (request) => {
      model.call += 1
      const proposalId = JSON.stringify(request.prompt).match(/[0-9a-f]{8}-[0-9a-f-]{27}/iu)?.[0]
      if (proposalId === undefined) throw new Error('proposal id missing')
      return {
        content: [{ type: 'text', text: JSON.stringify(model.build(proposalId, model.call)) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
        warnings: [],
      }
    },
  }),
}))

import {
  authorDecisionMapSnapshot,
  setDecisionMapStorePortForTests,
  type DecisionMapDraft,
  type DecisionMapSnapshot,
} from '@/modules/decision-map/public'

import type { AnswerEvent } from '@/modules/answer/public'
import { streamAnswerTurn } from '@/modules/answer-thread/public'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import {
  flattenProposalForTransport,
  setEnginePlanStorePortForTests,
  type Proposal,
  type StoredEnginePlanWithEvents,
} from '@/modules/plan-proposal/public'

const flat = (proposal: Proposal): unknown => flattenProposalForTransport(proposal)

const plan = {
  goalText: 'Choose photography for a small wedding',
  goalPredicate: { kind: 'recommendation_delivered' as const },
  steps: [{
    id: 'search',
    title: 'Search current photography listings',
    actionId: 'registry.search',
    input: { query: 'photography for a small wedding' },
    dependsOn: [],
    successCriterion: { kind: 'action_completed' as const },
  }],
  rationale: 'Start with current published photography options.',
}
const decisionMapDraft = {
  version: 'decisionMap_v1',
  goalText: 'Choose the first wedding planning step',
  summary: 'A shallow map of the decisions that matter first.',
  assumptions: [{ id: 'date', label: 'Wedding date', value: 'Next October', source: 'inferred' }],
  nodes: [
    {
      id: 'venue',
      kind: 'area',
      label: 'Venue',
      parentId: null,
      status: 'queued',
      dependsOn: [],
      constraintRefs: [],
    },
    {
      id: 'guest-list',
      kind: 'decision',
      label: 'Guest list',
      parentId: 'venue',
      status: 'ready',
      dependsOn: [],
      constraintRefs: ['date'],
      options: [
        { id: 'small', label: 'Keep it small', summary: 'Prioritise a smaller celebration.' },
        { id: 'full', label: 'Invite all 120', summary: 'Plan around the full guest count.' },
      ],
      recommendedOptionId: 'full',
      reason: 'The guest count is already known.',
      unlocks: [],
      parkTrigger: 'Park until the guest count changes.',
    },
    {
      id: 'venue-style',
      kind: 'decision',
      label: 'Venue style',
      parentId: 'venue',
      status: 'queued',
      dependsOn: ['guest-list'],
      constraintRefs: [],
      options: [
        { id: 'indoor', label: 'Indoor', summary: 'Keep weather out of the plan.' },
        { id: 'outdoor', label: 'Outdoor', summary: 'Use an outdoor setting.' },
      ],
      recommendedOptionId: 'indoor',
      reason: 'The guest count should shape venue capacity first.',
      unlocks: [],
      parkTrigger: 'Park until the guest list is settled.',
    },
    {
      id: 'food',
      kind: 'area',
      label: 'Food',
      parentId: null,
      status: 'fog',
      dependsOn: [],
      constraintRefs: [],
    },
    {
      id: 'music',
      kind: 'area',
      label: 'Music',
      parentId: null,
      status: 'fog',
      dependsOn: [],
      constraintRefs: [],
    },
  ],
} satisfies DecisionMapDraft

const vagueQuery = 'Can you help me?'

const priorFlag = process.env.AE_ENGINE_PROPOSALS

describe('proposal turn path', () => {
  let resetAnswerThread: (() => void) | undefined
  let resetPlanStore: (() => void) | undefined
  let resetDecisionMapStore: (() => void) | undefined
  let stored: StoredEnginePlanWithEvents | null
  let persistedDecisionMap: DecisionMapSnapshot | undefined
  let persistedDecisionMapInput: { projectId?: string; threadId?: string; ownerSessionId?: string; operationKey?: string } | undefined
  let planSeq: number
  let revisions: number
  let persistedModelRequests: number
  let persistedToolCalls: number
  beforeEach(() => {
    process.env.AE_ENGINE_PROPOSALS = 'true'
    model.call = 0
    stored = null
    planSeq = 0
    revisions = 0
    persistedModelRequests = 0
    persistedDecisionMap = undefined
    persistedDecisionMapInput = undefined
    persistedToolCalls = 0

    resetPlanStore = setEnginePlanStorePortForTests({
      read: async () => stored,
      recordRevision: async (envelope) => {
        revisions += 1
        planSeq += 1
        stored = {
          plan: {
            planId: envelope.planId,
            threadId: envelope.threadId,
            revision: envelope.revision,
            contractJson: JSON.stringify(envelope.contract),
            planDigest: envelope.planDigest,
            status: 'active',
            stepStatusesJson: JSON.stringify({ search: 'pending' }),
            createdAt: envelope.bounds.expiresAt - 15 * 60 * 1_000,
            expiresAt: envelope.bounds.expiresAt,
          },
          events: [{
            planId: envelope.planId,
            seq: planSeq,
            kind: 'plan_authored',
            payloadJson: JSON.stringify({ stepsTotal: 1 }),
            at: Date.now(),
          }],
        }
        return { planId: envelope.planId, revision: envelope.revision, seq: planSeq }

      },
      recordEvent: async (input) => ({ planId: input.planId, seq: ++planSeq }),
    })
    resetDecisionMapStore = setDecisionMapStorePortForTests({
      readDecisionMapByThread: async () => persistedDecisionMap ?? null,
      persistDecisionMapDraft: async (input) => {
        persistedDecisionMapInput = {
          projectId: input.projectId,
          threadId: input.threadId,
          ownerSessionId: input.ownerSessionId,
          ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
        }
        persistedDecisionMap = authorDecisionMapSnapshot(input)
        return persistedDecisionMap
      },
      recordDecisionMapChoice: async () => {
        throw new Error('choice is not used by the proposal path')
      },
      recordDecisionMapConstraintChange: async () => {
        throw new Error('constraint changes are not used by the proposal path')
      },
    })
    resetAnswerThread = setAnswerThreadPortForTests({
      createThread: async (args) => ({ threadId: args.threadId }),
      appendTurn: async (args) => {
        persistedModelRequests = modelRequestCount(args.evidenceJson)
        return { turnId: args.turnId }
      },
      appendTurnWithToolCalls: async (args) => {
        persistedModelRequests = modelRequestCount(args.evidenceJson)
        persistedToolCalls = args.toolCalls.length
        return { turnId: args.turnId, insertedToolCalls: args.toolCalls.length }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ turns: [] }),
    })
  })

  afterEach(() => {
    resetAnswerThread?.()
    resetPlanStore?.()
    if (priorFlag === undefined) delete process.env.AE_ENGINE_PROPOSALS
    else process.env.AE_ENGINE_PROPOSALS = priorFlag
    resetDecisionMapStore?.()
  })

  it('authors a durable plan, asks one question, and resumes the same revision', async () => {
    model.build = (proposalId, call) => flat(call === 1
      ? { kind: 'plan_revision', proposalId, plan }
      : call === 2
        ? {
            kind: 'clarifying_question', proposalId,
            question: 'Do you prefer a general dentist or a specific treatment?',
            blockedOn: 'The preferred type of dental care is not specified.',
          }
        : call === 3
          ? { kind: 'next_action', proposalId, stepId: 'search', rationale: 'Check current listings.' }
          : {
              kind: 'recommendation', proposalId,
              summary: 'Continue with the current plan once that preference is known.',
              nextStep: 'Reply with the type of dental care.',
            })

    const firstEvents = await runTurn('Help me choose photography for a small wedding')
    expect(firstEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'plan-contract', revision: 1 }),
      expect.objectContaining({ type: 'clarifying-question' }),
      expect.objectContaining({ type: 'complete' }),
    ]))
    expect(revisions).toBe(1)
    expect(model.call).toBe(2)

    const secondEvents = await runTurn('Help me choose photography for a small wedding')
    expect(secondEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'recommendation' }),
      expect.objectContaining({ type: 'complete' }),
    ]))
    expect(revisions).toBe(1)
    expect(persistedModelRequests).toBe(2)
    expect(model.call).toBe(4)
  })
  it('persists and emits one decision map without executing registered actions', async () => {
    model.build = (proposalId) => flat({
      kind: 'decision_map_revision',
      proposalId,
      decisionMap: decisionMapDraft,
    })

    const events = await runTurn('We’re getting married next October — 120 people, no idea where to start')
    const mapEvents = events.filter((event) => event.type === 'decision-map')
    const complete = events.find((event) => event.type === 'complete')

    expect(mapEvents).toHaveLength(1)
    expect(mapEvents[0]).toMatchObject({
      type: 'decision-map',
      snapshot: { projectId: 'thread-plan', threadId: 'thread-plan' },
    })
    expect(complete).toMatchObject({ type: 'complete', answer: { providers: [], decisionMapRevision: 1 } })
    expect((complete?.type === 'complete' ? complete.answer.importedClaims : undefined)).toBeUndefined()
    expect(events.some((event) => event.type === 'plan-contract')).toBe(false)
    expect(revisions).toBe(0)
    expect(persistedDecisionMapInput).toEqual({
      projectId: 'thread-plan',
      threadId: 'thread-plan',
      ownerSessionId: 'session-plan',
      operationKey: expect.stringContaining('decision_map:thread-plan:'),
    })
    expect(persistedToolCalls).toBe(0)
    expect(model.call).toBe(1)
  })

  it('keeps a clear service-and-location ask on the deterministic path', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    model.build = () => {
      throw new Error('clear asks must not call the proposal model')
    }
    try {
      const events = await runTurn('My tooth hurts and I need a dentist near Adelaide this week')
      expect(model.call).toBe(0)
      expect(persistedModelRequests).toBe(0)
      expect(events.some((event) => event.type === 'plan-contract')).toBe(false)
      expect(events.some((event) => event.type === 'complete')).toBe(true)
    } finally {
      if (previousLocalRegistry === undefined) delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      else process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
    }
  })
  it('keeps a vague ask on the clarification path without a proposal plan', async () => {
    model.build = () => {
      throw new Error('vague asks must not call the proposal model')
    }
    const events = await runTurn(vagueQuery)
    expect(model.call).toBe(0)
    expect(events.some((event) => event.type === 'plan-contract')).toBe(false)
    expect(events.some((event) => event.type === 'one-line' && event.oneLine === 'What do you need help with?')).toBe(true)
    expect(events.some((event) => event.type === 'complete')).toBe(true)
  })
})

function modelRequestCount(evidenceJson: string): number {
  const evidence = JSON.parse(evidenceJson) as {
    harnessRun?: { privateTelemetry?: { modelRequests?: unknown[] } }
  }
  return evidence.harnessRun?.privateTelemetry?.modelRequests?.length ?? 0
}

async function runTurn(query = 'I need my home office set up for video calls next month'): Promise<AnswerEvent[]> {
  const events: AnswerEvent[] = []
  await streamAnswerTurn({
    sessionId: 'session-plan',
    threadId: 'thread-plan',
    query,
    precheckedAccess: { kind: 'allowed', turnCount: 0 },
    preloadedPriorTurns: [],
  }, ({ event }) => events.push(event))
  return events
}
