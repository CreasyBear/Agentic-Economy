import {
  buildArtifactsFromSnapshot,
  runAnswerGate,
} from '../../../src/modules/answer/public'
import {
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
} from '../../../src/modules/answer/public'
import { assembleAnswerEvidence, runAnswerToolUseAgent } from '../../../src/modules/answer/server'
import {
  seedKeylessExecutableSource,
} from '../../../tests/helpers/keyless-seed-source'
import type {
  KeylessExecutableSourcePort,
  OperationExecuteDeps,
} from '../../../src/modules/capability-execution/public'
import { validateFollowUpChip } from '../../../src/modules/answer-thread/public'
import { streamAnswerTurn } from '../../../src/modules/answer-thread/server'
import {
  finalizeReservedAnswerTurnFromSource,
  setAnswerHarnessFinalizerForTests,
  setAnswerThreadPortForTests,
} from '../../../src/modules/answer-thread/testing'
import type { FrozenTurnEvidence } from '../../../src/modules/answer-thread/harness'
import type { AnswerQuerySafetyResult, AnswerSnapshot, AnswerWorkStep } from '@/modules/answer/public'

import { BROAD_ANSWER_EVAL_BUSINESS_FIXTURES } from './registry-seed'
import { handleAnswerTurnRequest } from '../../../src/routes/api.answer.turn'
import { round2 } from '../../../src/modules/common/round-2'
import { buildDevSeedCatalogState } from '../../../src/modules/dev/public'
import { isRecord } from '../../../src/modules/common/is-record'
import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  resolvePublishedInquiryTarget,
  searchPublicBusinessOfferingSupply,
} from '../../../src/modules/registry/public'
import { setPublicRegistrySourcePortForTests } from '../../../src/modules/registry/registry.functions'
import { uniq } from 'es-toolkit/array'
import { sameStringList } from '../../../src/modules/common/same-string-list'
import {
  createAnswerThreadTestStore,
  type AnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../../../tests/helpers/answer-thread-test-port'
import { createLocalE2eRegistrySourcePort } from '../../../tests/helpers/registry-local-e2e'
import { readAnswerTurnStream, type AnswerTurnFrame } from '../../../tests/helpers/answer-turn-stream'
import {
  SEED_ONLY_CAPABILITY_OUTPUT,
  SEED_ONLY_CAPABILITY_TOOL_ID,
  findAnswerThreadEvalCase,
  findAnswerTurnEvalCase,
  type AnswerThreadEvalCase,
  type AnswerThreadEvalTurn,
  type AnswerTurnEvalCase,
} from './cases'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../../tests/helpers/openrouter-contract-server'

/** Explicit seed-only/test-only transport; never a live provider dependency. */
const seedOnlyOperationExecuteDeps = (
  output: unknown = SEED_ONLY_CAPABILITY_OUTPUT,
): Pick<OperationExecuteDeps, 'isPublicTarget' | 'fetchImpl'> => ({
  isPublicTarget: async () => true,
  fetchImpl: async (resource) => {
    const url = resource instanceof URL
      ? resource
      : resource instanceof Request
        ? new URL(resource.url)
        : new URL(String(resource))
    if (
      url.origin !== 'https://api.coingecko.com'
      || url.pathname !== '/api/v3/simple/price'
      || url.searchParams.get('ids') !== 'bitcoin'
      || url.searchParams.get('vs_currencies') !== 'usd'
    ) {
      throw new Error('answer_eval_seed_only_query_mismatch')
    }
    return Response.json(output)
  },
})
const EMPTY_KEYLESS_EXECUTABLE_SOURCE: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}

function allowEvalQuerySafety(): Promise<AnswerQuerySafetyResult> {
  const now = Date.now()
  return Promise.resolve({
    kind: 'allowed',
    modelRequest: {
      seq: 0,
      provider: 'openrouter',
      model: 'test-model',
      status: 'ok',
      startedAt: now,
      endedAt: now,
      durationMs: 0,
      responseId: 'chatcmpl-safety-allow',
      stopReason: 'stop',
      usage: {
        inputTokens: 40,
        outputTokens: 2,
        totalTokens: 42,
      },
      costUnavailableReason: 'provider_metadata_missing',
    },
  })
}

type GateVars = {
  snapshot: string
  allowedSlugs: string
}

type ChipVars = {
  chip: string
  priorQueryCount: string
}

type ParityVars = {
  query: string
}

