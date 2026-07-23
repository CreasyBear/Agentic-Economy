import { findAction } from '@/modules/actions'
import type { ActionContext, ActionTimingSink } from '@/modules/common/action'
import { createRuntimeId, createRuntimeIdPrefix } from '@/modules/common/runtime-id'
import { stableHash } from '@/modules/common/stable-hash'
import { toAnswerSource } from '@/modules/answer/public'
import type {
  AnswerSource,
  OfferingAnswerSource,
} from '@/modules/answer/answer-synthesizer'
import {
  actionToHarnessTool,
  runHarnessTool,
  type HarnessRunLoop,
  type HarnessToolStatus,
} from '@/modules/harness/public'
import type {
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogV2DetailResult,
} from '@/modules/registry/public'
import { isAnswerReadToolId } from './answer-tool-registry'

import type {
  AnswerToolCallRecord,
  AnswerToolCallResultSummary,
  AnswerToolCallStatus,
  AnswerToolId,
  AnswerTurnTimingEntry,
} from '../answer-thread.schema'

/**
 * @offering-consumer-disposition registry_action_offering_v2
 *
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
  actionContext?: ActionContext
}

export type RunAnswerToolCallResult = {
  record: AnswerToolCallRecord
  /** Explicit catalogue-v1 lane retained for legacy callers only. */
  providers: AnswerSource[]
  /** Strict Offering-v2 lane; no service/trust/contact/effect projection. */
  offeringSources: OfferingAnswerSource[]
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

  if (!isAnswerReadToolId(input.toolId)) {
    return refuse(input, toolCallId, 'tool_not_known')
  }

  const action = findAction(input.toolId)
  if (action === undefined) {
    return refuse(input, toolCallId, 'tool_not_registered')
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
      inputJson: safeStringify(input.input),
      providers: [],
      offeringSources: [],
      resultJson: safeStringify({ kind: 'error', code: errorCode }),
      timings: timings.entries(),
    })
  }

  const outcome = input.harnessLoop === undefined
    ? await runHarnessTool({
        tool,
        input: input.input,
        context: { ...input.actionContext, timing: timings.sink },
        allowWrites: false,
        toolCallId,
      })
    : await input.harnessLoop.runTool({
        tool,
        input: input.input,
        context: { ...input.actionContext, timing: timings.sink },
        allowWrites: false,
        toolCallId,
      })
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
      offeringSources: [],
      resultJson: safeStringify({
        kind: outcome.result.status === 'blocked' || outcome.result.status === 'refused' ? 'refused' : 'error',
        code: errorCode,
      }),
      timings: timings.entries(),
      resultHash: outcome.result.resultHash,
    })
  }

  const extracted = extractOfferingSources(input.toolId as AnswerToolId, outcome.result.output)
  const summary: AnswerToolCallResultSummary = {
    slugs: extracted.offeringSources.map((source) => source.business.slug),
    count: extracted.count,
  }
  return recordResult(input, toolCallId, {
    status: 'complete',
    summary,
    inputJson: outcome.result.inputJson,
    providers: [],
    offeringSources: extracted.offeringSources,
    resultJson: outcome.result.outputJson ?? safeStringify(outcome.result.output),
    timings: timings.entries(),
    resultHash: outcome.result.resultHash,
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
    inputJson: safeStringify(input.input),
    providers: [],
    offeringSources: [],
    resultJson: safeStringify({ kind: 'refused', code: errorCode }),
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
    offeringSources: OfferingAnswerSource[]
    resultJson: string
    timings: readonly AnswerTurnTimingEntry[]
    resultHash?: string
  },
): RunAnswerToolCallResult {
  const resultSummaryJson = safeStringify(outcome.summary)
  const resultHash = outcome.resultHash ?? stableHash({
    toolId: input.toolId,
    input: outcome.inputJson,
    summary: resultSummaryJson,
    resultJson: outcome.resultJson,
    status: outcome.status,
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
    createdAt: Date.now(),
  }

  return {
    record,
    providers: outcome.providers,
    offeringSources: outcome.offeringSources,
    allowedSlugs: new Set([
      ...outcome.providers.map((provider) => provider.slug),
      ...outcome.offeringSources.map((source) => source.business.slug),
    ]),
    timings: outcome.timings,
    resultJson: outcome.resultJson,
  }
}

function extractOfferingSources(
  toolId: AnswerToolId,
  result: unknown,
): { offeringSources: OfferingAnswerSource[]; count: number } {
  if (toolId === 'registry.search') {
    const page = result as PublicBusinessCatalogApiV2Page
    return {
      offeringSources: page.items.map((dto, index) => toAnswerSource(dto, index + 1)),
      count: page.pagination.total,
    }
  }

  const detail = result as PublicBusinessCatalogV2DetailResult
  if (detail.kind === 'found') {
    return {
      offeringSources: [toAnswerSource(detail.business, 1)],
      count: 1,
    }
  }

  return { offeringSources: [], count: 0 }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return 'null'
  }
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
      durationMs: Math.max(0, Math.round(durationMs * 100) / 100),
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
    const summary = parseSummary(record.resultSummaryJson)
    return summary.slugs.map((slug) => ({ slug }))
  })
}

function parseSummary(value: string): AnswerToolCallResultSummary {
  try {
    return JSON.parse(value) as AnswerToolCallResultSummary
  } catch {
    return { slugs: [], count: 0 }
  }
}
