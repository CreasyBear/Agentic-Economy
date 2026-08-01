import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { z } from 'zod'

import { listActions } from '../../../src/modules/actions'
import { streamAnswerTurn } from '../../../src/modules/answer-thread/public'
import { setAnswerThreadPortForTests } from '../../../src/modules/answer-thread/testing'
import type { AnswerEvent } from '../../../src/modules/answer/public'
import {
  buildCandidateMenu,
  derivePlanMetrics,
  evaluateGoalPredicate,
  flattenProposalForTransport,
  MAX_ACTIONS_PER_TURN,
  TURN_COST_CEILING_USD,
  type PlanContract,
  type PlanEvent,
  type PlanFailureReason,
  type PlanMetrics,
  type Proposal,
  type StoredEnginePlanWithEvents,
  setEnginePlanStorePortForTests,
  validateProposalAgainstKernel,
} from '../../../src/modules/plan-proposal/public'
import type { HarnessModelRequestRecord } from '../../../src/modules/harness/public'

import rawCases from '../cases.json'

const actionSchema = z.object({
  stepId: z.string(),
  actionId: z.enum(['registry.search', 'registry.detail', 'sandbox.checkup_quote']),
  resultKind: z.string(),
  dependsOn: z.array(z.string()).optional(),
  costUsd: z.number().nonnegative(),
})
const goalPredicateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quotes_received'), minCount: z.number().int().positive() }),
  z.object({ kind: z.literal('options_compared'), minCount: z.number().int().positive() }),
  z.object({ kind: z.literal('recommendation_delivered') }),
])
const caseSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('clear'), ask: z.string(), expectedModelCalls: z.literal(0) }),
  z.object({
    id: z.string(), kind: z.literal('plan'), ask: z.string(),
    goalPredicate: goalPredicateSchema, actions: z.array(actionSchema).min(1).max(MAX_ACTIONS_PER_TURN),
    recommendationDelivered: z.boolean(),
  }),
  z.object({ id: z.string(), kind: z.literal('vague'), ask: z.string(), expectedClarification: z.literal(true) }),
  z.object({ id: z.string(), kind: z.literal('no_supply'), ask: z.string(), expectedFailureReason: z.literal('no_supply') }),
  z.object({
    id: z.string(), kind: z.literal('adversarial'), ask: z.string(),
    attack: z.enum(['unregistered_action', 'cyclic_plan', 'replayed_nonce']), expectedRefusal: z.string(),
  }),
])

type EngineEvalCase = z.infer<typeof caseSchema>
type Role = 'intent' | 'proposal' | 'prose'
type RoleLatency = Readonly<Record<Role, number>>

type RuntimeRun = Readonly<{
  events: readonly AnswerEvent[]
  modelRequests: readonly HarnessModelRequestRecord[]
  stored: StoredEnginePlanWithEvents | null
}>

export type EngineEvalEvidence =
  | 'runtime_turn_path_sandbox_supply'
  | 'persisted_engine_plan_events'
  | 'kernel_adversarial_validation'

export type EngineEvalCaseReport = Readonly<{
  id: string
  kind: EngineEvalCase['kind']
  status: 'completed' | 'clarification' | 'failed' | 'refused'
  ok: boolean
  problems: readonly string[]
  evidence: EngineEvalEvidence
  planId?: string
  revisionCount: number
  modelCalls: number
  costUsd: number
  wallMs: number
  roleLatencyMs: RoleLatency
  goalSuccess?: boolean
  failureReason?: PlanFailureReason
  refusalReason?: string
  metrics?: PlanMetrics
}>

export type EngineEvalSuiteReport = Readonly<{
  schemaVersion: 'engine-eval-suite-report:v1'
  ok: boolean
  summary: Readonly<{
    caseCount: number
    failedCaseCount: number
    clearCaseCount: number
    planCaseCount: number
    modelCallCount: number
    planSuccessRate: number
    p95WallMs: number
    maxWallMs: number
    p95RoleLatencyMs: RoleLatency
  }>
  cases: readonly EngineEvalCaseReport[]
}>