type InjectionVars = {
  prose: string
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

type AnswerTurnVars = {
  caseId: string
}

type AnswerThreadVars = {
  caseId: string
}


export type AnswerEvalPerformancePath = 'deterministic' | 'model'

export type AnswerEvalUsage = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

type AnswerEvalHarnessMetrics = {
  performancePath: AnswerEvalPerformancePath
  modelRequestCount: number
  modelToolRunCount: number
  toolRunCount: number
  usage: AnswerEvalUsage
  estimatedUsd?: number
  costUnavailableReasons: readonly string[]
}
export type AnswerEvalCapabilityToolCounts = {
  total: number
  complete: number
  refused: number
  error: number
}

export type AnswerEvalCapabilityOperationRefDialects = {
  canonical: number
  readable: number
  invalid: number
  missing: number
}

export type AnswerEvalCapabilityMetrics = {
  capabilityToolCounts: AnswerEvalCapabilityToolCounts
  capabilityOperationRefDialects: AnswerEvalCapabilityOperationRefDialects
  capabilityEvidenceComplete: boolean
}

function emptyAnswerEvalCapabilityMetrics(): AnswerEvalCapabilityMetrics {
  return {
    capabilityToolCounts: { total: 0, complete: 0, refused: 0, error: 0 },
    capabilityOperationRefDialects: { canonical: 0, readable: 0, invalid: 0, missing: 0 },
    capabilityEvidenceComplete: false,
  }
}

function emptyAnswerEvalHarnessMetrics(): AnswerEvalHarnessMetrics {
  return {
    performancePath: 'deterministic',
    modelRequestCount: 0,
    modelToolRunCount: 0,
    toolRunCount: 0,
    usage: emptyAnswerEvalUsage(),
    costUnavailableReasons: [],
  }
}

function emptyAnswerEvalUsage(): AnswerEvalUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  }
}

function readAnswerEvalHarnessMetrics(
  harnessRun: FrozenTurnEvidence['harnessRun'],
): AnswerEvalHarnessMetrics {
  const modelRequestCount = Math.max(
    finiteCount(harnessRun?.summary.models?.total),
    harnessRun?.privateTelemetry?.modelRequests.length ?? 0,
  )
  const modelToolRunCount = readModelToolRunCount(harnessRun)
  const toolRunCount = finiteCount(harnessRun?.summary.tools.total)
  const usage = harnessRun?.summary.usage
  const cost = harnessRun?.summary.cost
  const estimatedUsd = finiteNonNegative(cost?.estimatedUsd)
  const unavailableReasons = cost?.unavailableReasons
  const costUnavailableReasons = Array.isArray(unavailableReasons)
    ? unavailableReasons.filter(
        (reason: unknown): reason is string => typeof reason === 'string' && reason.length > 0,
      )
    : []
  return {
    performancePath: modelRequestCount > 0 ? 'model' : 'deterministic',
    modelRequestCount,
    modelToolRunCount,
    toolRunCount,
    usage: {
      inputTokens: finiteCount(usage?.inputTokens),
      outputTokens: finiteCount(usage?.outputTokens),
      cachedInputTokens: finiteCount(usage?.cachedInputTokens),
      cacheWriteTokens: finiteCount(usage?.cacheWriteTokens),
      reasoningOutputTokens: finiteCount(usage?.reasoningOutputTokens),
      totalTokens: finiteCount(usage?.totalTokens),
    },
    ...(estimatedUsd === undefined ? {} : { estimatedUsd }),
    costUnavailableReasons: [...new Set<string>(costUnavailableReasons)].sort(
      (left: string, right: string) => left.localeCompare(right),
    ),
  }
}

function readModelToolRunCount(harnessRun: FrozenTurnEvidence['harnessRun']): number {
  const modelRequests = harnessRun?.privateTelemetry?.modelRequests
  if (!Array.isArray(modelRequests)) return 0
  return modelRequests.reduce(
    (count: number, request: unknown) => {
      const stopReason = isRecord(request) && typeof request.stopReason === 'string'
        ? request.stopReason
        : undefined
      return count + (isToolCallStopReason(stopReason) ? 1 : 0)
    },
    0,
  )
}

function isToolCallStopReason(stopReason: string | undefined): boolean {
  return stopReason?.toLowerCase().replace(/[-_]/g, '') === 'toolcalls'
}

function finiteCount(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined
}

function elapsedMs(start: number, end: number): number {
  return round2(Math.max(0, end - start))
}

function performanceMetrics(start: number, firstProgress: number | undefined, completion: number): {
  requestToFirstProgressMs: number
  requestToCompletionMs: number
} {
  return {
    requestToFirstProgressMs: firstProgress === undefined
      ? Number.NaN
      : elapsedMs(start, firstProgress),
    requestToCompletionMs: elapsedMs(start, completion),
  }
}

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

export type AnswerThreadEvalResult = {
  ok: boolean
  caseId: string
  problems: string[]
  turns: AnswerTurnEvalResult[]
}

