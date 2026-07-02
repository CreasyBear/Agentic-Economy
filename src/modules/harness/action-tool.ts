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
      input.tool.run({ input: parsedInput.data, context }),
      input.timeoutMs,
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
    const errorCode = error instanceof HarnessToolTimeoutError ? 'tool_timeout' : 'tool_run_failed'
    return {
      decision,
      result: buildHarnessToolResult({
        toolCallId,
        toolId: input.tool.id,
        status: error instanceof HarnessToolTimeoutError ? 'timeout' : 'error',
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

async function runWithOptionalTimeout<T>(work: Promise<T>, timeoutMs: number | undefined): Promise<T> {
  if (timeoutMs === undefined) {
    return work
  }

  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new HarnessToolTimeoutError(timeoutMs)), timeoutMs)
    }),
  ])
}

class HarnessToolTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Harness tool timed out after ${timeoutMs}ms`)
    this.name = 'HarnessToolTimeoutError'
  }
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
