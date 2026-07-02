import {
  assembleAnswerEvidence,
  buildArtifactsFromSnapshot,
  runAnswerGate,
} from '../../../src/modules/answer/public'
import {
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
  hasOverclaim,
  runAnswerToolUseAgent,
  setAnswerToolUseAgentForTests,
} from '../../../src/modules/answer/public'
import type { AnswerEvent, AnswerSnapshot, AnswerWorkStep } from '../../../src/modules/answer/public'
import {
  resetAnswerTurnGuardForTests,
  setAnswerThreadPortForTests,
  validateFollowUpChip,
  type FrozenTurnEvidence,
} from '../../../src/modules/answer-thread/public'
import { handleAnswerTurnRequest } from '../../../src/routes/api.answer.turn'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../../../tests/helpers/answer-thread-test-port'
import { withRegistrySourcePortForTest } from '../../../tests/helpers/source-ports'
import {
  findAnswerThreadEvalCase,
  findAnswerTurnEvalCase,
  type AnswerThreadEvalCase,
  type AnswerThreadEvalTurn,
  type AnswerTurnEvalCase,
} from './cases'
import { createAnswerEvalRegistrySourceState } from './registry-seed'

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
}

type AnswerTurnVars = {
  caseId: string
}

type AnswerThreadVars = {
  caseId: string
}

type StreamFrame = { seq: number; event: AnswerEvent }

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

export function evaluateGateCase(vars: GateVars): { ok: boolean; code?: string } {
  const snapshot = JSON.parse(vars.snapshot) as AnswerSnapshot
  const allowedSlugs = new Set(JSON.parse(vars.allowedSlugs) as string[])
  const result = runAnswerGate({ snapshot, allowedSlugs })
  if (result.ok) {
    return { ok: true }
  }
  return { ok: false, code: result.code }
}

export function evaluateChipCase(vars: ChipVars): { ok: boolean } {
  const priorQueryCount = Number.parseInt(vars.priorQueryCount, 10)
  const ok = validateFollowUpChip(vars.chip, Number.isNaN(priorQueryCount) ? 1 : priorQueryCount)
  return { ok }
}

export async function evaluateParityCase(vars: ParityVars): Promise<{ ok: boolean; detail?: string }> {
  const state = createAnswerEvalRegistrySourceState()
  let result: { ok: boolean; detail?: string } = { ok: false, detail: 'not_run' }

  await withRegistrySourcePortForTest(state, async () => {
    const evidence = await assembleAnswerEvidence({ query: vars.query, limit: 10 })
    if (evidence === undefined) {
      result = { ok: false, detail: 'evidence_missing' }
      return
    }
    const slugs = evidence.providers.map((provider) => provider.slug).sort()
    if (slugs.length === 0 || !slugs.includes('parramatta-emergency-plumbing')) {
      result = { ok: false, detail: `unexpected_slugs:${slugs.join(',')}` }
      return
    }
    result = { ok: true }
  })

  return result
}

export function evaluateInjectionCase(vars: InjectionVars): { ok: boolean } {
  return { ok: hasInjectionUpgrade(vars.prose) }
}

export async function evaluateAnswerTurnCase(vars: AnswerTurnVars): Promise<AnswerTurnEvalResult> {
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
  const state = createAnswerEvalRegistrySourceState(testCase.registrySeed ?? 'default')
  const store = createAnswerThreadTestStore()
  const resetThreadPort = installAnswerThreadTestPort(store)
  const previousApiKey = process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_API_KEY
  resetAnswerTurnGuardForTests()

  try {
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
      hasHarnessRun: false,
      harnessToolsInvoked: [],
      harnessPhases: [],
      problems: ['not_run'],
      diagnostics: {},
    }

    await withRegistrySourcePortForTest(state, async () => {
      result = await runAnswerTurnInStore({
        testCase,
        store,
        sessionId: `eval-${testCase.id}`,
        turnKey: `eval-${testCase.id}`,
      })
    })

    return result
  } finally {
    resetThreadPort()
    setAnswerThreadPortForTests(undefined)
    resetAnswerTurnGuardForTests()
    if (previousApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = previousApiKey
    }
  }
}