type RuntimePorts = Readonly<{
  plans: Map<string, StoredEnginePlanWithEvents>
  modelRequests: Map<string, readonly HarnessModelRequestRecord[]>
  answerPortReset: () => void
  planPortReset: () => void
}>

/**
 * Runs the twenty cases through streamAnswerTurn, the registry action runner,
 * the proposal kernel, and an in-memory journal with the same row/event shape
 * as Convex. Supply is the labelled local E2E registry fixture; model calls go
 * to a local OpenRouter-compatible responder so the production transport seam
 * remains exercised without a network dependency.
 */
export async function runEngineEvalSuite(): Promise<EngineEvalSuiteReport> {
  const cases = z.array(caseSchema).length(20).parse(rawCases)
  const counts = {
    clear: cases.filter(({ kind }) => kind === 'clear').length,
    plan: cases.filter(({ kind }) => kind === 'plan').length,
    vague: cases.filter(({ kind }) => kind === 'vague').length,
    noSupply: cases.filter(({ kind }) => kind === 'no_supply').length,
    adversarial: cases.filter(({ kind }) => kind === 'adversarial').length,
  }
  if (counts.clear !== 6 || counts.plan !== 6 || counts.vague !== 3 || counts.noSupply !== 2 || counts.adversarial !== 3) {
    throw new Error(`engine eval case mix changed: ${JSON.stringify(counts)}`)
  }

  const previousFixtureFlag = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  const previousEngineFlag = process.env.AE_ENGINE_PROPOSALS
  const previousBaseUrl = process.env.AE_OPENROUTER_API_BASE_URL
  const previousApiKey = process.env.OPENROUTER_API_KEY
  process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
  process.env.AE_ENGINE_PROPOSALS = 'true'
  const server = await startMockProposalServer()
  const ports = createRuntimePorts()
  try {
    const reports: EngineEvalCaseReport[] = []
    for (const testCase of cases) reports.push(await runCase(testCase, ports))
    const wallValues = reports.map(({ wallMs }) => wallMs).sort((left, right) => left - right)
    const planReports = reports.filter(({ kind }) => kind === 'plan')
    const successfulPlans = planReports.filter(({ goalSuccess }) => goalSuccess).length
    const roleLatencyValues = {
      intent: reports.map(({ roleLatencyMs }) => roleLatencyMs.intent),
      proposal: reports.map(({ roleLatencyMs }) => roleLatencyMs.proposal).filter((value) => value > 0),
      prose: reports.map(({ roleLatencyMs }) => roleLatencyMs.prose),
    }
    return {
      schemaVersion: 'engine-eval-suite-report:v1',
      ok: reports.every(({ ok }) => ok),
      summary: {
        caseCount: reports.length,
        failedCaseCount: reports.filter(({ ok }) => !ok).length,
        clearCaseCount: counts.clear,
        planCaseCount: counts.plan,
        modelCallCount: reports.reduce((total, report) => total + report.modelCalls, 0),
        planSuccessRate: planReports.length === 0 ? 0 : successfulPlans / planReports.length,
        p95WallMs: percentile(wallValues, 95),
        maxWallMs: wallValues.at(-1) ?? 0,
        p95RoleLatencyMs: {
          intent: percentile(roleLatencyValues.intent, 95),
          proposal: percentile(roleLatencyValues.proposal, 95),
          prose: percentile(roleLatencyValues.prose, 95),
        },
      },
      cases: reports,
    }
  } finally {
    ports.answerPortReset()
    ports.planPortReset()
    await stopMockProposalServer(server)
    restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousFixtureFlag)
    restoreEnv('AE_ENGINE_PROPOSALS', previousEngineFlag)
    restoreEnv('AE_OPENROUTER_API_BASE_URL', previousBaseUrl)
    restoreEnv('OPENROUTER_API_KEY', previousApiKey)
  }
}