const INTERNAL_PUBLIC_TERMS = [
  'source-owned',
  'readback',
  'manifest',
  'capability',
  'gateway',
  'operator',
  'MCP',
  'OpenAPI',
  'callable',
  'autonomous',
  'agent-native',
  'DTO',
  'fixture',
] as const

/**
 * Discovery-prose telltales that signal the model answered from catalog
 * metadata instead of executing a capability: e.g. 'the catalog lists two
 * CoinGecko services', 'you would need to run one of those operations', or
 * 'You can get the current bitcoin price by using ...'. A grounded answer that
 * executed the tool contains the returned value, never these phrasings.
 */
const CATALOG_PROSE_FRAGMENTS = [
  'catalog lists',
  'would need to run',
  'you can get the current',
] as const

function evaluateGateCase(vars: GateVars): { ok: boolean; code?: string } {
  const snapshot = JSON.parse(vars.snapshot) as AnswerSnapshot
  const allowedSlugs = new Set(JSON.parse(vars.allowedSlugs) as string[])
  const result = runAnswerGate({ snapshot, allowedSlugs })
  if (result.ok) {
    return { ok: true }
  }
  return { ok: false, code: result.code }
}

function evaluateChipCase(vars: ChipVars): { ok: boolean } {
  const priorQueryCount = Number.parseInt(vars.priorQueryCount, 10)
  const ok = validateFollowUpChip(vars.chip, Number.isNaN(priorQueryCount) ? 1 : priorQueryCount)
  return { ok }
}

async function evaluateParityCase(vars: ParityVars): Promise<{ ok: boolean; detail?: string }> {
  let result: { ok: boolean; detail?: string } = { ok: false, detail: 'not_run' }
  const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  const previousEvalSeed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
  process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
  process.env.AE_ANSWER_EVAL_REGISTRY_SEED = 'default'

  try {
    const evidence = await assembleAnswerEvidence({ query: vars.query, limit: 10 })
    if (evidence === undefined) {
      return { ok: false, detail: 'evidence_missing' }
    }
    const slugs = evidence.providers.map((provider) => provider.slug).sort()
    if (slugs.length === 0 || !slugs.includes('parramatta-emergency-plumbing')) {
      return { ok: false, detail: `unexpected_slugs:${slugs.join(',')}` }
    }
    result = { ok: true }
  } finally {
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
  }

  return result
}

function evaluateInjectionCase(vars: InjectionVars): { ok: boolean } {
  return { ok: hasInjectionUpgrade(vars.prose) }
}

async function evaluateAnswerTurnCase(vars: AnswerTurnVars): Promise<AnswerTurnEvalResult> {
  const testCase = findAnswerTurnEvalCase(vars.caseId)
  if (testCase === undefined) {
    return {
      ok: false,
      caseId: vars.caseId,
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
      problems: [`unknown caseId "${vars.caseId}"`],
      diagnostics: {},
    }
  }

  return runAnswerTurnEvalCase(testCase)
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

async function evaluateAnswerThreadCase(vars: AnswerThreadVars): Promise<AnswerThreadEvalResult> {
  const testCase = findAnswerThreadEvalCase(vars.caseId)
  if (testCase === undefined) {
    return {
      ok: false,
      caseId: vars.caseId,
      problems: [`unknown caseId "${vars.caseId}"`],
      turns: [],
    }
  }

  return runAnswerThreadEvalCase(testCase)
}

export async function runAnswerThreadEvalCase(testCase: AnswerThreadEvalCase): Promise<AnswerThreadEvalResult> {
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
    const turns: AnswerTurnEvalResult[] = []
    let threadId: string | undefined
    for (const [index, turn] of testCase.turns.entries()) {
      const result = await runAnswerTurnInStore({
        testCase: turnToSingleCase(testCase, turn, index),
        store,
        sessionId: `eval-${testCase.id}`,
        turnKey: `eval-${testCase.id}-${index + 1}`,
        ...(threadId === undefined ? {} : { threadId }),
      })
      turns.push(result)
      threadId = readLatestThreadId(store, threadId)
    }

    const problems = turns.flatMap((turn, index) =>
      turn.problems.map((problem) => `turn ${index + 1}: ${problem}`),
    )
    return {
      ok: problems.length === 0,
      caseId: testCase.id,
      problems,
      turns,
    }
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
  }
}

function installEvalRegistrySeed(seed: AnswerTurnEvalCase['registrySeed']): () => void {
  if (seed !== 'broad') {
    return setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())
  }

  const state = buildDevSeedCatalogState(BROAD_ANSWER_EVAL_BUSINESS_FIXTURES).state
  return setPublicRegistrySourcePortForTests({
    list: (input) => Promise.resolve(listPublicBusinessOfferingSupply(state, input)),
    search: (input) => Promise.resolve(searchPublicBusinessOfferingSupply(state, input)),
    detail: (input) => Promise.resolve(getPublicBusinessOfferingSupplyBySlug(state, input)),
    resolveInquiryTarget: (input) => Promise.resolve(resolvePublishedInquiryTarget(state, input)),
  })
}

