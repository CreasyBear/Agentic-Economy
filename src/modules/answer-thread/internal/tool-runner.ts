import { findAction } from '@/modules/actions'
import type { ActionTimingSink } from '@/modules/common/action'
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
}

export type RunAnswerToolCallResult = {
  record: AnswerToolCallRecord
  providers: AnswerSource[]
  allowedSlugs: ReadonlySet<string>
  timings: readonly AnswerTurnTimingEntry[]
  /** Public action result JSON fed back to the model as tool-role content. */
  resultJson: string
}

const KNOWN_TOOL_IDS: ReadonlySet<AnswerToolId> = new Set([
  'registry.search',
  'registry.detail',
])

export async function runAnswerToolCall(
  input: RunAnswerToolCallInput,
): Promise<RunAnswerToolCallResult> {
  const timings = createTimingCollector()
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
    const errorCode = 'invalid_input'
    return recordResult(input, toolCallId, {
      status: 'error',
      summary: { slugs: [], count: 0, errorCode },
      inputJson: safeStringify(input.input),
      providers: [],
      resultJson: safeStringify({ kind: 'error', code: errorCode }),
      timings: timings.entries(),
    })
  }

  try {
    const actionStarted = Date.now()
    const result = await action.run({ data: parsed.data, context: { timing: timings.sink } })
    timings.record('tool.run', Date.now() - actionStarted, { toolId: input.toolId })

    const parsedOutput = parseActionOutput(action, result)
    if (!parsedOutput.success) {
      const errorCode = 'invalid_output'
      return recordResult(input, toolCallId, {
        status: 'error',
        summary: { slugs: [], count: 0, errorCode },
        inputJson: safeStringify(parsed.data),
        providers: [],
        resultJson: safeStringify({ kind: 'error', code: errorCode }),
        timings: timings.entries(),
      })
    }

    const extracted = extractProviders(input.toolId as AnswerToolId, parsedOutput.data)
    const summary: AnswerToolCallResultSummary = {
      slugs: extracted.providers.map((provider) => provider.slug),
      count: extracted.count,
    }
    return recordResult(input, toolCallId, {
      status: 'complete',
      summary,
      inputJson: safeStringify(parsed.data),
      providers: extracted.providers,
      resultJson: safeStringify(parsedOutput.data),
      timings: timings.entries(),
    })
  } catch {
    const errorCode = 'tool_run_failed'
    return recordResult(input, toolCallId, {
      status: 'error',
      summary: { slugs: [], count: 0, errorCode },
      inputJson: safeStringify(parsed.data),
      providers: [],
      resultJson: safeStringify({ kind: 'error', code: errorCode }),
      timings: timings.entries(),
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
    resultJson: string
    timings: readonly AnswerTurnTimingEntry[]
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
    timings: outcome.timings,
    resultJson: outcome.resultJson,
  }
}

type ActionOutputParser = {
  safeParse(
    result: unknown,
  ): { success: true; data: unknown } | { success: false }
}

function parseActionOutput(
  action: { outputSchema?: ActionOutputParser },
  result: unknown,
): { success: true; data: unknown } | { success: false } {
  return action.outputSchema?.safeParse(result) ?? { success: false }
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