async function runCase(testCase: EngineEvalCase, ports: RuntimePorts): Promise<EngineEvalCaseReport> {
  const startedAt = performance.now()
  let result: EngineEvalCaseReport
  switch (testCase.kind) {
    case 'clear':
      result = await runClearCase(testCase, ports)
      break
    case 'vague':
      result = await runVagueCase(testCase, ports)
      break
    case 'no_supply':
      result = await runNoSupplyCase(testCase, ports)
      break
    case 'adversarial':
      result = runAdversarialCase(testCase)
      break
    case 'plan':
      result = await runPlanCase(testCase, ports)
      break
  }
  return { ...result, wallMs: round2(performance.now() - startedAt) }
}

async function runClearCase(
  testCase: Extract<EngineEvalCase, { kind: 'clear' }>,
  ports: RuntimePorts,
): Promise<EngineEvalCaseReport> {
  const run = await runRuntimeTurn(testCase.id, testCase.ask, ports)
  const problems: string[] = []
  if (run.modelRequests.length !== testCase.expectedModelCalls) problems.push('unexpected_model_transport_call')
  if (!run.events.some((event) => event.type === 'complete')) problems.push('turn_not_completed')
  if (run.events.some((event) => event.type === 'plan-contract')) problems.push('clear_ask_entered_plan_path')
  return report(testCase, problems, run, 'runtime_turn_path_sandbox_supply', { status: 'completed' })
}

async function runVagueCase(
  testCase: Extract<EngineEvalCase, { kind: 'vague' }>,
  ports: RuntimePorts,
): Promise<EngineEvalCaseReport> {
  const run = await runRuntimeTurn(testCase.id, testCase.ask, ports)
  const completeAnswers = run.events.filter((event): event is Extract<AnswerEvent, { type: 'complete' }> => event.type === 'complete')
  const questionCount = completeAnswers.filter(({ answer }) => answer.oneLine.trim().endsWith('?')).length
  const problems: string[] = []
  if (run.modelRequests.length !== 0) problems.push('vague_ask_used_model_transport')
  if (questionCount !== 1) problems.push(`clarification_count:${questionCount}`)
  return report(testCase, problems, run, 'runtime_turn_path_sandbox_supply', { status: 'clarification' })
}

async function runNoSupplyCase(
  testCase: Extract<EngineEvalCase, { kind: 'no_supply' }>,
  ports: RuntimePorts,
): Promise<EngineEvalCaseReport> {
  const run = await runRuntimeTurn(testCase.id, testCase.ask, ports)
  const outcome = readOutcome(run.stored)
  const problems: string[] = []
  if (outcome?.failureReason !== testCase.expectedFailureReason) problems.push('typed_no_supply_not_persisted')
  if (!run.events.some((event) => event.type === 'complete')) problems.push('turn_not_completed')
  return report(testCase, problems, run, 'persisted_engine_plan_events', {
    status: 'failed',
    ...(outcome?.failureReason === undefined ? {} : { failureReason: outcome.failureReason }),
    ...(run.stored === null ? {} : { planId: run.stored.plan.planId }),
    revisionCount: countRevisions(run.stored),
    ...(outcome?.metrics === undefined ? {} : { metrics: outcome.metrics }),
    ...(outcome?.success === undefined ? {} : { goalSuccess: outcome.success }),
  })
}

async function runPlanCase(
  testCase: Extract<EngineEvalCase, { kind: 'plan' }>,
  ports: RuntimePorts,
): Promise<EngineEvalCaseReport> {
  const run = await runRuntimeTurn(testCase.id, testCase.ask, ports)
  const stored = run.stored
  const outcome = readOutcome(stored)
  const events = stored?.events ?? []
  const metrics = derivePlanMetrics(events)
  const problems: string[] = []
  if (stored === null) problems.push('plan_not_persisted')
  if (run.modelRequests.length === 0) problems.push('plan_used_no_model_transport')
  if (countRevisions(stored) !== 1) problems.push('unexpected_revision_count')
  if (outcome === undefined) problems.push('plan_outcome_not_persisted')
  if (outcome !== undefined && outcome.success !== evaluateGoalPredicate(testCase.goalPredicate, metrics)) {
    problems.push('outcome_does_not_match_replayed_events')
  }
  if (!run.events.some((event) => event.type === 'complete')) problems.push('turn_not_completed')
  if (metrics.actionsUsed > MAX_ACTIONS_PER_TURN) problems.push('action_budget_exceeded')
  if (metrics.costUsd > TURN_COST_CEILING_USD) problems.push('cost_budget_exceeded')
  if (!eventsFollowProtocol(events, stored?.plan.contractJson)) problems.push('event_protocol_invalid')
  if (testCase.recommendationDelivered !== metrics.recommendationDelivered) problems.push('recommendation_delivery_mismatch')
  return report(testCase, problems, run, 'persisted_engine_plan_events', {
    status: outcome?.success === true ? 'completed' : 'failed',
    ...(stored === null ? {} : { planId: stored.plan.planId }),
    revisionCount: countRevisions(stored),
    metrics,
    ...(outcome?.success === undefined ? {} : { goalSuccess: outcome.success }),
    ...(outcome?.failureReason === undefined ? {} : { failureReason: outcome.failureReason }),
  })
}

