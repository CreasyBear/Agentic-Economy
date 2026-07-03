import type { ActionContext, AnyAction } from '@/modules/common/action'
import { stableHash } from '@/modules/common/stable-hash'

import {
  type HarnessApprovalDecision,
  type HarnessToolDefinition,
  type HarnessToolResult,
  type HarnessToolStatus,
} from './harness.schema'
import { resolveHarnessApproval } from './tool-policy'
import {
  actionToHarnessToolContract,
  describeHarnessToolExecutionValidation,
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

export type RunHarnessToolInput = {
  tool: HarnessToolDefinition<unknown, unknown>
  input: unknown
  context?: ActionContext
  toolCallId?: string
  surface?: 'ui' | 'http' | 'agentJson' | 'agentTools'
  allowWrites?: boolean
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
  const validation = describeHarnessToolExecutionValidation(contract)

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
    ...(input.allowWrites === undefined ? {} : { allowWrites: input.allowWrites }),
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
    const output = await runWithOptionalTimeout(
      (signal) => input.tool.run({ input: parsedInput.data, context, ...(signal === undefined ? {} : { signal }) }),
      input.timeoutMs,
      input.signal,
      input.tool.interruptible ?? (input.tool.tier === 'read'),
    )
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
  const inputJson = safeStringify(input.input)
  const summaryJson = safeStringify(input.summary)
  const outputJson = input.output === undefined ? undefined : safeStringify(input.output)
  const resultHash = stableHash({
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

async function runWithOptionalTimeout<T>(
  work: (signal: AbortSignal | undefined) => Promise<T>,
  timeoutMs: number | undefined,
  parentSignal: AbortSignal | undefined,
  interruptible: boolean,
): Promise<T> {
  if (parentSignal?.aborted === true) {
    throw new HarnessToolAbortError(parentSignal.reason)
  }

  const controller = new AbortController()
  const cleanup: (() => void)[] = []
  const races: Promise<T>[] = [
    Promise.resolve().then(() => work(interruptible ? controller.signal : parentSignal)),
  ]

  races.push(new Promise<T>((_, reject) => {
    const onAbort = () => reject(normalizeToolAbortReason(controller.signal.reason))
    controller.signal.addEventListener('abort', onAbort, { once: true })
    cleanup.push(() => controller.signal.removeEventListener('abort', onAbort))
  }))

  if (parentSignal !== undefined) {
    const onParentAbort = () => {
      abortController(controller, new HarnessToolAbortError(parentSignal.reason))
    }
    parentSignal.addEventListener('abort', onParentAbort, { once: true })
    cleanup.push(() => parentSignal.removeEventListener('abort', onParentAbort))
  }

  if (timeoutMs !== undefined) {
    const timer = setTimeout(
      () => abortController(controller, new HarnessToolTimeoutError(timeoutMs)),
      timeoutMs,
    )
    cleanup.push(() => clearTimeout(timer))
  }

  try {
    return await Promise.race(races)
  } finally {
    for (const cleanupFn of cleanup) {
      cleanupFn()
    }
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

function abortController(controller: AbortController, reason: Error): void {
  if (!controller.signal.aborted) {
    controller.abort(reason)
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
  const safeToolId = toolId.replaceAll(/[^a-zA-Z0-9_-]/g, '-')
  return `ht-${safeToolId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round((Date.now() - startedAt) * 100) / 100)
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return 'null'
  }
}