function usesSeedOnlyCapabilitySource(agent: AnswerTurnEvalCase['openRouterAgent']): boolean {
  return agent?.toolCalls.some(({ toolId }) => toolId === SEED_ONLY_CAPABILITY_TOOL_ID) === true
}

function streamWithSeedOnlyKeylessSource(
  agent: AnswerTurnEvalCase['openRouterAgent'],
  store: AnswerThreadTestStore,
  capabilityOutput?: unknown,
): typeof streamAnswerTurn {
  const capability = usesSeedOnlyCapabilitySource(agent)
  return (streamInput, send) => streamAnswerTurn({
    ...streamInput,
    keylessExecutableSource: capability ? seedKeylessExecutableSource : EMPTY_KEYLESS_EXECUTABLE_SOURCE,
    querySafetyClassifier: allowEvalQuerySafety,
    // The eval finalizer captures harness evidence without mutating the test
    // port's pending row; the consumed SSE terminal frame is authoritative.
    preloadedPriorTurns: [...store.turns.values()].map((turn) => ({
      ...turn,
      status: 'complete',
    })),
    ...(capability ? { operationExecuteDeps: seedOnlyOperationExecuteDeps(capabilityOutput) } : {}),
  }, send)
}

type EvalHarnessRun = NonNullable<FrozenTurnEvidence['harnessRun']>

function readHarnessRunFromJournal(
  entries: readonly { privatePayloadJson?: string }[],
): EvalHarnessRun | undefined {
  for (const entry of [...entries].reverse()) {
    if (entry.privatePayloadJson === undefined) {
      continue
    }
    try {
      const payload = JSON.parse(entry.privatePayloadJson) as unknown
      if (isRecord(payload) && isRecord(payload.harnessRun)) {
        return payload.harnessRun as EvalHarnessRun
      }
    } catch {
      continue
    }
  }
  return undefined
}

async function runAnswerTurnInStore(input: {
  testCase: AnswerTurnEvalCase
  store: AnswerThreadTestStore
  sessionId: string
  turnKey: string
  threadId?: string
}): Promise<AnswerTurnEvalResult> {
  const stream = streamWithSeedOnlyKeylessSource(
    input.testCase.openRouterAgent,
    input.store,
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
    restoreOpenRouter?.()
    if (server !== undefined) {
      await server.close()
    }
  }
}

function turnToSingleCase(
  testCase: AnswerThreadEvalCase,
  turn: AnswerThreadEvalTurn,
  index: number,
): AnswerTurnEvalCase {
  return {
    id: `${testCase.id}#${index + 1}`,
    description: `${testCase.description} — turn ${index + 1}`,
    covers: testCase.covers,
    ...(testCase.registrySeed === undefined ? {} : { registrySeed: testCase.registrySeed }),
    query: turn.query,
    ...(turn.searchContext === undefined ? {} : { searchContext: turn.searchContext }),
    ...(turn.openRouterAgent === undefined ? {} : { openRouterAgent: turn.openRouterAgent }),
    expected: turn.expected,
  }
}

function readLatestTurn(store: AnswerThreadTestStore) {
  return [...store.turns.values()].sort((left, right) => right.seq - left.seq)[0]
}

