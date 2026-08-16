import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { buildAnswerTurnProblem, parseAnswerTurnProblemStrict, redactAnswerTurnProblem, type AnswerTurnProblem } from '@/lib/errors'
import {
  AnswerTurnProtocolError,
  readAnswerTurnFrames,
  type AnswerEvent,
  type AnswerOperationCandidate,
  type AnswerOperationOutcome,
  type AnswerOperationSelection,
} from '@/modules/answer/public'
import { isRecord } from '@/modules/common/is-record'

import type { CliOptions } from '../lib/args'
import { CliFailure, heading, line, printJson, readHttpOutcome } from '../lib/output'

const ANSWER_SESSION_COOKIE = 'ae_session'
const ANSWER_SESSION_VALUE = /^[A-Za-z0-9_-]{1,128}$/u
const MAX_SAVED_ANSWER_SESSIONS = 64

function answerSessionFile(): string {
  return join(process.env.AE_CLI_STATE_DIR ?? join(process.cwd(), '.ae-cli'), 'answer-sessions.json')
}

function readAnswerSessions(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(answerSessionFile(), 'utf8'))
    if (!isRecord(parsed)) {
      throw new CliFailure('Saved Answer sessions are malformed.', {
        kind: 'INTERNAL',
        code: 'answer-session-state-invalid',
      })
    }
    const sessions: Record<string, string> = {}
    for (const [origin, session] of Object.entries(parsed)) {
      if (
        !URL.canParse(origin)
        || new URL(origin).origin !== origin
        || typeof session !== 'string'
        || !ANSWER_SESSION_VALUE.test(session)
      ) {
        throw new CliFailure('Saved Answer sessions are malformed.', {
          kind: 'INTERNAL',
          code: 'answer-session-state-invalid',
        })
      }
      sessions[origin] = session
    }
    return sessions
  } catch (error) {
    if (isMissingFileError(error)) return {}
    if (error instanceof CliFailure) throw error
    throw new CliFailure('Saved Answer sessions could not be read.', {
      kind: 'INTERNAL',
      code: 'answer-session-state-unreadable',
    })
  }
}

function saveAnswerSession(origin: string, session: string): void {
  const sessions = Object.entries({ ...readAnswerSessions(), [origin]: session })
    .slice(-MAX_SAVED_ANSWER_SESSIONS)
  const file = answerSessionFile()
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temporaryFile = `${file}.next-${process.pid}-${randomUUID()}`
  try {
    writeFileSync(temporaryFile, JSON.stringify(Object.fromEntries(sessions)), {
      encoding: 'utf8',
      mode: 0o600,
    })
    renameSync(temporaryFile, file)
  } catch {
    rmSync(temporaryFile, { force: true })
    throw new CliFailure('Saved Answer sessions could not be updated.', {
      kind: 'INTERNAL',
      code: 'answer-session-state-unwritable',
    })
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
  )
}

function answerSessionFrom(response: Response): string | undefined {
  const match = response.headers.get('set-cookie')
    ?.match(/(?:^|,\s*)ae_session=([^;,]+)/u)
  if (match?.[1] === undefined) return undefined
  let value: string
  try {
    value = decodeURIComponent(match[1])
  } catch {
    return undefined
  }
  return ANSWER_SESSION_VALUE.test(value) ? value : undefined
}

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
  operationCandidates?: readonly AnswerOperationCandidate[]
  operationCandidatesDigest?: string
  operationOutcome?: AnswerOperationOutcome
  operationSelection?: AnswerOperationSelection
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

type AskRequest = Readonly<{
  query: string
  threadId?: string
}>