export async function evaluateAnswerThreadCase(vars: AnswerThreadVars): Promise<AnswerThreadEvalResult> {
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
  const state = createAnswerEvalRegistrySourceState(testCase.registrySeed ?? 'default')
  const store = createAnswerThreadTestStore()
  const resetThreadPort = installAnswerThreadTestPort(store)
  const previousApiKey = process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_API_KEY
  resetAnswerTurnGuardForTests()

  try {
    const turns: AnswerTurnEvalResult[] = []
    await withRegistrySourcePortForTest(state, async () => {
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
    })

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
    resetThreadPort()
    setAnswerThreadPortForTests(undefined)
    resetAnswerTurnGuardForTests()
    if (previousApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = previousApiKey
    }
  }
}

async function runAnswerTurnInStore(input: {
  testCase: AnswerTurnEvalCase
  store: ReturnType<typeof createAnswerThreadTestStore>
  sessionId: string
  turnKey: string
  threadId?: string
}): Promise<AnswerTurnEvalResult> {
  const resetAgent = input.testCase.plannedAgent === undefined
    ? undefined
    : setAnswerToolUseAgentForTests(async () => input.testCase.plannedAgent ?? {
        toolCalls: [],
        prose: {
          oneLine: '',
          summary: '',
          whatToDoNow: '',
        },
      })

  try {
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
    )

    if (!response.ok) {
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
        hasHarnessRun: false,
        harnessToolsInvoked: [],
        harnessPhases: [],
        problems: [`http_${response.status}`],
        diagnostics: { errorCode: await response.text() },
      }
    }

    const frames = parseStream(await response.text())
    const lastEvent = frames.at(-1)?.event
    const complete = lastEvent?.type === 'complete' ? lastEvent.answer : undefined
    const error = lastEvent?.type === 'error' ? lastEvent : undefined
    const turn = readLatestTurn(input.store)
    const evidence = parseEvidence(turn?.evidenceJson)
    const timingEntries = evidence?.timings ?? []
    const harnessRun = evidence?.harnessRun
    const toolQueries = readToolQueries(evidence)
    const timingNames = timingEntries.map((timing) => timing.name)
    const artifactKinds = readArtifactKinds(frames, complete)
    const workSteps = readWorkSteps(frames, evidence)
    const workStepIds = workSteps.map((step) => step.id)
    const totalTimingMs = sumTimingMs(timingEntries)
    const harnessToolsInvoked = harnessRun?.coverage.toolsInvoked ?? []
    const harnessPhases = harnessRun?.coverage.phases ?? []
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
      ...(error === undefined ? {} : { errorCode: error.code }),
    }
    const problems = evaluateAnswerTurnExpectations({
      testCase: input.testCase,
      status,
      slugs,
      toolQueries,
      timingNames,
      artifactKinds,
      totalTimingMs,
      snapshot: complete,
      workSteps,
      hasHarnessRun: harnessRun !== undefined,
      ...(harnessRun?.summary.run.status === undefined ? {} : { harnessStatus: harnessRun.summary.run.status }),
      harnessToolsInvoked,
      harnessPhases,
    })

    return {
      ok: problems.length === 0,
      caseId: input.testCase.id,
      status,
      slugs,
      toolQueries,
      timingNames,
      artifactKinds,
      workStepIds,
      workSteps,
      totalTimingMs,
      hasHarnessRun: harnessRun !== undefined,
      ...(harnessRun?.summary.run.status === undefined ? {} : { harnessStatus: harnessRun.summary.run.status }),
      harnessToolsInvoked,
      harnessPhases,
      problems,
      diagnostics,
    }
  } finally {
    resetAgent?.()
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
    ...(turn.plannedAgent === undefined ? {} : { plannedAgent: turn.plannedAgent }),
    expected: turn.expected,
  }
}

