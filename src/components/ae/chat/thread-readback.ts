import type { AnswerTurnTransportError } from './answer-stream'
import { parseAnswerTurnProblemStrict, type AnswerTurnProblem } from '@/lib/errors'
import {
  parsePublicThreadProjection,
  type PublicThreadProjection,
} from '@/modules/answer-thread/public'

export type ThreadReadbackResult =
  | { kind: 'ok'; projection: PublicThreadProjection }
  | { kind: 'not_found' }
  | { kind: 'failed'; problem: AnswerTurnProblem }
  | { kind: 'transport_error'; error: AnswerTurnTransportError }

export async function readAnswerThreadProjection(
  threadId: string,
  signal?: AbortSignal,
): Promise<ThreadReadbackResult> {
  try {
    const response = await fetch(`/api/answer/threads/${encodeURIComponent(threadId)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...(signal === undefined ? {} : { signal }),
    })

    if (response.status === 404) {
      return { kind: 'not_found' }
    }

    if (!response.ok) {
      const problem = await parseProblemBody(response)
      return problem === undefined
        ? { kind: 'transport_error', error: protocolError('protocol', 'malformed_problem', 'The thread error response was malformed.') }
        : { kind: 'failed', problem }
    }

    const projection = await parseProjectionBody(response, threadId)
    return projection === undefined
      ? { kind: 'transport_error', error: protocolError('protocol', 'malformed_problem', 'The thread readback was malformed.') }
      : { kind: 'ok', projection }
  } catch (cause) {
    if (signal?.aborted === true || cause instanceof DOMException && cause.name === 'AbortError') {
      return { kind: 'transport_error', error: protocolError('network', 'network_error', 'The thread readback was interrupted.') }
    }
    return { kind: 'transport_error', error: protocolError('network', 'network_error', 'The thread could not be reached.') }
  }
}

async function parseProblemBody(response: Response): Promise<AnswerTurnProblem | undefined> {
  try {
    return parseAnswerTurnProblemStrict(await response.json())
  } catch {
    return undefined
  }
}

async function parseProjectionBody(
  response: Response,
  expectedThreadId: string,
): Promise<PublicThreadProjection | undefined> {
  try {
    return parsePublicThreadProjection(await response.json(), expectedThreadId) ?? undefined
  } catch {
    return undefined
  }
}

function protocolError(
  kind: AnswerTurnTransportError['kind'],
  code: AnswerTurnTransportError['code'],
  detail: string,
): AnswerTurnTransportError {
  return { kind, code, detail }
}