function readLatestThreadId(
  store: AnswerThreadTestStore,
  fallback: string | undefined,
): string | undefined {
  return [...store.threads.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.threadId ?? fallback
}

function evaluateAnswerTurnExpectations(input: {
  testCase: AnswerTurnEvalCase
  status: AnswerTurnEvalResult['status']
  slugs: readonly string[]
  toolQueries: readonly string[]
  toolIds: readonly string[]
  toolStatuses: readonly string[]
  timingNames: readonly string[]
  artifactKinds: readonly string[]
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
  snapshot: AnswerSnapshot | undefined
  workSteps: readonly AnswerWorkStep[]
  hasHarnessRun: boolean
  harnessStatus?: string
  harnessToolsInvoked: readonly string[]
  harnessPhases: readonly string[]
}): string[] {
  const {
    testCase,
    status,
    slugs,
    toolQueries,
    toolIds,
    toolStatuses,
    timingNames,
    artifactKinds,
    totalTimingMs,
    performancePath,
    requestToFirstProgressMs,
    requestToCompletionMs,
    modelRequestCount,
    modelToolRunCount,
    toolRunCount,
    usage,
    estimatedUsd,
    costUnavailableReasons,
    snapshot,
    workSteps,
    hasHarnessRun,
    harnessStatus,
    harnessToolsInvoked,
    harnessPhases,
  } = input
  const expected = testCase.expected
  const problems: string[] = []
  const timingNameSet = new Set(timingNames)
  const artifactKindSet = new Set(artifactKinds)
  const harnessPhaseSet = new Set(harnessPhases)

  if (performancePath !== 'deterministic' && performancePath !== 'model') {
    problems.push(`unknown performance path ${performancePath}`)
  }
  if (
    !Number.isFinite(requestToFirstProgressMs) ||
    requestToFirstProgressMs < 0 ||
    !Number.isFinite(requestToCompletionMs) ||
    requestToCompletionMs < 0
  ) {
    problems.push('request wall-clock timings must be finite and non-negative')
  }
  if (requestToFirstProgressMs > requestToCompletionMs) {
    problems.push('first progress cannot occur after stream completion')
  }
  if (
    !Number.isFinite(modelToolRunCount) ||
    modelToolRunCount < 0 ||
    !Number.isInteger(modelToolRunCount)
  ) {
    problems.push('model tool run count must be a finite non-negative integer')
  }
  if (expected.toolStatuses !== undefined && !sameStringList(toolStatuses, expected.toolStatuses)) {
    problems.push(`tool status expectation failed (${expected.toolStatuses.length} expected, ${toolStatuses.length} observed)`)
  }
  if (estimatedUsd !== undefined && (!Number.isFinite(estimatedUsd) || estimatedUsd < 0)) {
    problems.push('estimated cost must be finite and non-negative')
  }
  if (costUnavailableReasons.some((reason) => reason.length === 0)) {
    problems.push('cost-unavailable reasons must be non-empty')
  }
  if (modelRequestCount > 0 && estimatedUsd === undefined && costUnavailableReasons.length === 0) {
    problems.push('model cost must be reported or carry an explicit unavailable reason')
  }

  if (status !== expected.status) {
    problems.push(`expected status ${expected.status}, got ${status}`)
  }
  if (!sameStringList(slugs, expected.slugs)) {
    problems.push(`expected slugs [${expected.slugs.join(', ')}], got [${slugs.join(', ')}]`)
  }
  if (expected.toolIds !== undefined && !sameStringList(toolIds, expected.toolIds)) {
    problems.push(`tool identity expectation failed (${expected.toolIds.length} expected, ${toolIds.length} observed)`)
  }
  if (expected.toolQueries !== undefined && !sameStringList(toolQueries, expected.toolQueries)) {
    problems.push(`expected tool queries [${expected.toolQueries.join(', ')}], got [${toolQueries.join(', ')}]`)
  }
  for (const name of expected.includeTimingNames ?? []) {
    if (!timingNameSet.has(name)) {
      problems.push(`missing timing "${name}"`)
    }
  }
  for (const name of expected.excludeTimingNames ?? []) {
    if (timingNameSet.has(name)) {
      problems.push(`unexpected timing "${name}"`)
    }
  }
  for (const kind of expected.includeArtifactKinds ?? []) {
    if (!artifactKindSet.has(kind)) {
      problems.push(`missing artifact kind "${kind}"`)
    }
  }
  for (const kind of expected.forbidArtifactKinds ?? []) {
    if (artifactKindSet.has(kind)) {
      problems.push(`unexpected artifact kind "${kind}"`)
    }
  }
  if (expected.maxProviderCount !== undefined && slugs.length > expected.maxProviderCount) {
    problems.push(`provider count ${slugs.length} exceeds ${expected.maxProviderCount}`)
  }
  if (expected.maxTotalTimingMs !== undefined && totalTimingMs > expected.maxTotalTimingMs) {
    problems.push(`timing total ${totalTimingMs}ms exceeds ${expected.maxTotalTimingMs}ms`)
  }
  if (expected.expectedModelRequests !== undefined && modelRequestCount !== expected.expectedModelRequests) {
    problems.push(`expected ${expected.expectedModelRequests} model requests, got ${modelRequestCount}`)
  }
  if (expected.expectedModelToolRuns !== undefined && modelToolRunCount !== expected.expectedModelToolRuns) {
    problems.push(`expected ${expected.expectedModelToolRuns} model tool runs, got ${modelToolRunCount}`)
  }
  if (expected.maxModelRequests !== undefined && modelRequestCount > expected.maxModelRequests) {
    problems.push(`model request count ${modelRequestCount} exceeds ${expected.maxModelRequests}`)
  }
  if (expected.maxModelToolRuns !== undefined && modelToolRunCount > expected.maxModelToolRuns) {
    problems.push(`model tool run count ${modelToolRunCount} exceeds ${expected.maxModelToolRuns}`)
  }
  if (expected.maxToolRuns !== undefined && toolRunCount > expected.maxToolRuns) {
    problems.push(`tool run count ${toolRunCount} exceeds ${expected.maxToolRuns}`)
  }
  if (expected.requireHarnessRun === true && !hasHarnessRun) {
    problems.push('missing persisted harnessRun')
  }
  if (expected.harnessStatus !== undefined && harnessStatus !== expected.harnessStatus) {
    problems.push(`expected harness status ${expected.harnessStatus}, got ${harnessStatus ?? 'missing'}`)
  }
  if (expected.harnessToolsInvoked !== undefined && !sameStringList(harnessToolsInvoked, expected.harnessToolsInvoked)) {
    problems.push(
      `harness tool expectation failed (${expected.harnessToolsInvoked.length} expected, ${harnessToolsInvoked.length} observed)`,
    )
  }
  for (const phase of expected.harnessPhases ?? []) {
    if (!harnessPhaseSet.has(phase)) {
      problems.push(`missing harness phase "${phase}"`)
    }
  }
  problems.push(...evaluateWorkLogExpectations({ expected, workSteps }))

  if (snapshot === undefined) {
    return problems
  }

  const publicText = [snapshot.oneLine, snapshot.summary, snapshot.nextStep].join(' ')
  const inspectablePublicText = [publicText, readWorkLogText(workSteps)].join(' ')
  for (const value of expected.oneLineIncludes ?? []) {
    if (!snapshot.oneLine.includes(value)) {
      problems.push(`oneLine missing "${value}"`)
    }
  }
  for (const value of expected.summaryIncludes ?? []) {
    if (!snapshot.summary.includes(value)) {
      problems.push(`summary missing "${value}"`)
    }
  }
  for (const value of expected.nextStepIncludes ?? []) {
    if (!snapshot.nextStep.includes(value)) {
      problems.push(`nextStep missing "${value}"`)
    }
  }
  for (const value of expected.agentJsonIncludes ?? []) {
    if (!snapshot.agentJsonUrl.includes(value)) {
      problems.push(`agentJsonUrl missing "${value}"`)
    }
  }
  if (expected.forbidCatalogProse === true) {
    const found = CATALOG_PROSE_FRAGMENTS.filter((fragment) => publicText.toLowerCase().includes(fragment))
    if (found.length > 0) {
      problems.push(`catalog-discovery prose present: ${found.join(', ')}`)
    }
  }
  if (expected.forbidInternalPublicTerms === true) {
    const terms = findInternalPublicTerms(inspectablePublicText)
    if (terms.length > 0) {
      problems.push(`internal public terms present: ${terms.join(', ')}`)
    }
  }
  if (expected.forbidUnsafeClaims === true) {
    const unsafe = findUnsafeClaimProblems(inspectablePublicText)
    problems.push(...unsafe)
  }

  return problems
}


function evaluateWorkLogExpectations(input: {
  expected: AnswerTurnEvalCase['expected']
  workSteps: readonly AnswerWorkStep[]
}): string[] {
  const problems: string[] = []
  const ids = input.workSteps.map((step) => step.id)

  if (input.workSteps.length === 0) {
    if ((input.expected.toolQueries?.length ?? 0) > 0) {
      problems.push('missing visible work log')
    }
    return problems
  }
  if (ids.some((id) => !/^step-\d+$/.test(id))) {
    problems.push(`public work step ids must be sanitized: [${ids.join(', ')}]`)
  }
  if ((input.expected.toolQueries?.length ?? 0) > 0) {
    const searchSteps = input.workSteps.filter((step) => step.phase === 'search')
    if (searchSteps.length === 0) {
      problems.push('missing search work step')
    }
    if (!searchSteps.some((step) => step.detailRows?.some((row) => row.label === 'Results'))) {
      problems.push('search work step is missing result-count details')
    }
  }
  if (input.workSteps.some((step) => step.status === 'running')) {
    problems.push('work log still has running steps')
  }

  return problems
}


function parseEvidence(value: string | undefined): FrozenTurnEvidence | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }
  try {
    return JSON.parse(value) as FrozenTurnEvidence
  } catch {
    return undefined
  }
}
function readCapabilityEvalMetrics(
  evidence: FrozenTurnEvidence | undefined,
  snapshot: AnswerSnapshot | undefined,
): AnswerEvalCapabilityMetrics {
  const capabilityCalls = (evidence?.toolCalls ?? []).filter((call) => call.toolId === 'operation.execute')
  const capabilityToolCounts = {
    total: capabilityCalls.length,
    complete: capabilityCalls.filter((call) => capabilityEvidenceMatchesAnswer(call, snapshot)).length,
    refused: capabilityCalls.filter((call) => call.status === 'refused').length,
    error: capabilityCalls.filter((call) => call.status === 'error').length,
  }
  const capabilityOperationRefDialects = {
    canonical: 0,
    readable: 0,
    invalid: 0,
    missing: 0,
  }
  for (const call of capabilityCalls) {
    const dialect = readOperationRefDialect(call.inputJson)
    capabilityOperationRefDialects[dialect] += 1
  }
  return {
    capabilityToolCounts,
    capabilityOperationRefDialects,
    capabilityEvidenceComplete: capabilityCalls.length > 0
      && capabilityCalls.every((call) => capabilityEvidenceMatchesAnswer(call, snapshot)),
  }
}

