import { findAnswerReadToolAction } from './answer-tool-registry'
import type { ActionModelRequestObservation, ActionTimingSink } from '@/modules/common/action'
import { createRuntimeId, createRuntimeIdPrefix } from '@/modules/common/runtime-id'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { roundNonNegative2 } from '@/modules/common/round-nonnegative-2'
import { safeJsonStringify } from '@/modules/common/safe-json-stringify'
import { toAnswerSource, type AnswerSource } from '@/modules/answer/public'
import {
  actionToHarnessTool,
  runHarnessTool,
  type HarnessRunLoop,
  type HarnessToolStatus,
  type RunHarnessToolOutcome,
} from '@/modules/harness/public'
import type {
  InspectPlanResult,
  OperationCompareResult,
  OperationDetailResult,
  OperationSearchResult,
  PublicBusinessCatalogApiV2SearchPage,
  PublicBusinessCatalogV2DetailResult,
} from '@/modules/registry/public'
import { parseToolSummary } from './tool-summary'

import type {
  AnswerToolCallRecord,
  AnswerToolCallResultSummary,
  AnswerToolCallStatus,
  AnswerToolId,
  AnswerTurnTimingEntry,
} from '../answer-thread.schema'

/**
 * Runs a single AE read tool call for an answer turn and produces the
 * evidence record the orchestrator buffers and later persists.
 *
 * The runner never writes to Convex mid-stream. It validates the agent's
 * input against the action's Zod schema, executes the action, extracts the
 * public-catalog providers + slugs, computes a stable result hash, and returns
 * a buffered `AnswerToolCallRecord` plus the `AnswerSource[]` / `allowedSlugs`
 * the gate and synthesizer consume. Refusal (non-read action or unknown tool)
 * and error states are recorded, never thrown to the model.
 */

export type RunAnswerToolCallInput = {
  toolId: string
  input: unknown
  turnId: string
  seq: number
  harnessLoop?: HarnessRunLoop
}

export type RunAnswerToolCallResult = {
  record: AnswerToolCallRecord
  providers: AnswerSource[]
  allowedSlugs: ReadonlySet<string>
  timings: readonly AnswerTurnTimingEntry[]
  /** Public action result JSON fed back to the model as tool-role content. */
  resultJson: string
}


export async function runAnswerToolCall(
  input: RunAnswerToolCallInput,
): Promise<RunAnswerToolCallResult> {
  const timings = createTimingCollector()
  const toolCallId = makeToolCallId(input)

  const action = findAnswerReadToolAction(input.toolId)
  if (action === undefined) {
    return refuse(input, toolCallId, 'tool_not_known')
  }
  if (!action.readOnly) {
    return refuse(input, toolCallId, 'tool_not_read_only')
  }

  const tool = actionToHarnessTool(action)
  if (tool.strictInputSchemaViolation !== undefined || tool.strictOutputSchemaViolation !== undefined) {
    const errorCode = 'tool_schema_not_strict'
    return recordResult(input, toolCallId, {
      status: 'error',
      summary: { slugs: [], count: 0, errorCode },
      inputJson: safeJsonStringify(input.input),
      providers: [],
      resultJson: safeJsonStringify({ kind: 'error', code: errorCode }),
      timings: timings.entries(),
    })
  }

  const context = {
    timing: timings.sink,
    ...(input.harnessLoop === undefined
      ? {}
      : {
          onModelRequest: (observation: ActionModelRequestObservation) => {
            input.harnessLoop?.recordModelRequest(observation)
          },
        }),
  }
  let outcome: RunHarnessToolOutcome
  if (input.harnessLoop === undefined) {
    outcome = await runHarnessTool({
      tool,
      input: input.input,
      context,
      mode: 'public-read',
      toolCallId,
    })
  } else {
    outcome = await input.harnessLoop.runTool({
      tool,
      input: input.input,
      context,
      mode: 'public-read',
      toolCallId,
    })
  }
  timings.record('tool.run', outcome.result.durationMs, {
    toolId: input.toolId,
    toolSeq: input.seq,
    harnessStatus: outcome.result.status,
  })

  if (outcome.result.status !== 'ok' || outcome.result.output === undefined) {
    const errorCode = outcome.result.errorCode ?? harnessStatusToErrorCode(outcome.result.status)
    return recordResult(input, toolCallId, {
      status: harnessStatusToAnswerStatus(outcome.result.status),
      summary: { slugs: [], count: 0, errorCode },
      inputJson: outcome.result.inputJson,
      providers: [],
      resultJson: outcome.result.outputJson ?? safeJsonStringify({
        kind: outcome.result.status === 'blocked' || outcome.result.status === 'refused' ? 'refused' : 'error',
        code: errorCode,
      }),
      timings: timings.entries(),
    })
  }

  const extracted = extractProviders(input.toolId as AnswerToolId, outcome.result.output)
  const summary: AnswerToolCallResultSummary = {
    slugs: extracted.providers.map((provider) => provider.slug),
    count: extracted.count,
  }
  return recordResult(input, toolCallId, {
    status: 'complete',
    summary,
    inputJson: outcome.result.inputJson,
    providers: extracted.providers,
    resultJson: outcome.result.outputJson ?? safeJsonStringify(outcome.result.output),
    timings: timings.entries(),
  })
}

export function refuseAnswerToolCall(
  input: RunAnswerToolCallInput,
  errorCode: string,
  toolCallId: string = makeToolCallId(input),
): RunAnswerToolCallResult {
  return refuse(input, toolCallId, errorCode)
}

