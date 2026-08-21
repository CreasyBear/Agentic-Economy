import {
  parseAnswerTurnProblem,
  type AnswerTurnProblem,
} from '@/lib/errors'
import {
  AnswerTurnProtocolError,
  isAbortError,
  readAnswerTurnFrames,
  type AnswerTurnFrame,
} from '@/modules/answer/public'
import type { AnswerEvent } from '@/modules/answer/public'
import type { AeSearchContext } from '@/modules/answer/search-context'

export type AnswerStreamFrame = AnswerTurnFrame
export type TurnThreadMeta = {
  threadId: string
  turnId: string
  turnSeq: number
}

export type AnswerTurnTransportError = Readonly<{
  kind: 'network' | 'protocol'
  code: 'network_error' | 'malformed_problem' | 'malformed_sse' | 'missing_stream'
  detail: string
}>

export type StreamAnswerResult =
  | Readonly<{ kind: 'complete' }>
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'stopped' }>
  | Readonly<{ kind: 'aborted' }>
  | Readonly<{ kind: 'problem'; problem: AnswerTurnProblem }>
  | Readonly<{ kind: 'transport_error'; error: AnswerTurnTransportError }>

const networkTransportError: AnswerTurnTransportError = {
  kind: 'network',
  code: 'network_error',
  detail: 'The answer service could not be reached. Try again.',
}

function protocolTransportError(
  code: Extract<AnswerTurnTransportError['code'], 'malformed_problem' | 'malformed_sse' | 'missing_stream'>,
): AnswerTurnTransportError {
  return {
    kind: 'protocol',
    code,
    detail: code === 'missing_stream'
      ? 'The answer service returned no answer stream.'
      : code === 'malformed_problem'
        ? 'The answer service returned an invalid problem response.'
        : 'The answer service returned a malformed answer stream.',
  }
}

async function parseHttpProblem(response: Response): Promise<AnswerTurnProblem | undefined> {
  try {
    return parseAnswerTurnProblem(await response.json())
  } catch {
    return undefined
  }
}

type AnswerStreamCallbacks = {
  signal?: AbortSignal
  onFrame: (frame: AnswerStreamFrame) => void
  onThread?: (meta: TurnThreadMeta) => void
}

async function requestAnswerStream(
  url: string,
  body: string,
  input: AnswerStreamCallbacks & { clientTurnKey?: string },
): Promise<StreamAnswerResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(input.clientTurnKey === undefined ? {} : { 'X-AE-Turn-Key': input.clientTurnKey }),
      },
      body,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    if (!response.ok) {
      const problem = await parseHttpProblem(response)
      return problem === undefined
        ? { kind: 'transport_error', error: protocolTransportError('malformed_problem') }
        : { kind: 'problem', problem }
    }

    if (response.body === null) {
      return { kind: 'transport_error', error: protocolTransportError('missing_stream') }
    }

    let terminalSeen = false
    let terminalProblem: AnswerTurnProblem | undefined
    let terminalKind: 'complete' | 'pending' | 'stopped' | undefined
    for await (const frame of readAnswerTurnFrames(response.body)) {
      if (frame.event.type === 'thread') {
        input.onThread?.({
          threadId: frame.event.threadId,
          turnId: frame.event.turnId,
          turnSeq: frame.event.turnSeq,
        })
      }
      if (
        frame.event.type === 'error'
        || frame.event.type === 'complete'
        || frame.event.type === 'pending'
        || frame.event.type === 'stopped'
      ) {
        if (terminalSeen) {
          throw new AnswerTurnProtocolError('malformed_sse')
        }
        terminalSeen = true
        if (frame.event.type === 'error') {
          terminalProblem = frame.event.problem
        } else {
          terminalKind = frame.event.type
        }
      }

      input.onFrame(frame)
    }

    if (input.signal?.aborted === true) return { kind: 'aborted' }
    if (terminalProblem !== undefined) return { kind: 'problem', problem: terminalProblem }
    if (terminalKind === 'pending' || terminalKind === 'stopped') return { kind: terminalKind }
    if (terminalKind === 'complete') return { kind: 'complete' }
    if (!terminalSeen) throw new AnswerTurnProtocolError('malformed_sse')
    return { kind: 'complete' }
  } catch (cause) {
    if (
      input.signal?.aborted === true
      || isAbortError(cause)
      || (typeof DOMException !== 'undefined' && cause instanceof DOMException && cause.name === 'AbortError')
    ) {
      return { kind: 'aborted' }
    }
    if (cause instanceof AnswerTurnProtocolError) {
      return { kind: 'transport_error', error: protocolTransportError(cause.code) }
    }
    return { kind: 'transport_error', error: networkTransportError }
  }
}

export async function streamAnswerTurnRequest(input: {
  query: string
  threadId?: string
  searchContext?: AeSearchContext
  clientTurnKey: string
  signal?: AbortSignal
  onFrame: (frame: AnswerStreamFrame) => void
  onThread?: (meta: TurnThreadMeta) => void
}): Promise<StreamAnswerResult> {
  return requestAnswerStream(
    '/api/answer/turn',
    JSON.stringify({
      query: input.query,
      ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
      ...(input.searchContext === undefined ? {} : { searchContext: input.searchContext }),
    }),
    input,
  )
}


export function appendThinkingStep(steps: readonly string[], label: string): string[] {
  if (steps.at(-1) === label) {
    return [...steps]
  }
  return [...steps, label]
}

export type { AnswerEvent }