function readLatestTurn(store: ReturnType<typeof createAnswerThreadTestStore>) {
  return [...store.turns.values()].sort((left, right) => right.seq - left.seq)[0]
}

function readLatestThreadId(
  store: ReturnType<typeof createAnswerThreadTestStore>,
  fallback: string | undefined,
): string | undefined {
  return [...store.threads.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.threadId ?? fallback
}

function evaluateAnswerTurnExpectations(input: {
  testCase: AnswerTurnEvalCase
  status: AnswerTurnEvalResult['status']
  slugs: readonly string[]
  toolQueries: readonly string[]
  timingNames: readonly string[]
  artifactKinds: readonly string[]
  totalTimingMs: number
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
    timingNames,
    artifactKinds,
    totalTimingMs,
    snapshot,
    workSteps,
    hasHarnessRun,
    harnessStatus,
    harnessToolsInvoked,
    harnessPhases,
  } = input
  const expected = testCase.expected
  const problems: string[] = []

  if (status !== expected.status) {
    problems.push(`expected status ${expected.status}, got ${status}`)
  }
  if (!sameStringList(slugs, expected.slugs)) {
    problems.push(`expected slugs [${expected.slugs.join(', ')}], got [${slugs.join(', ')}]`)
  }
  if (expected.toolQueries !== undefined && !sameStringList(toolQueries, expected.toolQueries)) {
    problems.push(`expected tool queries [${expected.toolQueries.join(', ')}], got [${toolQueries.join(', ')}]`)
  }
  for (const name of expected.includeTimingNames ?? []) {
    if (!timingNames.includes(name)) {
      problems.push(`missing timing "${name}"`)
    }
  }
  for (const name of expected.excludeTimingNames ?? []) {
    if (timingNames.includes(name)) {
      problems.push(`unexpected timing "${name}"`)
    }
  }
  for (const kind of expected.includeArtifactKinds ?? []) {
    if (!artifactKinds.includes(kind)) {
      problems.push(`missing artifact kind "${kind}"`)
    }
  }
  for (const kind of expected.forbidArtifactKinds ?? []) {
    if (artifactKinds.includes(kind)) {
      problems.push(`unexpected artifact kind "${kind}"`)
    }
  }
  if (expected.maxProviderCount !== undefined && slugs.length > expected.maxProviderCount) {
    problems.push(`provider count ${slugs.length} exceeds ${expected.maxProviderCount}`)
  }
  if (expected.maxTotalTimingMs !== undefined && totalTimingMs > expected.maxTotalTimingMs) {
    problems.push(`timing total ${totalTimingMs}ms exceeds ${expected.maxTotalTimingMs}ms`)
  }
  if (expected.requireHarnessRun === true && !hasHarnessRun) {
    problems.push('missing persisted harnessRun')
  }
  if (expected.harnessStatus !== undefined && harnessStatus !== expected.harnessStatus) {
    problems.push(`expected harness status ${expected.harnessStatus}, got ${harnessStatus ?? 'missing'}`)
  }
  if (expected.harnessToolsInvoked !== undefined && !sameStringList(harnessToolsInvoked, expected.harnessToolsInvoked)) {
    problems.push(
      `expected harness tools [${expected.harnessToolsInvoked.join(', ')}], got [${harnessToolsInvoked.join(', ')}]`,
    )
  }
  for (const phase of expected.harnessPhases ?? []) {
    if (!harnessPhases.includes(phase)) {
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
  if (expected.requireBoundaryCopy === true && !/cannot book|does not book|does not book or take payment|no booking or payment/i.test(publicText)) {
    problems.push('boundary/action copy missing')
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

function sameStringList(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function evaluateWorkLogExpectations(input: {
  expected: AnswerTurnEvalCase['expected']
  workSteps: readonly AnswerWorkStep[]
}): string[] {
  const problems: string[] = []
  const ids = input.workSteps.map((step) => step.id)

  if (input.workSteps.length === 0) {
    problems.push('missing visible work log')
    return problems
  }
  for (const id of ['interpret.request', 'assemble.answer']) {
    if (!ids.includes(id)) {
      problems.push(`missing work step "${id}"`)
    }
  }
  if ((input.expected.toolQueries?.length ?? 0) > 0 && !ids.some((id) => id.startsWith('search.registry.'))) {
    problems.push('missing search work step')
  }
  if (input.workSteps.some((step) => step.status === 'running')) {
    problems.push('work log still has running steps')
  }

  return problems
}

function parseStream(text: string): StreamFrame[] {
  return text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => JSON.parse(frame.slice('data:'.length).trim()) as StreamFrame)
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
  frames: readonly StreamFrame[],
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
  frames: readonly StreamFrame[],
  snapshot: AnswerSnapshot | undefined,
): string[] {
  return [
    ...new Set([
      ...frames.flatMap((frame) =>
        frame.event.type === 'artifact' ? [frame.event.artifact.kind] : [],
      ),
      ...(snapshot === undefined
        ? []
        : buildArtifactsFromSnapshot(snapshot).map((artifact) => artifact.kind)),
    ]),
  ]
}

function sumTimingMs(timings: NonNullable<FrozenTurnEvidence['timings']>): number {
  return Math.round(timings.reduce((sum, timing) => sum + timing.durationMs, 0) * 100) / 100
}

function findInternalPublicTerms(publicText: string): string[] {
  return INTERNAL_PUBLIC_TERMS.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(publicText)
  })
}

function findUnsafeClaimProblems(publicText: string): string[] {
  const problems: string[] = []
  if (hasOverclaim(publicText)) {
    problems.push('unsafe overclaim present')
  }
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
export async function evaluateToolUseCase(
  vars: ToolUseVars,
): Promise<{ ok: boolean; toolInput?: string; slug?: string; gateOk?: boolean; detail?: string }> {
  const state = createAnswerEvalRegistrySourceState()
  let result: { ok: boolean; toolInput?: string; slug?: string; gateOk?: boolean; detail?: string } = {
    ok: false,
    detail: 'not_run',
  }

  await withRegistrySourcePortForTest(state, async () => {
    const plannedInput = JSON.parse(vars.plannedInput) as Record<string, unknown>
    const reset = setAnswerToolUseAgentForTests(async () => ({
      toolCalls: [{ toolId: vars.plannedTool, input: plannedInput }],
      prose: {
        oneLine: vars.proseOneLine,
        summary: vars.proseSummary,
        whatToDoNow: vars.proseNextStep,
      },
    }))

    try {
      const agentResult = await runAnswerToolUseAgent({ query: vars.query })
      const firstCall = agentResult.toolCalls[0]
      const toolInput = firstCall?.inputJson ?? ''
      const slugs = [...agentResult.allowedSlugs]
      const gateOk = agentResult.gate.ok
      const expectedGate = vars.expectPass === 'true'
      const slugOk = vars.expectedSlug.length === 0 || slugs.includes(vars.expectedSlug)

      let parsedChosen: { query?: string } = {}
      try {
        parsedChosen = JSON.parse(toolInput) as { query?: string }
      } catch {
        // leave parsedChosen empty
      }
      const inputOk = parsedChosen.query === plannedInput.query

      result = {
        ok: gateOk === expectedGate && slugOk && inputOk,
        toolInput,
        slug: slugs.join(','),
        gateOk,
        ...(slugOk && inputOk ? {} : { detail: `slug_ok=${slugOk} input_ok=${inputOk}` }),
      }
    } catch (error) {
      result = { ok: false, detail: `agent_error:${String(error)}` }
    } finally {
      reset()
    }
  })

  return result
}

export function evaluateCase(vars: Record<string, string>): { ok: boolean; code?: string; detail?: string } {
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