function capabilityEvidenceMatchesAnswer(
  call: FrozenTurnEvidence['toolCalls'][number],
  snapshot: AnswerSnapshot | undefined,
): boolean {
  if (
    call.toolCallId.trim().length === 0
    || call.inputJson.trim().length === 0
    || call.resultJson.trim().length === 0
    || call.resultSummaryJson.trim().length === 0
    || call.resultHash.trim().length === 0
  ) {
    return false
  }
  const input = parseRecord(call.inputJson)
  const result = parseRecord(call.resultJson)
  const operationRef = input?.operationRef
  if (
    !isRecord(input?.input)
    || typeof operationRef !== 'string'
    || !/^operation:v1:[0-9a-f]{64}$/.test(operationRef)
    || result?.kind !== 'ok'
    || result.operationRef !== operationRef
    || typeof result.capabilityId !== 'string'
    || result.capabilityId.length === 0
    || typeof result.name !== 'string'
    || result.name.length === 0
    || typeof result.evidenceHash !== 'string'
    || result.evidenceHash.length === 0
    || !Object.prototype.hasOwnProperty.call(result, 'output')
  ) {
    return false
  }
  return capabilityOutputGroundsAnswer(result.output, snapshot)
}

function capabilityOutputGroundsAnswer(output: unknown, snapshot: AnswerSnapshot | undefined): boolean {
  if (snapshot === undefined) return false
  const leaves: (string | number | boolean)[] = []
  collectCapabilityLeaves(output, leaves)
  if (leaves.length === 0) return false
  const meaningfulLeaves = leaves.some((leaf) => typeof leaf === 'number')
    ? leaves.filter((leaf): leaf is number => typeof leaf === 'number')
    : leaves
  const prose = `${snapshot.oneLine} ${snapshot.summary} ${snapshot.nextStep}`.toLowerCase().replace(/,/g, '')
  return meaningfulLeaves.some((leaf) => {
    const value = String(leaf).toLowerCase().trim()
    if (value.length === 0 || value.length > 80) return false
    if (typeof leaf === 'number') {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(String.raw`(?<!\d)${escaped}(?:\.\d+)?(?!\d)`).test(prose)
    }
    return prose.includes(value)
  })
}