function buildAskRequest(args: readonly string[], options: CliOptions): AskRequest {
  const hasAutomationSelection =
    options.operationRef !== undefined
    || options.candidateDigest !== undefined
  if (!hasAutomationSelection) {
    const query = args.join(' ').trim()
    if (query.length === 0) {
      throw new CliFailure('Usage: npm run -s ae -- demand ask "<question>"', {
        kind: 'INVALID_ARGUMENT',
        code: 'ask-usage',
      })
    }
    const threadId = options.threadId?.trim()
    if (options.threadId !== undefined && (threadId === undefined || threadId.length === 0)) {
      throw new CliFailure('Conversational continuation requires a non-empty --thread-id.', {
        kind: 'INVALID_ARGUMENT',
        code: 'ask-thread-id',
      })
    }
    return {
      query,
      ...(threadId === undefined ? {} : { threadId }),
    }
  }

  const threadId = options.threadId?.trim()
  const operationRef = options.operationRef?.trim()
  const candidateSetDigest = options.candidateDigest?.trim()
  if (threadId === undefined || threadId.length === 0
    || operationRef === undefined || operationRef.length === 0
    || candidateSetDigest === undefined || candidateSetDigest.length === 0) {
    throw new CliFailure(
      'Machine-selected follow-up requires --thread-id, --operation-ref, and --candidate-digest together.',
      { kind: 'INVALID_ARGUMENT', code: 'ask-selection-args' },
    )
  }
  if (args.length !== 1 || args[0]!.trim().length === 0) {
    throw new CliFailure(
      'Machine-selected follow-up requires one JSON input object after the selection flags.',
      { kind: 'INVALID_ARGUMENT', code: 'ask-selection-input' },
    )
  }

  let input: unknown
  try {
    input = JSON.parse(args[0]!)
  } catch {
    throw new CliFailure('Follow-up selection input must be valid JSON.', {
      kind: 'INVALID_ARGUMENT',
      code: 'ask-selection-input',
    })
  }
  if (!isRecord(input)) {
    throw new CliFailure('Follow-up selection input must be one JSON object.', {
      kind: 'INVALID_ARGUMENT',
      code: 'ask-selection-input',
    })
  }

  return {
    threadId,
    query: JSON.stringify({ operationRef, input, candidateSetDigest }),
  }
}

/** /api/answer/turn streams AI SDK UI message chunks rather than a JSON document. */
export async function runAskCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const request = buildAskRequest(args, options)
  const { query } = request
  const origin = new URL(options.baseUrl).origin
  const answerSession = readAnswerSessions()[origin]

  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch(`${options.baseUrl}/api/answer/turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-AE-Turn-Key': randomUUID(),
        ...(answerSession === undefined
          ? {}
          : { Cookie: `${ANSWER_SESSION_COOKIE}=${encodeURIComponent(answerSession)}` }),
      },
      body: JSON.stringify({
        ...(request.threadId === undefined ? {} : { threadId: request.threadId }),
        query,
      }),
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

  const nextAnswerSession = answerSessionFrom(response)
  if (nextAnswerSession !== undefined && nextAnswerSession !== answerSession) {
    saveAnswerSession(origin, nextAnswerSession)
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

  if (projection.problem !== undefined) throw cliFailureForProblem(projection.problem)
  printHumanProjection(projection)
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
        const {
          oneLine,
          summary,
          nextStep,
          operationCandidates,
          operationCandidatesDigest,
          operationOutcome,
          operationSelection,
        } = event.answer
        if (
          oneLine === undefined
          && summary === undefined
          && nextStep === undefined
          && operationCandidates === undefined
          && operationOutcome === undefined
          && operationSelection === undefined
        ) {
          result = undefined
          status = 'error'
          problem = buildAnswerTurnProblem('answer_turn_failed')
          break
        }
        result = {
          ...(oneLine === undefined ? {} : { oneLine }),
          ...(summary === undefined ? {} : { summary }),
          ...(nextStep === undefined ? {} : { nextStep }),
          ...(operationCandidates === undefined ? {} : { operationCandidates }),
          ...(operationCandidatesDigest === undefined ? {} : { operationCandidatesDigest }),
          ...(operationOutcome === undefined ? {} : { operationOutcome }),
          ...(operationSelection === undefined ? {} : { operationSelection }),
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
    if (projection.result.operationCandidatesDigest !== undefined) {
      line(`  candidate digest: ${projection.result.operationCandidatesDigest}`)
    }
    if (projection.result.operationCandidates !== undefined) {
      for (const candidate of projection.result.operationCandidates) {
        line(`  candidate ${candidate.rank}: ${candidate.operationRef} · ${candidate.business.name} · ${candidate.operationId}`)
      }
    }
    if (projection.result.operationOutcome !== undefined) {
      const outcome = projection.result.operationOutcome
      line(`  outcome: ${outcome.result.kind} · ${outcome.operationRef}`)
      line(`  outcome digest: ${outcome.resultDigest}`)
    }
    if (projection.result.operationSelection !== undefined) {
      const selection = projection.result.operationSelection
      line(`  selection: ${selection.operationRef} · ${selection.toolId}`)
      if (selection.candidateSetDigest !== undefined) {
        line(`  selection candidate digest: ${selection.candidateSetDigest}`)
      }
    }
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