function runAdversarialCase(testCase: Extract<EngineEvalCase, { kind: 'adversarial' }>): EngineEvalCaseReport {
  const refusalReason = validateHostileCase(testCase)
  const problems = refusalReason === testCase.expectedRefusal
    ? []
    : [`unexpected_refusal:${refusalReason ?? 'none'}`]
  return report(testCase, problems, undefined, 'kernel_adversarial_validation', {
    status: 'refused',
    modelCalls: 1,
    ...(refusalReason === undefined ? {} : { refusalReason }),
  })
}

function validateHostileCase(testCase: Extract<EngineEvalCase, { kind: 'adversarial' }>): string | undefined {
  const expectedProposalId = `eval-${testCase.id}`
  const baseStep = {
    id: 'search', title: 'Search current listings', actionId: 'registry.search', input: { query: 'dentist' },
    dependsOn: [], successCriterion: { kind: 'nonempty_results' as const },
  }
  const basePlan: PlanContract = {
    goalText: 'Find one current option', goalPredicate: { kind: 'options_compared', minCount: 1 },
    steps: [baseStep], rationale: 'Use current registry evidence.',
  }
  let proposal: Proposal
  if (testCase.attack === 'unregistered_action') {
    proposal = {
      kind: 'plan_revision', proposalId: expectedProposalId,
      plan: { ...basePlan, steps: [{ ...baseStep, actionId: 'inquiry.submit', input: {} }] },
    }
  } else if (testCase.attack === 'cyclic_plan') {
    proposal = {
      kind: 'plan_revision', proposalId: expectedProposalId,
      plan: {
        ...basePlan,
        steps: [
          { ...baseStep, id: 'a', dependsOn: ['b'] },
          { ...baseStep, id: 'b', dependsOn: ['a'] },
        ],
      },
    }
  } else {
    proposal = { kind: 'plan_revision', proposalId: 'stale-proposal', plan: basePlan }
  }
  return validateProposalAgainstKernel(
    proposal,
    expectedProposalId,
    buildCandidateMenu('discover', listActions()),
    undefined,
  )
}

async function runRuntimeTurn(id: string, query: string, ports: RuntimePorts): Promise<RuntimeRun> {
  const events: AnswerEvent[] = []
  await streamAnswerTurn({
    sessionId: `engine-eval:${id}`,
    threadId: `engine-eval:${id}`,
    query,
    precheckedAccess: { kind: 'allowed', turnCount: 0 },
    preloadedPriorTurns: [],
  }, ({ event }) => events.push(event))
  return {
    events,
    modelRequests: ports.modelRequests.get(id) ?? [],
    stored: ports.plans.get(`engine-eval:${id}`) ?? null,
  }
}

