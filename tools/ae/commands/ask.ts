import { randomUUID } from 'node:crypto'

import { buildAnswerTurnProblem, parseAnswerTurnProblemStrict, redactAnswerTurnProblem, type AnswerTurnProblem } from '@/lib/errors'
import {
  AnswerTurnProtocolError,
  readAnswerTurnFrames,
  type AnswerEvent,
} from '@/modules/answer/public'

import type { CliOptions } from '../lib/args'
import { CliFailure, heading, line, printJson, readHttpOutcome } from '../lib/output'

type AskStatus = 'complete' | 'pending' | 'stopped' | 'error'

type AskThread = Readonly<{
  threadId: string
  turnId: string
  turnSeq: number
}>

type AskWorkStep = Readonly<{
  id: string
  phase: 'interpret' | 'search' | 'read' | 'compare' | 'route' | 'assemble'
  status: 'running' | 'complete' | 'skipped' | 'error' | 'stopped'
  title: string
  summary?: string
}>

type AskResult = Readonly<{
  oneLine?: string
  summary?: string
  nextStep?: string
}>

type AskProjection = Readonly<{
  query: string
  durationMs: number
  thread?: AskThread
  status: AskStatus
  workSteps: readonly AskWorkStep[]
  problem?: AnswerTurnProblem
  result?: AskResult
}>

/** /api/answer/turn streams AI SDK UI message chunks rather than a JSON document. */
export async function runAskCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const query = args.join(' ').trim()
  if (query.length === 0) throw new CliFailure('Usage: ae ask "<question>"', { kind: 'INVALID_ARGUMENT', code: 'ask-usage' })

  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch(`${options.baseUrl}/api/answer/turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-AE-Turn-Key': randomUUID(),
      },
      body: JSON.stringify({ query }),
    })
  } catch {
    const problem = buildAnswerTurnProblem('unavailable')
    throw new CliFailure(problem.detail ?? problem.title, {
      exitCode: 1,
      kind: problem.kind,
      code: problem.code,
      detail: problem,
    })
  }

  if (!response.ok) {
    const outcome = await readHttpOutcome(response, startedAt)
    const problem = parseAnswerTurnProblemStrict(outcome.body)
    if (problem === undefined) {
      throw new CliFailure('The answer service returned an invalid problem response.', {
        exitCode: 1,
        kind: 'INTERNAL',
        code: 'malformed_problem',
        detail: 'The answer service returned an invalid problem response.',
      })
    }
    throw new CliFailure(`${problem.title} (${response.status})`, {
      exitCode: 1,
      kind: problem.kind,
      code: problem.code,
      detail: problem,
    })
  }

  let events: readonly AnswerEvent[]
  try {
    events = await readTurnEvents(response)
  } catch (error) {
    const problem = buildAnswerTurnProblem('answer_turn_failed')
    const message = error instanceof AnswerTurnProtocolError
      ? 'The answer service returned a malformed stream.'
      : 'The answer stream could not be read.'
    throw new CliFailure(message, {
      exitCode: 1,
      kind: problem.kind,
      code: problem.code,
      detail: problem,
    })
  }
  const projection = projectAnswerEvents(query, Date.now() - startedAt, events)

  if (options.json) {
    if (projection.problem !== undefined) throw cliFailureForProblem(projection.problem)
    printJson(projection)
    return
  }

  printHumanProjection(projection)
  if (projection.problem !== undefined) throw cliFailureForProblem(projection.problem)
}

function projectAnswerEvents(
  query: string,
  durationMs: number,
  events: readonly AnswerEvent[],
): AskProjection {
  let thread: AskThread | undefined
  let status: AskStatus = 'pending'
  let problem: AnswerTurnProblem | undefined
  let result: AskResult | undefined
  const workSteps = new Map<string, AskWorkStep>()

  for (const event of events) {
    switch (event.type) {
      case 'thread':
        thread = {
          threadId: event.threadId,
          turnId: event.turnId,
          turnSeq: event.turnSeq,
        }
        break
      case 'work-step': {
        const { id, phase, status, title, summary } = event.step
        workSteps.set(id, {
          id,
          phase,
          status,
          title,
          ...(summary === undefined ? {} : { summary }),
        })
        break
      }
      case 'complete': {
        const { oneLine, summary, nextStep } = event.answer
        if (oneLine === undefined && summary === undefined && nextStep === undefined) {
          result = undefined
          status = 'error'
          problem = buildAnswerTurnProblem('answer_turn_failed')
          break
        }
        result = {
          ...(oneLine === undefined ? {} : { oneLine }),
          ...(summary === undefined ? {} : { summary }),
          ...(nextStep === undefined ? {} : { nextStep }),
        }
        status = 'complete'
        problem = undefined
        break
      }
      case 'pending':
        status = 'pending'
        problem = undefined
        result = undefined
        break
      case 'stopped':
        status = 'stopped'
        problem = undefined
        result = undefined
        break
      case 'error':
        status = 'error'
        problem = redactAnswerTurnProblem(event.problem)
        result = undefined
        break
    }
  }

  return {
    query,
    durationMs,
    ...(thread === undefined ? {} : { thread }),
    status,
    workSteps: [...workSteps.values()],
    ...(problem === undefined ? {} : { problem }),
    ...(result === undefined ? {} : { result }),
  }
}

function printHumanProjection(projection: AskProjection): void {
  heading(`Ask "${projection.query}" (${projection.durationMs}ms)`)
  if (projection.thread !== undefined) {
    line(`  thread ${projection.thread.threadId}`)
    line(`  turn ${projection.thread.turnId} (#${projection.thread.turnSeq})`)
  }
  line(`  status: ${projection.status}`)
  for (const step of projection.workSteps) {
    const summary = step.summary === undefined ? '' : `: ${step.summary}`
    line(`  step ${step.id} (${step.phase}/${step.status}) ${step.title}${summary}`)
  }
  if (projection.result !== undefined) {
    if (projection.result.oneLine !== undefined) line(`  result: ${projection.result.oneLine}`)
    if (projection.result.summary !== undefined) line(`  summary: ${projection.result.summary}`)
    if (projection.result.nextStep !== undefined) line(`  next step: ${projection.result.nextStep}`)
  }
  if (projection.problem !== undefined) line(`  problem: ${describeError(projection.problem)}`)
}

function cliFailureForProblem(problem: AnswerTurnProblem): CliFailure {
  const safeProblem = redactAnswerTurnProblem(problem)
  return new CliFailure(describeError(safeProblem), {
    exitCode: 1,
    kind: safeProblem.kind,
    code: safeProblem.code,
    detail: safeProblem,
  })
}

function describeError(problem: AnswerTurnProblem): string {
  return `${problem.detail ?? problem.title} [${problem.code}]`
}

async function readTurnEvents(response: Response): Promise<readonly AnswerEvent[]> {
  if (response.body === null) throw new AnswerTurnProtocolError('missing_stream')
  const events: AnswerEvent[] = []
  for await (const frame of readAnswerTurnFrames(response.body)) {
    events.push(frame.event)
  }
  return events
}