function collectCapabilityLeaves(value: unknown, target: (string | number | boolean)[]): void {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    target.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCapabilityLeaves(item, target)
    return
  }
  if (!isRecord(value)) return
  for (const item of Object.values(value)) collectCapabilityLeaves(item, target)
}

function parseRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function evaluateCapabilityEvidenceExpectation(input: {
  expected: AnswerTurnEvalCase['expected']['capabilityEvidence']
  evidence: FrozenTurnEvidence | undefined
  snapshot: AnswerSnapshot | undefined
}): string[] {
  const expected = input.expected
  if (expected === undefined) return []
  const capabilityCalls = input.evidence?.toolCalls.filter((candidate) => candidate.toolId === 'operation.execute') ?? []
  const call = capabilityCalls.at(-1)
  if (call === undefined) return ['capability evidence missing']
  const namedFailure = [...capabilityCalls].reverse().find((candidate) => candidate.status !== 'complete')
  if (namedFailure !== undefined) return [`capability evidence status is ${namedFailure.status}`]
  const callInput = parseRecord(call.inputJson)
  const result = parseRecord(call.resultJson)
  if (callInput?.operationRef !== expected.operationRef) {
    return ['capability operation reference mismatch']
  }
  if (
    result?.kind !== 'ok'
    || call.resultHash.trim().length === 0
    || result.operationRef !== expected.operationRef
    || typeof result.evidenceHash !== 'string'
    || result.evidenceHash.length === 0
    || JSON.stringify(result.output) !== JSON.stringify(expected.output)
  ) {
    return ['capability result schema/ref mismatch']
  }
  if (!capabilityOutputGroundsAnswer(result.output, input.snapshot)) {
    return ['capability prose is stale for returned value']
  }
  return []
}