function createRuntimePorts(): RuntimePorts {
  const plans = new Map<string, StoredEnginePlanWithEvents>()
  const modelRequests = new Map<string, readonly HarnessModelRequestRecord[]>()
  const planPortReset = setEnginePlanStorePortForTests({
    read: async (threadId) => plans.get(threadId) ?? null,
    recordRevision: async (envelope) => {
      const previous = plans.get(envelope.threadId)
      if (previous !== undefined) {
        plans.set(previous.plan.threadId, {
          plan: { ...previous.plan, status: 'superseded' },
          events: previous.events,
        })
      }
      const plan: StoredEnginePlanWithEvents = {
        plan: {
          planId: envelope.planId,
          threadId: envelope.threadId,
          revision: envelope.revision,
          ...(envelope.revisionOf === undefined ? {} : { revisionOf: envelope.revisionOf }),
          contractJson: JSON.stringify(envelope.contract),
          planDigest: envelope.planDigest,
          status: 'active',
          stepStatusesJson: JSON.stringify(Object.fromEntries(envelope.contract.steps.map(({ id }) => [id, 'pending']))),
          createdAt: envelope.bounds.expiresAt - 15 * 60_000,
          expiresAt: envelope.bounds.expiresAt,
        },
        events: [{
          planId: envelope.planId,
          seq: 1,
          kind: envelope.revision === 1 ? 'plan_authored' : 'plan_revised',
          payloadJson: JSON.stringify({ revision: envelope.revision, stepsTotal: envelope.contract.steps.length }),
          at: envelope.bounds.expiresAt - 15 * 60_000,
        }],
      }
      plans.set(envelope.threadId, plan)
      return { planId: envelope.planId, revision: envelope.revision, seq: 1 }
    },
    recordEvent: async (input) => {
      const entry = [...plans.values()].find(({ plan }) => plan.planId === input.planId)
      if (entry === undefined) throw new Error('eval_plan_not_found')
      const seq = (entry.events.at(-1)?.seq ?? 0) + 1
      const statuses = JSON.parse(entry.plan.stepStatusesJson) as Record<string, string>
      if (input.kind === 'step_started' && input.stepId !== undefined) statuses[input.stepId] = 'in_progress'
      if ((input.kind === 'step_completed' || input.kind === 'step_failed') && input.stepId !== undefined) {
        statuses[input.stepId] = input.kind === 'step_completed' ? 'completed' : 'failed'
      }
      const outcome = input.outcomeJson === undefined ? undefined : JSON.parse(input.outcomeJson) as { success: boolean; failureReason?: string }
      const updated: StoredEnginePlanWithEvents = {
        plan: {
          ...entry.plan,
          stepStatusesJson: JSON.stringify(statuses),
          ...(outcome === undefined ? {} : {
            outcomeJson: input.outcomeJson,
            status: outcome.success ? 'completed' : outcome.failureReason === 'expired' ? 'expired' : 'failed',
          }),
        },
        events: [...entry.events, {
          planId: input.planId,
          seq,
          kind: input.kind,
          ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
          ...(input.toolCallId === undefined ? {} : { toolCallId: input.toolCallId }),
          payloadJson: input.payloadJson,
          ...(input.costUsd === undefined ? {} : { costUsd: input.costUsd }),
          at: input.at,
        }],
      }
      plans.set(entry.plan.threadId, updated)
      return { planId: input.planId, seq }
    },
  })
  const answerPortReset = setAnswerThreadPortForTests({
    createThread: async (args) => ({ threadId: args.threadId }),
    appendTurn: async (args) => {
      modelRequests.set(args.threadId.replace('engine-eval:', ''), readModelRequests(args.evidenceJson))
      return { turnId: args.turnId }
    },
    appendTurnWithToolCalls: async (args) => {
      modelRequests.set(args.threadId.replace('engine-eval:', ''), readModelRequests(args.evidenceJson))
      return { turnId: args.turnId, insertedToolCalls: args.toolCalls.length }
    },
    appendTurnWithThreadAndToolCalls: async (args) => {
      modelRequests.set(args.threadId.replace('engine-eval:', ''), readModelRequests(args.evidenceJson))
      return { turnId: args.turnId, insertedToolCalls: args.toolCalls.length }
    },
    listSessionThreads: async () => ({ threads: [] }),
    getPublicThreadProjection: async () => null,
    getThreadTurns: async () => ({ turns: [] }),
  })
  return { plans, modelRequests, answerPortReset, planPortReset }
}

