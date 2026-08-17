import type { ActionContext, AnyAction } from '@/modules/common/action'
import { createRuntimeId, createRuntimeIdPrefix } from '@/modules/common/runtime-id'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { runWithAbortAndTimeout } from '@/modules/common/transport-timeout'
import { roundNonNegative2 } from '@/modules/common/round-nonnegative-2'
import { safeJsonStringify } from '@/modules/common/safe-json-stringify'

import {
  type HarnessApprovalDecision,
  type HarnessToolDefinition,
  type HarnessToolResult,
  type HarnessToolStatus,
} from './harness.schema'
import { resolveHarnessApproval } from './tool-policy'
import type { HarnessApprovalMode } from './approval-policy'
import {
  describeActionToolExecutionValidation,
} from '@/modules/actions/tool-contract'
import {
  actionToHarnessToolContract,
  harnessToolContractToDefinition,
  type HarnessToolContract,
} from './tool-contract'

export type ActionHarnessTool = HarnessToolDefinition<unknown, unknown> & {
  contract: HarnessToolContract<unknown, unknown>
  descriptorHash: string
  providerViolations: readonly string[]
  strictInputSchemaViolation?: string
  strictOutputSchemaViolation?: string
}

/** Surfaces the harness can run a tool on. Excludes 'cli' from ActionSurface: the harness
 *  tool runner has no CLI transport. */
export type HarnessToolSurface = 'ui' | 'http' | 'agentJson' | 'answerThread'

export type RunHarnessToolInput = {
  tool: HarnessToolDefinition<unknown, unknown>
  input: unknown
  context?: ActionContext
  toolCallId?: string
  surface?: HarnessToolSurface
  mode: HarnessApprovalMode
  timeoutMs?: number
  signal?: AbortSignal
}

export type RunHarnessToolOutcome = {
  decision: HarnessApprovalDecision
  result: HarnessToolResult
}

export function actionToHarnessTool(action: AnyAction): ActionHarnessTool {
  const contract = actionToHarnessToolContract(action)
  const definition = harnessToolContractToDefinition(contract)
  const validation = describeActionToolExecutionValidation(contract)

  return {
    ...definition,
    contract,
    descriptorHash: validation.descriptorHash,
    providerViolations: validation.providerViolations,
    ...(validation.strictInputSchemaViolation === undefined ? {} : { strictInputSchemaViolation: validation.strictInputSchemaViolation }),
    ...(validation.strictOutputSchemaViolation === undefined ? {} : { strictOutputSchemaViolation: validation.strictOutputSchemaViolation }),
  }
}

