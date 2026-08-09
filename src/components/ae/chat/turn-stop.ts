import { parseAnswerTurnProblemStrict, type AnswerTurnProblem } from '@/lib/errors'
import { isRecord } from '@/modules/common/is-record'
import type { AnswerTurnTransportError } from './answer-stream'
import type { AnswerTurnStatus } from '@/modules/answer-thread/public'
import type { JsonValue } from '@/modules/capability-contract/public'

export type StopAnswerTurnResult =
  | { kind: 'stopped'; threadId: string; turnId: string }
  | { kind: 'already_settled'; threadId: string; turnId: string; status: Extract<AnswerTurnStatus, 'complete' | 'error' | 'stopped'> }
  | { kind: 'not_found' }
  | { kind: 'problem'; problem: AnswerTurnProblem }
  | { kind: 'transport_error'; error: AnswerTurnTransportError }

export async function stopAnswerTurnRequest(input: {
  threadId: string
  turnId: string
}): Promise<StopAnswerTurnResult> {
  try {
    const response = await fetch('/api/answer/turn/stop', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ threadId: input.threadId, turnId: input.turnId }),
    })
    const body = await parseJson(response)
    if (!response.ok) {
      const problem = parseAnswerTurnProblemStrict(body)
      if (problem === undefined) {
        return { kind: 'transport_error', error: protocolError('The stop response was malformed.') }
      }
      if (response.status === 404 && problem.code === 'thread_not_found') {
        return { kind: 'not_found' }
      }
      return { kind: 'problem', problem }
    }
    if (!isRecord(body) || typeof body.kind !== 'string') {
      return { kind: 'transport_error', error: protocolError('The stop response was malformed.') }
    }
    if (body.kind === 'stopped' && body.threadId === input.threadId && body.turnId === input.turnId) {
      return { kind: 'stopped', threadId: input.threadId, turnId: input.turnId }
    }
    if (body.kind === 'already_settled' && body.threadId === input.threadId && body.turnId === input.turnId && isSettledStatus(body.status)) {
      return { kind: 'already_settled', threadId: input.threadId, turnId: input.turnId, status: body.status }
    }
    return { kind: 'transport_error', error: protocolError('The stop response was malformed.') }
  } catch {
    return { kind: 'transport_error', error: { kind: 'network', code: 'network_error', detail: 'The stop request could not be reached.' } }
  }
}

function isSettledStatus(value: unknown): value is Extract<AnswerTurnStatus, 'complete' | 'error' | 'stopped'> {
  return value === 'complete' || value === 'error' || value === 'stopped'
}


async function parseJson(response: Response): Promise<JsonValue | undefined> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function protocolError(detail: string): AnswerTurnTransportError {
  return { kind: 'protocol', code: 'malformed_problem', detail }
}