function readModelRequests(evidenceJson: string): readonly HarnessModelRequestRecord[] {
  try {
    const evidence = JSON.parse(evidenceJson) as { harnessRun?: { privateTelemetry?: { modelRequests?: HarnessModelRequestRecord[] } } }
    return evidence.harnessRun?.privateTelemetry?.modelRequests ?? []
  } catch {
    return []
  }
}

function report(
  testCase: EngineEvalCase,
  problems: readonly string[],
  run: RuntimeRun | undefined,
  evidence: EngineEvalEvidence,
  extras: Partial<Omit<EngineEvalCaseReport, 'id' | 'kind' | 'ok' | 'problems' | 'evidence' | 'wallMs'>> = {},
): EngineEvalCaseReport {
  const requests = run?.modelRequests ?? []
  const roleLatencyMs: RoleLatency = {
    intent: 0,
    proposal: percentile(requests.map(({ durationMs }) => durationMs), 95),
    prose: 0,
  }
  return {
    id: testCase.id,
    kind: testCase.kind,
    status: extras.status ?? 'failed',
    ok: problems.length === 0,
    problems,
    evidence,
    revisionCount: extras.revisionCount ?? 0,
    modelCalls: extras.modelCalls ?? requests.length,
    costUsd: extras.costUsd ?? requests.reduce((total, request) => total + (request.costUsd ?? 0), 0),
    wallMs: 0,
    roleLatencyMs,
    ...(extras.planId === undefined ? {} : { planId: extras.planId }),
    ...(extras.goalSuccess === undefined ? {} : { goalSuccess: extras.goalSuccess }),
    ...(extras.failureReason === undefined ? {} : { failureReason: extras.failureReason }),
    ...(extras.refusalReason === undefined ? {} : { refusalReason: extras.refusalReason }),
    ...(extras.metrics === undefined ? {} : { metrics: extras.metrics }),
  }
}

function readOutcome(stored: StoredEnginePlanWithEvents | null): { success: boolean; failureReason?: PlanFailureReason; metrics: PlanMetrics } | undefined {
  if (stored?.plan.outcomeJson === undefined) return undefined
  try {
    return JSON.parse(stored.plan.outcomeJson) as { success: boolean; failureReason?: PlanFailureReason; metrics: PlanMetrics }
  } catch {
    return undefined
  }
}

function countRevisions(stored: StoredEnginePlanWithEvents | null): number {
  return stored?.events.filter(({ kind }) => kind === 'plan_authored' || kind === 'plan_revised').length ?? 0
}

function eventsFollowProtocol(events: readonly PlanEvent[], contractJson: string | undefined): boolean {
  if (events.length === 0 || contractJson === undefined) return false
  let contract: PlanContract
  try {
    contract = JSON.parse(contractJson) as PlanContract
  } catch {
    return false
  }
  if (events.some((event, index) => event.seq !== index + 1)) return false
  const status = Object.fromEntries(contract.steps.map(({ id }) => [id, 'pending'])) as Record<string, string>
  for (const event of events) {
    if (event.kind === 'step_started' && event.stepId !== undefined) {
      if (status[event.stepId] !== 'pending') return false
      const step = contract.steps.find(({ id }) => id === event.stepId)
      if (step === undefined || step.dependsOn.some((id) => status[id] !== 'completed')) return false
      if (Object.values(status).includes('in_progress')) return false
      status[event.stepId] = 'in_progress'
    }
    if ((event.kind === 'step_completed' || event.kind === 'step_failed') && event.stepId !== undefined) {
      if (status[event.stepId] !== 'in_progress') return false
      status[event.stepId] = event.kind === 'step_completed' ? 'completed' : 'failed'
    }
  }
  return true
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0
  return round2(values[Math.ceil((percentileValue / 100) * values.length) - 1] ?? 0)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

let mockServer: Server | undefined

async function startMockProposalServer(): Promise<Server> {
  const server = createServer((request, response) => {
    void handleProposalRequest(request, response)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('eval_mock_server_address_missing')
  process.env.AE_OPENROUTER_API_BASE_URL = `http://127.0.0.1:${address.port}`
  process.env.OPENROUTER_API_KEY = 'engine-eval-local'
  mockServer = server
  return server
}

async function stopMockProposalServer(server: Server): Promise<void> {
  if (mockServer === server) mockServer = undefined
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function handleProposalRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  const prompt = findPromptPayload(body)
  if (prompt === undefined) {
    response.statusCode = 400
    response.end(JSON.stringify({ error: { message: 'missing eval prompt' } }))
    return
  }
  await new Promise((resolve) => setTimeout(resolve, 2))
  const object = flattenProposalForTransport(proposalForPrompt(prompt))
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({
    id: 'engine-eval-response',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1_000),
    model: 'engine-eval/mock',
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(object) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 24, completion_tokens: 24, total_tokens: 48, cost: 0.001 },
  }))
}

