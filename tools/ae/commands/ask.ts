import { readAnswerTurnFrames } from '@/modules/answer/public'

import type { CliOptions } from '../lib/args'
import { CliFailure, heading, line, printJson } from '../lib/output'

/** /api/answer/turn streams AI SDK UI message chunks rather than a JSON document. */
export async function runAskCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const query = args.join(' ').trim()
  if (query.length === 0) throw new CliFailure('Usage: ae ask "<question>"')

  const startedAt = Date.now()
  const response = await fetch(`${options.baseUrl}/api/answer/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new CliFailure(`/api/answer/turn returned ${response.status}\n${text.slice(0, 600)}`)
  }

  const events = await readTurnEvents(response)
  const durationMs = Date.now() - startedAt

  if (options.json) {
    printJson({ query, durationMs, events })
    return
  }

  heading(`Ask "${query}" (${durationMs}ms, ${events.length} events)`)
  for (const event of events) {
    const kind = typeof event === 'object' && event !== null && 'type' in event ? String(event.type) : 'event'
    line(`  ${kind}: ${JSON.stringify(event).slice(0, 220)}`)
  }
}

async function readTurnEvents(response: Response): Promise<readonly unknown[]> {
  if (response.body === null) return []
  const events: unknown[] = []
  for await (const frame of readAnswerTurnFrames(response.body)) {
    events.push(frame.event)
  }
  return events
}
