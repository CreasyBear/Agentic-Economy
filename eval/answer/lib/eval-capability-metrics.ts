import type { FrozenTurnEvidence } from '../../../src/modules/answer-thread/harness'
import type { AnswerSnapshot } from '@/modules/answer/public'
import { round2 } from '../../../src/modules/common/round-2'
import { isRecord } from '../../../src/modules/common/is-record'
import type { AnswerTurnEvalCase } from './cases'

export type AnswerEvalPerformancePath = 'deterministic' | 'model'

export type AnswerEvalUsage = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type AnswerEvalHarnessMetrics = {
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

export function emptyAnswerEvalCapabilityMetrics(): AnswerEvalCapabilityMetrics {
  return {
    capabilityToolCounts: { total: 0, complete: 0, refused: 0, error: 0 },
    capabilityOperationRefDialects: { canonical: 0, readable: 0, invalid: 0, missing: 0 },
    capabilityEvidenceComplete: false,
  }
}

export function emptyAnswerEvalHarnessMetrics(): AnswerEvalHarnessMetrics {
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

export function readAnswerEvalHarnessMetrics(
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

export function performanceMetrics(start: number, firstProgress: number | undefined, completion: number): {
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

export function readCapabilityEvalMetrics(
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

export function evaluateCapabilityEvidenceExpectation(input: {
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
