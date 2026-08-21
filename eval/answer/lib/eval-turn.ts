import { runAnswerToolUseAgent } from '../../../src/modules/answer/server'
import {
  finalizeReservedAnswerTurnFromSource,
  setAnswerHarnessFinalizerForTests,
  setAnswerThreadPortForTests,
} from '../../../src/modules/answer-thread/testing'
import type { AnswerWorkStep } from '@/modules/answer/public'

import { handleAnswerTurnRequest } from '../../../src/routes/api.answer.turn'
import {
  createAnswerThreadTestStore,
  type AnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../../../tests/helpers/answer-thread-test-port'
import { readAnswerTurnStream } from '../../../tests/helpers/answer-turn-stream'
import type { AnswerTurnEvalCase } from './cases'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../../tests/helpers/openrouter-contract-server'
import {
  emptyAnswerEvalCapabilityMetrics,
  emptyAnswerEvalHarnessMetrics,
  evaluateCapabilityEvidenceExpectation,
  performanceMetrics,
  readAnswerEvalHarnessMetrics,
  readCapabilityEvalMetrics,
  type AnswerEvalCapabilityMetrics,
  type AnswerEvalPerformancePath,
  type AnswerEvalUsage,
} from './eval-capability-metrics'
import {
  evaluateAnswerTurnExpectations,
  parseEvidence,
  readArtifactKinds,
  readHarnessRunFromJournal,
  readToolQueries,
  readWorkSteps,
  sumTimingMs,
  type EvalHarnessRun,
} from './eval-expectations'
import {
  EMPTY_KEYLESS_EXECUTABLE_SOURCE,
  installEvalRegistrySeed,
  installSeedOnlyOperationSource,
  keyedPublicOperation,
  seedOnlyPublicOperation,
  streamWithSeedOnlyKeylessSource,
  usesKeyedExecuteSource,
  usesSeedOnlyCapabilitySource,
} from './eval-seed'

export type AnswerTurnEvalResult = {
  ok: boolean
  caseId: string
  status: 'complete' | 'error' | 'missing'
  slugs: string[]
  toolQueries: string[]
  timingNames: string[]
  artifactKinds: string[]
  workStepIds: string[]
  workSteps: AnswerWorkStep[]
  totalTimingMs: number
  performancePath: AnswerEvalPerformancePath
  requestToFirstProgressMs: number
  requestToCompletionMs: number
  modelRequestCount: number
  modelToolRunCount: number
  toolRunCount: number
  usage: AnswerEvalUsage
  estimatedUsd?: number
  costUnavailableReasons: readonly string[]
  capabilityMetrics: AnswerEvalCapabilityMetrics
  hasHarnessRun: boolean
  harnessStatus?: string
  harnessToolsInvoked: readonly string[]
  harnessPhases: readonly string[]
  problems: string[]
  diagnostics: {
    oneLine?: string
    summary?: string
    nextStep?: string
    agentJsonUrl?: string
    errorCode?: string
  }
}

type ToolUseVars = {
  query: string
  plannedTool: string
  plannedInput: string
  proseOneLine: string
  proseSummary: string
  proseNextStep: string
  expectedSlug: string
  expectPass: string
  expectedModelProvider?: string
  expectedModel?: string
}

export async function runAnswerTurnEvalCase(testCase: AnswerTurnEvalCase): Promise<AnswerTurnEvalResult> {
  const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  const previousEvalSeed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
  const previousConvexUrl = process.env.CONVEX_URL
  const previousViteConvexUrl = process.env.VITE_CONVEX_URL
  const store = createAnswerThreadTestStore()
  const resetThreadPort = installAnswerThreadTestPort(store)
  const resetRegistryPort = installEvalRegistrySeed(testCase.registrySeed)
  const previousApiKey = process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_API_KEY
  delete process.env.CONVEX_URL
  delete process.env.VITE_CONVEX_URL

  try {
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    process.env.AE_ANSWER_EVAL_REGISTRY_SEED = testCase.registrySeed ?? 'default'
    let result: AnswerTurnEvalResult = {
      ok: false,
      caseId: testCase.id,
      status: 'missing',
      slugs: [],
      toolQueries: [],
      timingNames: [],
      artifactKinds: [],
      workStepIds: [],
      workSteps: [],
      totalTimingMs: 0,
      requestToFirstProgressMs: 0,
      requestToCompletionMs: 0,
      ...emptyAnswerEvalHarnessMetrics(),
      capabilityMetrics: emptyAnswerEvalCapabilityMetrics(),
      hasHarnessRun: false,
      harnessToolsInvoked: [],
      harnessPhases: [],
      problems: ['not_run'],
      diagnostics: {},
    }

    result = await runAnswerTurnInStore({
      testCase,
      store,
      sessionId: `eval-${testCase.id}`,
      turnKey: `eval-${testCase.id}`,
    })

    return result
  } finally {
    resetRegistryPort()
    resetThreadPort()
    setAnswerThreadPortForTests(undefined)
    if (previousLocalRegistry === undefined) {
      delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    } else {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
    }
    if (previousEvalSeed === undefined) {
      delete process.env.AE_ANSWER_EVAL_REGISTRY_SEED
    } else {
      process.env.AE_ANSWER_EVAL_REGISTRY_SEED = previousEvalSeed
    }
    if (previousConvexUrl === undefined) {
      delete process.env.CONVEX_URL
    } else {
      process.env.CONVEX_URL = previousConvexUrl
    }
    if (previousViteConvexUrl === undefined) {
      delete process.env.VITE_CONVEX_URL
    } else {
      process.env.VITE_CONVEX_URL = previousViteConvexUrl
    }
    if (previousApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = previousApiKey
    }
  }
}

export async function runAnswerTurnInStore(input: {
  testCase: AnswerTurnEvalCase
  store: AnswerThreadTestStore
  sessionId: string
  turnKey: string
  threadId?: string
}): Promise<AnswerTurnEvalResult> {
  const capability = usesSeedOnlyCapabilitySource(
    input.testCase.openRouterAgent,
  )
  const keyed = usesKeyedExecuteSource(input.testCase.openRouterAgent)
  const compare = input.testCase.openRouterAgent?.toolCalls.some(
    (call) => call.toolId === 'registry.operations.compare',
  ) === true
  const publicOperation = capability || compare
    ? await seedOnlyPublicOperation()
    : keyed
      ? keyedPublicOperation()
      : undefined
  const restoreOperationSource =
    publicOperation === undefined
      ? undefined
      : installSeedOnlyOperationSource(publicOperation)
  const stream = streamWithSeedOnlyKeylessSource(
    input.testCase.openRouterAgent,
    input.store,
    publicOperation,
    input.testCase.capabilityOutput,
  )
  const server = input.testCase.openRouterAgent === undefined
    ? undefined
    : await startOpenRouterContractServer(openRouterToolThenProseResponses(input.testCase.openRouterAgent))
  const restoreOpenRouter = server?.installEnv()
  let persistedHarnessRun: EvalHarnessRun | undefined
  const restoreHarnessFinalizer = setAnswerHarnessFinalizerForTests(async (write) => {
    persistedHarnessRun = readHarnessRunFromJournal(write.entries)
    const { request, ...args } = write
    return finalizeReservedAnswerTurnFromSource(request, args)
  })
  try {
    const requestStartedAt = performance.now()
    let firstProgressAt: number | undefined
    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookieHeader(input.sessionId),
          'x-ae-turn-key': input.turnKey,
        },
        body: JSON.stringify({
          query: input.testCase.query,
          ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
          ...(input.testCase.searchContext === undefined ? {} : { searchContext: input.testCase.searchContext }),
        }),
      }),
      {
        admit: async () => ({ ok: true }),
        stream,
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      const responseCompletedAt = performance.now()
      return {
        ok: false,
        caseId: input.testCase.id,
        status: 'error',
        slugs: [],
        toolQueries: [],
        timingNames: [],
        artifactKinds: [],
        workStepIds: [],
        workSteps: [],
        totalTimingMs: 0,
        ...emptyAnswerEvalHarnessMetrics(),
        capabilityMetrics: emptyAnswerEvalCapabilityMetrics(),
        ...performanceMetrics(requestStartedAt, undefined, responseCompletedAt),
        hasHarnessRun: false,
        harnessToolsInvoked: [],
        harnessPhases: [],
        problems: [`http_${response.status}`],
        diagnostics: { errorCode: errorText },
      }
    }

    const frames = await readAnswerTurnStream(response, (frame) => {
      if (firstProgressAt === undefined && frame.event.type !== 'thread') {
        firstProgressAt = performance.now()
      }
    })
    const completedAt = performance.now()
    const lastEvent = frames.at(-1)?.event
    const complete = lastEvent?.type === 'complete' ? lastEvent.answer : undefined
    const error = lastEvent?.type === 'error' ? lastEvent : undefined
    const turn = readLatestTurn(input.store)
    const evidence = parseEvidence(turn?.evidenceJson)
    const timingEntries = evidence?.timings ?? []
    const harnessRun = persistedHarnessRun
    const toolQueries = readToolQueries(evidence)
    const toolIds = (evidence?.toolCalls ?? []).map((call) => call.toolId)
    const toolStatuses = (evidence?.toolCalls ?? []).map((call) => call.status)
    const timingNames = timingEntries.map((timing) => timing.name)
    const artifactKinds = readArtifactKinds(frames, complete)
    const workSteps = readWorkSteps(frames, evidence)
    const workStepIds = workSteps.map((step) => step.id)
    const totalTimingMs = sumTimingMs(timingEntries)
    const harnessToolsInvoked = harnessRun?.coverage.toolsInvoked ?? []
    const harnessPhases = harnessRun?.coverage.phases ?? []
    const harnessMetrics = harnessRun === undefined
      ? emptyAnswerEvalHarnessMetrics()
      : readAnswerEvalHarnessMetrics(harnessRun)
    const capabilityMetrics = readCapabilityEvalMetrics(evidence, complete)
    const requestMetrics = performanceMetrics(requestStartedAt, firstProgressAt, completedAt)
    const status = complete !== undefined ? 'complete' : error !== undefined ? 'error' : 'missing'
    const slugs = complete?.providers.map((provider) => provider.slug) ?? []
    const diagnostics = {
      ...(complete === undefined
        ? {}
        : {
            oneLine: complete.oneLine,
            summary: complete.summary,
            nextStep: complete.nextStep,
            agentJsonUrl: complete.agentJsonUrl,
          }),
      ...(error === undefined ? {} : { errorCode: error.problem.code }),
    }
    const problems = [
      ...evaluateAnswerTurnExpectations({
        testCase: input.testCase,
        status,
        slugs,
        ...requestMetrics,
        ...harnessMetrics,
        toolQueries,
        toolIds,
        toolStatuses,
        timingNames,
        artifactKinds,
        totalTimingMs,
        snapshot: complete,
        workSteps,
        hasHarnessRun: harnessRun !== undefined,
        ...(harnessRun?.summary.run.status === undefined ? {} : { harnessStatus: harnessRun.summary.run.status }),
        harnessToolsInvoked,
        harnessPhases,
      }),
      ...evaluateCapabilityEvidenceExpectation({
        expected: input.testCase.expected.capabilityEvidence,
        evidence,
        snapshot: complete,
      }),
    ]

    return {
      ok: problems.length === 0,
      caseId: input.testCase.id,
      status,
      slugs,
      toolQueries,
      timingNames,
      artifactKinds,
      workStepIds,
      ...requestMetrics,
      ...harnessMetrics,
      workSteps,
      totalTimingMs,
      hasHarnessRun: harnessRun !== undefined,
      ...(harnessRun?.summary.run.status === undefined ? {} : { harnessStatus: harnessRun.summary.run.status }),
      harnessToolsInvoked,
      harnessPhases,
      problems,
      capabilityMetrics,
      diagnostics,
    }
  } finally {
    restoreHarnessFinalizer()
    restoreOperationSource?.()
    restoreOpenRouter?.()
    if (server !== undefined) {
      await server.close()
    }
  }
}