function makeToolCallId(input: RunAnswerToolCallInput): string {
  return createRuntimeId(createRuntimeIdPrefix('tc', input.turnId, String(input.seq)))
}

function refuse(
  input: RunAnswerToolCallInput,
  toolCallId: string,
  errorCode: string,
): RunAnswerToolCallResult {
  return recordResult(input, toolCallId, {
    status: 'refused',
    summary: { slugs: [], count: 0, errorCode },
    inputJson: safeJsonStringify(input.input),
    providers: [],
    resultJson: safeJsonStringify({ kind: 'refused', code: errorCode }),
    executed: false,
    timings: [],
  })
}

function recordResult(
  input: RunAnswerToolCallInput,
  toolCallId: string,
  outcome: {
    status: AnswerToolCallStatus
    summary: AnswerToolCallResultSummary
    inputJson: string
    providers: AnswerSource[]
    resultJson: string
    timings: readonly AnswerTurnTimingEntry[]
    executed?: boolean
  },
): RunAnswerToolCallResult {
  const resultSummaryJson = safeJsonStringify(outcome.summary)
  const resultHash = canonicalDigest({
    toolId: input.toolId,
    input: outcome.inputJson,
    summary: resultSummaryJson,
    resultJson: outcome.resultJson,
    status: outcome.status,
    ...(outcome.executed === undefined ? {} : { executed: outcome.executed }),
  }).toString()

  const record: AnswerToolCallRecord = {
    toolCallId,
    turnId: input.turnId,
    seq: input.seq,
    toolId: input.toolId as AnswerToolId,
    inputJson: outcome.inputJson,
    resultSummaryJson,
    resultJson: outcome.resultJson,
    resultHash,
    status: outcome.status,
    ...(outcome.executed === undefined ? {} : { executed: outcome.executed }),
    createdAt: Date.now(),
  }

  return {
    record,
    providers: outcome.providers,
    allowedSlugs: new Set(outcome.providers.map((provider) => provider.slug)),
    timings: outcome.timings,
    resultJson: outcome.resultJson,
  }
}

function extractProviders(
  toolId: AnswerToolId,
  result: unknown,
): { providers: AnswerSource[]; count: number } {
  if (toolId === 'registry.search') {
    const page = result as PublicBusinessCatalogApiV2SearchPage
    return {
      providers: page.items.map((dto, index) => toAnswerSource(dto, index + 1)),
      count: page.pagination.total,
    }
  }

  if (toolId === 'registry.operations.search') {
    const operationSearch = result as OperationSearchResult
    return {
      providers: [],
      count: operationSearch.kind === 'ok' ? operationSearch.items.length : 0,
    }
  }

  if (toolId === 'registry.operations.detail') {
    const operationDetail = result as OperationDetailResult
    return {
      providers: [],
      count: operationDetail.kind === 'found' ? 1 : 0,
    }
  }

  if (toolId === 'registry.operations.compare') {
    const operationCompare = result as OperationCompareResult
    return {
      providers: [],
      count: operationCompare.kind === 'ok' ? 1 : 0,
    }
  }

  if (toolId === 'registry.operations.inspectPlan') {
    const inspectPlan = result as InspectPlanResult
    return {
      providers: [],
      count: inspectPlan.kind === 'ok' ? 1 : 0,
    }
  }

  const detail = result as PublicBusinessCatalogV2DetailResult
  if (detail.kind === 'found') {
    return {
      providers: [toAnswerSource(detail.business, 1)],
      count: 1,
    }
  }

  return { providers: [], count: 0 }
}

function harnessStatusToAnswerStatus(status: HarnessToolStatus): AnswerToolCallStatus {
  switch (status) {
    case 'ok':
      return 'complete'
    case 'refused':
    case 'blocked':
    case 'skipped':
      return 'refused'
    case 'error':
    case 'timeout':
    case 'aborted':
      return 'error'
  }
}

function harnessStatusToErrorCode(status: HarnessToolStatus): string {
  switch (status) {
    case 'ok':
      return 'none'
    case 'refused':
      return 'tool_refused'
    case 'blocked':
      return 'tool_blocked'
    case 'skipped':
      return 'tool_skipped'
    case 'timeout':
      return 'tool_timeout'
    case 'aborted':
      return 'tool_aborted'
    case 'error':
      return 'tool_run_failed'
  }
}

function createTimingCollector(): {
  sink: ActionTimingSink
  record: ActionTimingSink['record']
  entries: () => readonly AnswerTurnTimingEntry[]
} {
  const entries: AnswerTurnTimingEntry[] = []
  const record: ActionTimingSink['record'] = (name, durationMs, metadata) => {
    entries.push({
      name,
      durationMs: roundNonNegative2(durationMs),
      atMs: Date.now(),
      ...(metadata === undefined ? {} : { metadata }),
    })
  }
  return {
    sink: { record },
    record,
    entries: () => [...entries],
  }
}

/**
 * Adapter for `collectAllowedSlugsFromToolResults` (catalog-grounding.ts),
 * which expects a list of batches of `{ slug }` objects. Maps each tool-call
 * record's result summary into one batch of slug objects.
 */
export function toolCallRecordsToGateInput(
  records: readonly AnswerToolCallRecord[],
): { slug: string }[][] {
  return records.map((record) => {
    const summary = parseToolSummary(record.resultSummaryJson)
    return summary.slugs.map((slug) => ({ slug }))
  })
}
