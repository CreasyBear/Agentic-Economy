import {
  buildArtifactsFromSnapshot,
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
  type AnswerSnapshot,
  type AnswerWorkStep,
} from '../../../src/modules/answer/public'
import type { FrozenTurnEvidence } from '../../../src/modules/answer-thread/harness'
import { round2 } from '../../../src/modules/common/round-2'
import { isRecord } from '../../../src/modules/common/is-record'
import { uniq } from 'es-toolkit/array'
import { sameStringList } from '../../../src/modules/common/same-string-list'
import { type AnswerTurnFrame } from '../../../tests/helpers/answer-turn-stream'
import type { AnswerTurnEvalCase } from './cases'
import type {
  AnswerEvalPerformancePath,
  AnswerEvalUsage,
} from './eval-capability-metrics'

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

export type EvalHarnessRun = NonNullable<FrozenTurnEvidence['harnessRun']>

export function evaluateAnswerTurnExpectations(input: {
  testCase: AnswerTurnEvalCase
  status: 'complete' | 'error' | 'missing'
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
    problems.push(`tool status expectation failed (${expected.toolStatuses.length} expected, ${toolStatuses.length} observed): expected [${expected.toolStatuses.join(', ')}], got [${toolStatuses.join(', ')}]`)
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
  if (!sameStringList(slugs, expected.slugs ?? [])) {
    problems.push(`expected slugs [${(expected.slugs ?? []).join(', ')}], got [${slugs.join(', ')}]`)
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


export function evaluateWorkLogExpectations(input: {
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


export function parseEvidence(value: string | undefined): FrozenTurnEvidence | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }
  try {
    return JSON.parse(value) as FrozenTurnEvidence
  } catch {
    return undefined
  }
}

export function readHarnessRunFromJournal(
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

export function readToolQueries(evidence: FrozenTurnEvidence | undefined): string[] {
  return (evidence?.toolCalls ?? []).map((call) => {
    try {
      const parsed = JSON.parse(call.inputJson) as { query?: unknown }
      return typeof parsed.query === 'string' ? parsed.query : ''
    } catch {
      return ''
    }
  })
}

export function readWorkSteps(
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

export function readArtifactKinds(
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

export function sumTimingMs(timings: NonNullable<FrozenTurnEvidence['timings']>): number {
  return round2(timings.reduce((sum, timing) => sum + timing.durationMs, 0))
}

function findInternalPublicTerms(publicText: string): string[] {
  return INTERNAL_PUBLIC_TERMS.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(publicText)
  })
}

export function findUnsafeClaimProblems(publicText: string): string[] {
  const problems: string[] = []
  if (hasEpistemicVocabulary(publicText)) {
    problems.push('epistemic vocabulary present')
  }
  if (hasInjectionUpgrade(publicText)) {
    problems.push('injection upgrade language present')
  }
  return problems
}