export async function runHarnessTool(input: RunHarnessToolInput): Promise<RunHarnessToolOutcome> {
  const createdAt = Date.now()
  const startedAt = Date.now()
  const toolCallId = input.toolCallId ?? buildToolCallId(input.tool.id)
  const context = input.context ?? {}
  const decision = resolveHarnessApproval({
    tool: input.tool,
    context,
    ...(input.surface === undefined ? {} : { surface: input.surface }),
    mode: input.mode,
  })

  if (decision.policy !== 'allow') {
    return {
      decision,
      result: buildHarnessToolResult({
        toolCallId,
        toolId: input.tool.id,
        status: decision.policy === 'prompt' ? 'blocked' : 'refused',
        input: input.input,
        summary: { kind: decision.policy, code: decision.reason },
        durationMs: elapsed(startedAt),
        createdAt,
        errorCode: decision.reason,
      }),
    }
  }

  const parsedInput = input.tool.inputSchema.safeParse(input.input)
  if (!parsedInput.success) {
    return {
      decision,
      result: buildHarnessToolResult({
        toolCallId,
        toolId: input.tool.id,
        status: 'error',
        input: input.input,
        summary: { kind: 'error', code: 'invalid_input' },
        durationMs: elapsed(startedAt),
        createdAt,
        errorCode: 'invalid_input',
      }),
    }
  }

  try {
    const output = await runWithAbortAndTimeout({
      run: (signal) => input.tool.run({ input: parsedInput.data, context, ...(signal === undefined ? {} : { signal }) }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.signal === undefined ? {} : { parentSignal: input.signal }),
      useControllerSignal: input.tool.interruptible ?? (input.tool.tier === 'read'),
      deferRun: true,
      abortError: normalizeToolAbortReason,
      timeoutError: (timeoutMs) => new HarnessToolTimeoutError(timeoutMs),
    })
    const parsedOutput = input.tool.outputSchema.safeParse(output)

    if (!parsedOutput.success) {
      return {
        decision,
        result: buildHarnessToolResult({
          toolCallId,
          toolId: input.tool.id,
          status: 'error',
          input: parsedInput.data,
          summary: { kind: 'error', code: 'invalid_output' },
          durationMs: elapsed(startedAt),
          createdAt,
          errorCode: 'invalid_output',
        }),
      }
    }

    return {
      decision,
      result: buildHarnessToolResult({
        toolCallId,
        toolId: input.tool.id,
        status: 'ok',
        input: parsedInput.data,
        output: parsedOutput.data,
        summary: input.tool.summarizeOutput?.(parsedOutput.data) ?? { kind: 'ok' },
        durationMs: elapsed(startedAt),
        createdAt,
      }),
    }
  } catch (error) {
    const errorCode = error instanceof HarnessToolTimeoutError
      ? 'tool_timeout'
      : error instanceof HarnessToolAbortError
        ? 'tool_aborted'
        : 'tool_run_failed'
    return {
      decision,
      result: buildHarnessToolResult({
        toolCallId,
        toolId: input.tool.id,
        status: error instanceof HarnessToolTimeoutError
          ? 'timeout'
          : error instanceof HarnessToolAbortError
            ? 'aborted'
            : 'error',
        input: parsedInput.data,
        summary: { kind: 'error', code: errorCode },
        durationMs: elapsed(startedAt),
        createdAt,
        errorCode,
      }),
    }
  }
}

function buildHarnessToolResult(input: {
  toolCallId: string
  toolId: string
  status: HarnessToolStatus
  input: unknown
  summary: unknown
  durationMs: number
  createdAt: number
  errorCode?: string
  output?: unknown
}): HarnessToolResult {
  const inputJson = safeJsonStringify(input.input)
  const summaryJson = safeJsonStringify(input.summary)
  const outputJson = input.output === undefined ? undefined : safeJsonStringify(input.output)
  const resultHash = canonicalDigest({
    toolId: input.toolId,
    input: inputJson,
    summary: summaryJson,
    status: input.status,
    ...(outputJson === undefined ? {} : { output: outputJson }),
  }).toString()

  return {
    toolCallId: input.toolCallId,
    toolId: input.toolId,
    status: input.status,
    inputJson,
    summaryJson,
    resultHash,
    durationMs: input.durationMs,
    createdAt: input.createdAt,
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(outputJson === undefined ? {} : { outputJson }),
    ...(input.output === undefined ? {} : { output: input.output }),
  }
}


class HarnessToolTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Harness tool timed out after ${timeoutMs}ms`)
    this.name = 'HarnessToolTimeoutError'
  }
}

class HarnessToolAbortError extends Error {
  constructor(reason: unknown) {
    super(reason instanceof Error ? reason.message : 'Harness tool aborted')
    this.name = 'HarnessToolAbortError'
  }
}


function normalizeToolAbortReason(reason: unknown): Error {
  if (reason instanceof HarnessToolTimeoutError || reason instanceof HarnessToolAbortError) {
    return reason
  }
  if (reason instanceof Error) {
    return new HarnessToolAbortError(reason)
  }
  return new HarnessToolAbortError(reason)
}

function buildToolCallId(toolId: string): string {
  return createRuntimeId(createRuntimeIdPrefix('ht', toolId))
}

function elapsed(startedAt: number): number {
  return roundNonNegative2((Date.now() - startedAt))
}