function readLatestTurn(store: AnswerThreadTestStore) {
  return [...store.turns.values()].sort((left, right) => right.seq - left.seq)[0]
}

/**
 * Tool-use agent eval mode. Installs a deterministic test-seam generator that
 * plans a `registry.search` call with the chosen input, then runs the real
 * `runAnswerToolUseAgent` (which executes the tool against the registry fixture,
 * persists the chosen input as a tool-call record, and runs the real gate). This
 * proves the agent's chosen tool input is the recorded evidence and that prose
 * is grounded against the resulting slugs - CI-runnable without an OpenRouter key.
 */
export async function evaluateToolUseCase(
  vars: ToolUseVars,
): Promise<{
  ok: boolean
  toolInput?: string
  slug?: string
  gateOk?: boolean
  modelProvider?: string
  model?: string
  detail?: string
}> {
  const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  let result: {
    ok: boolean
    toolInput?: string
    slug?: string
    gateOk?: boolean
    modelProvider?: string
    model?: string
    detail?: string
  } = {
    ok: false,
    detail: 'not_run',
  }

  process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

  const plannedInput = JSON.parse(vars.plannedInput) as Record<string, unknown>
  const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
    toolCalls: [{ toolId: vars.plannedTool, input: plannedInput }],
    prose: {
      oneLine: vars.proseOneLine,
      summary: vars.proseSummary,
      whatToDoNow: vars.proseNextStep,
    },
  }))
  const restoreOpenRouter = server.installEnv()

  try {
    const agentResult = await runAnswerToolUseAgent({
      query: vars.query,
      keylessExecutableSource: EMPTY_KEYLESS_EXECUTABLE_SOURCE,
    })
    const firstCall = agentResult.toolCalls[0]
    const toolInput = firstCall?.inputJson ?? ''
    const slugs = [...agentResult.allowedSlugs]
    const gateOk = agentResult.gate.ok
    const firstModel = agentResult.modelRequests[0]
    const expectedGate = vars.expectPass === 'true'
    const slugOk = vars.expectedSlug.length === 0 || slugs.includes(vars.expectedSlug)
    const modelAccountingOk =
      firstModel !== undefined &&
      firstModel.status === 'ok' &&
      firstModel.provider === (vars.expectedModelProvider ?? 'openrouter') &&
      firstModel.model === (vars.expectedModel ?? 'test-model') &&
      firstModel.costUnavailableReason === 'price_table_missing'

    let parsedChosen: { query?: string } = {}
    try {
      parsedChosen = JSON.parse(toolInput) as { query?: string }
    } catch {
      // leave parsedChosen empty
    }
    const inputOk = parsedChosen.query === plannedInput.query

    result = {
      ok: gateOk === expectedGate && slugOk && inputOk && modelAccountingOk,
      toolInput,
      slug: slugs.join(','),
      gateOk,
      ...(firstModel?.provider === undefined ? {} : { modelProvider: firstModel.provider }),
      ...(firstModel?.model === undefined ? {} : { model: firstModel.model }),
      ...(slugOk && inputOk && modelAccountingOk
        ? {}
        : { detail: `slug_ok=${slugOk} input_ok=${inputOk} model_accounting_ok=${modelAccountingOk}` }),
    }
  } catch (error) {
    result = { ok: false, detail: `agent_error:${String(error)}` }
  } finally {
    restoreOpenRouter()
    await server.close()
    if (previousLocalRegistry === undefined) {
      delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    } else {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
    }
  }

  return result
}
