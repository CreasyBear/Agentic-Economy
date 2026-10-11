import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { projectCliJourneyProblem, projectJourneyProblem } from '@/modules/actions/contract'
import type { CliOptions } from '../lib/args'
import { lastChatThread, rememberChatThread } from '../lib/config'
import { consumeChatStream } from '../lib/chat-stream'
import { CliFailure, cliFailureToProblem, sanitizeText } from '../lib/output'
import { requireAgentAccessKey } from './status'

type ChatEvent = Readonly<Record<string, unknown> & { type: string }>

function renderChatEvent(event: ChatEvent, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(event)}\n`)
    return
  }
  switch (event.type) {
    case 'start': process.stdout.write(sanitizeText(`Turn ${event.turnRef} (thread ${event.threadId})\n`)); break
    case 'text-delta': process.stdout.write(sanitizeText(String(event.text))); break
    case 'reasoning-summary': process.stderr.write(sanitizeText(`\nThinking: ${event.text}\n`)); break
    case 'tool-call': process.stdout.write(sanitizeText(`\nTool: ${event.toolName}\n`)); break
    case 'tool-result': process.stdout.write(sanitizeText(`\nTool result: ${event.toolName}\n`)); break
    case 'quote': process.stdout.write(sanitizeText(`\nQuote ${event.quoteRef}: AUD ${event.maxSpendAud}\n`)); break
    case 'receipt': process.stdout.write(sanitizeText(`\nCall ${event.callRef}: payment ${event.payment}\n`)); break
    case 'state': process.stdout.write(sanitizeText(`\nState: ${event.workState}\n`)); break
    case 'finish': process.stdout.write(sanitizeText(`\nTurn ${event.state}\n`)); break
    case 'error': process.stderr.write(`\nChat error: ${JSON.stringify(event.problem)}\n`); break
  }
}

function chatFailure(error: unknown, origin: string): unknown {
  const failure = error instanceof CliFailure
    ? error : new CliFailure('Chat request failed.', { kind: 'UNAVAILABLE', code: 'chat_transport_failure' })
  return projectCliJourneyProblem(cliFailureToProblem(failure, { origin }), {
    origin, source: 'local', exitCode: failure.exitCode,
  })
}

async function readPrompt(): Promise<string> {
  if (process.stdin.isTTY) {
    const input = createInterface({ input: process.stdin, output: process.stderr })
    try { return await input.question('You: ') } finally { input.close() }
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 16_000) throw new CliFailure('Chat prompt is too large.', { kind: 'PAYLOAD_TOO_LARGE', code: 'chat_prompt_too_large' })
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

export async function runChatCommand(args: readonly string[], options: CliOptions): Promise<number> {
  if (args.length > 1 || options.continueThread && options.threadId || options.threadId?.trim() === '' ||
    args[0]?.trim() === '') {
    throw new CliFailure('Usage: ae chat [prompt] [--thread-id <id> | --continue] [--json]', { kind: 'INVALID_ARGUMENT', code: 'chat_usage' })
  }
  const prompt = args[0] ?? await readPrompt()
  if (prompt.trim().length === 0) throw new CliFailure('Chat prompt must not be empty.', { kind: 'INVALID_ARGUMENT', code: 'chat_prompt_required' })
  const threadId = options.continueThread ? lastChatThread(options.baseUrl) : options.threadId
  if (options.continueThread && threadId === undefined) {
    throw new CliFailure('No previous chat thread for this origin.', { kind: 'FAILED_PRECONDITION', code: 'chat_thread_missing' })
  }
  const apiKey = requireAgentAccessKey('chat', options)
  const clientTurnId = randomUUID()
  const body = JSON.stringify({ prompt, clientTurnId, ...(threadId === undefined ? {} : { threadId }) })
  const controller = new AbortController()
  let turnRef: string | undefined
  let interrupted = false
  let hasOutput = false
  const emit = (event: ChatEvent) => { hasOutput = true; renderChatEvent(event, options.json) }
  const interrupt = () => { interrupted = true; controller.abort() }
  process.once('SIGINT', interrupt)
  try {
    let response: Response
    try {
      response = await fetch(`${options.baseUrl}/api/v1/chat/turns`, {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'text/event-stream', 'Content-Type': 'application/json' }, body,
      })
    } catch (error) {
      if (interrupted) throw error
      // One retry of transport failure only; the identical clientTurnId/material is reserved on the server.
      response = await fetch(`${options.baseUrl}/api/v1/chat/turns`, {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'text/event-stream', 'Content-Type': 'application/json' }, body,
      })
    }
    if (!response.ok) {
      const remote = await response.json() as unknown
      const requestId = response.headers.get('x-ae-request-id')
      const problem = projectJourneyProblem({
        ...(remote as object), ...(requestId === null ? {} : { requestId }),
      }, { origin: options.baseUrl, source: 'remote' })
      emit({ type: 'error', problem })
      return 1
    }
    return await consumeChatStream(response, options.baseUrl, emit, (identity) => {
      turnRef = identity.turnRef
      rememberChatThread(options.baseUrl, identity.threadId)
    })
  } catch (error) {
    if (!interrupted) {
      if (hasOutput) {
        emit({ type: 'error', problem: chatFailure(error, options.baseUrl) })
        return 1
      }
      if (options.json) {
        emit({ type: 'error', problem: chatFailure(error, options.baseUrl) })
        return 1
      }
      throw error
    }
    return 1
  } finally {
    process.removeListener('SIGINT', interrupt)
    if (interrupted) {
      if (turnRef !== undefined) {
        try {
          const cancel = await fetch(`${options.baseUrl}/api/v1/chat/turns/${encodeURIComponent(turnRef)}`, {
            method: 'DELETE', redirect: 'manual', headers: { Authorization: `Bearer ${apiKey}` },
          })
          if (cancel.ok) {
            const stopped = await cancel.json() as { kind: 'stopped' | 'in_flight'; inFlightEffects: readonly { callRef: string }[] }
            if (stopped.kind === 'stopped') emit({ type: 'finish', turnRef, state: 'canceled', stopped: stopped.kind, inFlightEffects: stopped.inFlightEffects })
            else emit({ type: 'error', problem: { code: 'chat_cancel_in_flight', turnRef }, stopped: stopped.kind, inFlightEffects: stopped.inFlightEffects })
          } else emit({ type: 'error', problem: { code: 'chat_cancel_failed', turnRef } })
        } catch { emit({ type: 'error', problem: { code: 'chat_cancel_unavailable', turnRef } }) }
      } else emit({ type: 'error', problem: { code: 'chat_turn_unknown', detail: 'Ctrl-C before turn identity. Retry with the same clientTurnId is not available from this invocation.' } })
    }
  }
}