type OperationRefDialect = keyof AnswerEvalCapabilityOperationRefDialects

function readOperationRefDialect(inputJson: string): OperationRefDialect {
  let parsed: unknown
  try {
    parsed = JSON.parse(inputJson)
  } catch {
    return 'missing'
  }
  if (!isRecord(parsed) || !Object.prototype.hasOwnProperty.call(parsed, 'operationRef')) {
    return 'missing'
  }
  const operationRef = parsed.operationRef
  if (typeof operationRef !== 'string') {
    return 'invalid'
  }
  if (/^operation:v1:[0-9a-f]{64}$/.test(operationRef)) {
    return 'canonical'
  }
  return operationRef.startsWith('operation:v1:') ? 'readable' : 'invalid'
}


function readToolQueries(evidence: FrozenTurnEvidence | undefined): string[] {
  return (evidence?.toolCalls ?? []).map((call) => {
    try {
      const parsed = JSON.parse(call.inputJson) as { query?: unknown }
      return typeof parsed.query === 'string' ? parsed.query : ''
    } catch {
      return ''
    }
  })
}

function readWorkSteps(
  frames: readonly AnswerTurnFrame[],
  evidence: FrozenTurnEvidence | undefined,
): AnswerWorkStep[] {
  const byId = new Map<string, AnswerWorkStep>()
  for (const frame of frames) {
    if (frame.event.type !== 'work-step') {
      continue
    }
    byId.set(frame.event.step.id, {
      ...(byId.get(frame.event.step.id) ?? {}),
      ...frame.event.step,
    })
  }
  for (const step of evidence?.workLog ?? []) {
    byId.set(step.id, {
      ...(byId.get(step.id) ?? {}),
      ...step,
    })
  }
  return [...byId.values()]
}

function readWorkLogText(workSteps: readonly AnswerWorkStep[]): string {
  return workSteps.flatMap((step) => [
    step.title,
    step.summary ?? '',
    ...(step.detailRows ?? []).flatMap((row) => [row.label, row.value]),
  ]).join(' ')
}

function readArtifactKinds(
  frames: readonly AnswerTurnFrame[],
  snapshot: AnswerSnapshot | undefined,
): string[] {
  return uniq([
    ...frames.flatMap((frame) =>
      frame.event.type === 'artifact' ? [frame.event.artifact.kind] : [],
    ),
    ...(snapshot === undefined
      ? []
      : buildArtifactsFromSnapshot(snapshot).map((artifact) => artifact.kind)),
  ])
}

function sumTimingMs(timings: NonNullable<FrozenTurnEvidence['timings']>): number {
  return round2(timings.reduce((sum, timing) => sum + timing.durationMs, 0))
}

function findInternalPublicTerms(publicText: string): string[] {
  return INTERNAL_PUBLIC_TERMS.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(publicText)
  })
}

function findUnsafeClaimProblems(publicText: string): string[] {
  const problems: string[] = []
  if (hasEpistemicVocabulary(publicText)) {
    problems.push('epistemic vocabulary present')
  }
  if (hasInjectionUpgrade(publicText)) {
    problems.push('injection upgrade language present')
  }
  return problems
}

/**
 * Tool-use agent eval mode. Installs a deterministic test-seam generator that
 * plans a `registry.search` call with the chosen input, then runs the real
 * `runAnswerToolUseAgent` (which executes the tool against the registry fixture,
 * persists the chosen input as a tool-call record, and runs the real gate). This
 * proves the agent's chosen tool input is the recorded evidence and that prose
 * is grounded against the resulting slugs - CI-runnable without an OpenRouter key.
 */
async function evaluateToolUseCase(
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

function evaluateCase(vars: Record<string, string>): { ok: boolean; code?: string; detail?: string } {
  const mode = vars.mode ?? 'gate'
  switch (mode) {
    case 'chip':
      return evaluateChipCase(vars as ChipVars)
    case 'injection':
      return evaluateInjectionCase(vars as InjectionVars)
    case 'gate':
    default:
      return evaluateGateCase(vars as GateVars)
  }
}

export async function evaluateCaseAsync(vars: Record<string, string>): Promise<{ ok: boolean; code?: string; detail?: string }> {
  const mode = vars.mode ?? 'gate'
  if (mode === 'answer-turn') {
    return evaluateAnswerTurnCase(vars as AnswerTurnVars)
  }
  if (mode === 'answer-thread') {
    return evaluateAnswerThreadCase(vars as AnswerThreadVars)
  }
  if (mode === 'parity') {
    return evaluateParityCase(vars as ParityVars)
  }
  if (mode === 'tool-use') {
    return evaluateToolUseCase(vars as ToolUseVars)
  }
  return evaluateCase(vars)
}