function findPromptPayload(body: unknown): {
  proposalId: string
  query: string
  activePlan: { contract: PlanContract; stepStatuses: Record<string, string> } | null
  evidence: readonly { resultJson: string }[]
} | undefined {
  const strings: string[] = []
  collectStrings(body, strings)
  for (const value of strings) {
    if (!value.includes('"proposalId"') || !value.includes('"candidateMenu"')) continue
    try {
      const parsed = JSON.parse(value) as {
        proposalId?: unknown
        query?: unknown
        activePlan?: { contract: PlanContract; stepStatuses: Record<string, string> } | null
        evidence?: readonly { resultJson: string }[]
      }
      if (typeof parsed.proposalId === 'string' && typeof parsed.query === 'string') {
        return {
          proposalId: parsed.proposalId,
          query: parsed.query,
          activePlan: parsed.activePlan ?? null,
          evidence: parsed.evidence ?? [],
        }
      }
    } catch {
      // The provider may wrap the prompt in a larger JSON string.
    }
  }
  return undefined
}

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    output.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output)
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) collectStrings(item, output)
  }
}

function proposalForPrompt(prompt: {
  proposalId: string
  query: string
  activePlan: { contract: PlanContract; stepStatuses: Record<string, string> } | null
  evidence: readonly { resultJson: string }[]
}): Proposal {
  if (prompt.activePlan === null) {
    const noSupply = /fortepiano|glassblower|coober\s+pedy|broome/i.test(prompt.query)
    const compare = /catering|garden/i.test(prompt.query)
    const steps: PlanContract['steps'] = [{
      id: 'search',
      title: 'Search labelled sandbox options',
      actionId: 'registry.search',
      input: { query: noSupply ? prompt.query : 'dentist', limit: 3 },
      dependsOn: [],
      successCriterion: { kind: 'nonempty_results' },
    }, ...(compare ? [{
      id: 'detail',
      title: 'Inspect a labelled sandbox option',
      actionId: 'registry.detail',
      input: { slug: 'adelaide-dental-clinic' },
      dependsOn: ['search'],
      successCriterion: { kind: 'action_completed' as const },
    }] : [])]
    return {
      kind: 'plan_revision',
      proposalId: prompt.proposalId,
      plan: {
        goalText: prompt.query,
        goalPredicate: compare ? { kind: 'options_compared', minCount: 2 } : { kind: 'recommendation_delivered' },
        steps,
        rationale: 'Use only labelled, read-only sandbox supply.',
      },
    }
  }

  const failed = prompt.activePlan.contract.steps.find(({ id }) => prompt.activePlan?.stepStatuses[id] === 'failed')
  if (failed !== undefined) {
    return { kind: 'next_action', proposalId: prompt.proposalId, stepId: failed.id, rationale: 'Re-check the failed frontier step.' }
  }
  const next = prompt.activePlan.contract.steps.find(({ id, dependsOn }) =>
    prompt.activePlan?.stepStatuses[id] === 'pending'
    && dependsOn.every((dependency) => prompt.activePlan?.stepStatuses[dependency] === 'completed'))
  if (next !== undefined) {
    return { kind: 'next_action', proposalId: prompt.proposalId, stepId: next.id, rationale: 'Run the next frontier step.' }
  }
  return {
    kind: 'recommendation',
    proposalId: prompt.proposalId,
    summary: 'The labelled sandbox evidence supports a bounded recommendation.',
    nextStep: 'Review the evidence before taking any real-world action.',
  }
}
