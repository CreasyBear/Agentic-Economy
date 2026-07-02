import {
  HarnessRunLoop,
  type HarnessRunReport,
  type HarnessRunStatus,
} from '@/modules/harness/public'

import {
  AnswerToolIdValues,
  type AnswerRunGateSummary,
  type AnswerToolCallRecord,
  type AnswerToolCallStatus,
  type AnswerTurnStatus,
} from '../answer-thread.schema'

export type AnswerHarnessOperationReportInput = {
  runId: string
  sessionId: string
  status: AnswerTurnStatus
  toolCalls?: readonly AnswerToolCallRecord[]
  gate?: AnswerRunGateSummary
  fallbackReport: HarnessRunReport
}

export async function buildAnswerHarnessOperationReport(
  input: AnswerHarnessOperationReportInput,
): Promise<HarnessRunReport> {
  try {
    return await buildLiveAnswerHarnessOperationReport(input)
  } catch {
    return input.fallbackReport
  }
}

async function buildLiveAnswerHarnessOperationReport(
  input: AnswerHarnessOperationReportInput,
): Promise<HarnessRunReport> {
  const loop = new HarnessRunLoop({
    runId: input.runId,
    sessionId: input.sessionId,
    tools: AnswerToolIdValues,
  })
  const gate = input.gate ?? gateFromTurnStatus(input.status)

  for (const toolCall of input.toolCalls ?? []) {
    loop.collector.recordTool({
      toolId: toolCall.toolId,
      status: answerToolCallStatusToHarnessStatus(toolCall.status),
      durationMs: 0,
      ...(toolCall.status === 'complete' ? {} : { errorCode: readToolCallErrorCode(toolCall) }),
    })
  }

  await loop.phase('gate', async () => {
    if (gate.ok || gate.code === undefined) {
      await loop.evaluateGate(gate.source, () => gate.ok)
      return
    }

    const code = gate.code
    await loop.evaluateGate(gate.source, () => {
      throw createGateError(code)
    }).catch(() => false)
  })
  await loop.phase('assemble', () => undefined)
  await loop.persist(() => undefined)
  await loop.phase('report', () => undefined)

  return loop.snapshot(answerStatusToHarnessStatus(input.status, gate))
}

function gateFromTurnStatus(status: AnswerTurnStatus): AnswerRunGateSummary {
  return {
    ok: status === 'complete',
    source: 'turn_status',
  }
}

function answerStatusToHarnessStatus(
  status: AnswerTurnStatus,
  gate: AnswerRunGateSummary,
): HarnessRunStatus {
  if (status === 'error') {
    return 'error'
  }
  return gate.ok ? 'ok' : 'blocked'
}

function answerToolCallStatusToHarnessStatus(status: AnswerToolCallStatus): HarnessRunStatus {
  switch (status) {
    case 'complete':
      return 'ok'
    case 'refused':
      return 'refused'
    case 'error':
      return 'error'
  }
}

function readToolCallErrorCode(toolCall: AnswerToolCallRecord): string {
  try {
    const parsed = JSON.parse(toolCall.resultSummaryJson) as { errorCode?: unknown }
    if (typeof parsed.errorCode === 'string' && parsed.errorCode.trim().length > 0) {
      return parsed.errorCode
    }
  } catch {
    // Fall through to a stable generic code.
  }
  return toolCall.status === 'refused' ? 'tool_refused' : 'tool_error'
}

function createGateError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}
