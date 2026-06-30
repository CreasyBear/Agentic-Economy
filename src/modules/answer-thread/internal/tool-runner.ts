import { findAction } from '@/modules/actions'
import { stableHash } from '@/modules/common/stable-hash'
import { toAnswerSource } from '@/modules/answer/public'
import type { AnswerSource } from '@/modules/answer/answer-synthesizer'
import type {
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
} from '@/modules/registry/public'

import type {
  AnswerToolCallRecord,
  AnswerToolCallResultSummary,
  AnswerToolCallStatus,
  AnswerToolId,
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
}

export type RunAnswerToolCallResult = {
  record: AnswerToolCallRecord
  providers: AnswerSource[]
  allowedSlugs: ReadonlySet<string>
}

const KNOWN_TOOL_IDS: ReadonlySet<AnswerToolId> = new Set([
  'registry.search',
  'registry.detail',
])

export async function runAnswerToolCall(
  input: RunAnswerToolCallInput,
): Promise<RunAnswerToolCallResult> {
  const toolCallId = `tc-${input.turnId}-${input.seq}-${Math.random()
    .toString(36)
    .slice(2, 10)}`

  if (!KNOWN_TOOL_IDS.has(input.toolId as AnswerToolId)) {
    return refuse(input, toolCallId, 'tool_not_known')
  }

  const action = findAction(input.toolId)
  if (action === undefined) {
    return refuse(input, toolCallId, 'tool_not_registered')
  }
  if (!action.readOnly) {
    return refuse(input, toolCallId, 'tool_not_read_only')
  }

  const parsed = action.schema.safeParse(input.input)
  if (!parsed.success) {
    return recordResult(input, toolCallId, {
      status: 'error',
      summary: { slugs: [], count: 0, errorCode: 'invalid_input' },
      inputJson: safeStringify(input.input),
      providers: [],
    })
  }

  try {
    const result = await action.run({ data: parsed.data, context: {} })
    const extracted = extractProviders(input.toolId as AnswerToolId, result)
    const summary: AnswerToolCallResultSummary = {
      slugs: extracted.providers.map((provider) => provider.slug),
      count: extracted.count,
    }
    return recordResult(input, toolCallId, {
      status: 'complete',
      summary,
      inputJson: safeStringify(parsed.data),
      providers: extracted.providers,
    })
  } catch {
    return recordResult(input, toolCallId, {
      status: 'error',
      summary: { slugs: [], count: 0, errorCode: 'tool_run_failed' },
      inputJson: safeStringify(parsed.data),
      providers: [],
    })
  }
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
  },
): RunAnswerToolCallResult {
  const resultSummaryJson = safeStringify(outcome.summary)
  const resultHash = stableHash({
    toolId: input.toolId,
    input: outcome.inputJson,
    summary: resultSummaryJson,
    status: outcome.status,
  }).toString()

  const record: AnswerToolCallRecord = {
    toolCallId,
    turnId: input.turnId,
    seq: input.seq,
    toolId: input.toolId as AnswerToolId,
    inputJson: outcome.inputJson,
    resultSummaryJson,
    resultHash,
    status: outcome.status,
    createdAt: Date.now(),
  }

  return {
    record,
    providers: outcome.providers,
    allowedSlugs: new Set(outcome.providers.map((provider) => provider.slug)),
  }
}

function extractProviders(
  toolId: AnswerToolId,
  result: unknown,
): { providers: AnswerSource[]; count: number } {
  if (toolId === 'registry.search') {
    const page = result as PublicBusinessCatalogApiPage
    return {
      providers: page.items.map((dto, index) => toAnswerSource(dto, index + 1)),
      count: page.pagination.total,
    }
  }

  const detail = result as PublicBusinessCatalogDetailResult
  if (detail.kind === 'found') {
    return {
      providers: [toAnswerSource(detail.business, 1)],
      count: 1,
    }
  }

  return { providers: [], count: 0 }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return 'null'
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
