import { roundNonNegative2 } from '@/modules/common/round-nonnegative-2'
import type { HarnessModelRequestRecord } from '@/modules/harness/public'
import type { AnswerWorkStep } from '@/modules/answer/public'
import type { AnswerTurnTimingEntry } from '../answer-thread.schema'
import type { TurnTimingCollector } from './turns/types'

export function appendModelRequests(
  prior: readonly HarnessModelRequestRecord[] | undefined,
  incoming: readonly HarnessModelRequestRecord[],
): readonly HarnessModelRequestRecord[] {
  const priorRequests = prior ?? []
  const offset = priorRequests.length
  return [
    ...priorRequests,
    ...incoming.map((request, index) => ({
      ...request,
      seq: offset + (request.seq ?? index),
    })),
  ]
}

export function withWorkStepDuration(step: AnswerWorkStep): AnswerWorkStep {
  if (
    step.durationMs !== undefined ||
    step.startedAtMs === undefined ||
    step.completedAtMs === undefined
  ) {
    return step
  }

  return {
    ...step,
    durationMs: Math.max(0, step.completedAtMs - step.startedAtMs),
  }
}

export function createTurnTimingCollector(): TurnTimingCollector {
  const entries: AnswerTurnTimingEntry[] = []
  const record: TurnTimingCollector['record'] = (
    name,
    durationMs,
    metadata,
  ) => {
    entries.push({
      name,
      durationMs: roundNonNegative2(durationMs),
      atMs: Date.now(),
      ...(metadata === undefined ? {} : { metadata }),
    })
  }

  return {
    start: (name, metadata) => {
      const started = Date.now()
      return (endMetadata) => {
        record(name, Date.now() - started, {
          ...(metadata ?? {}),
          ...(endMetadata ?? {}),
        })
      }
    },
    record,
    add: (incoming, metadata) => {
      for (const entry of incoming) {
        entries.push({
          ...entry,
          ...(metadata === undefined
            ? {}
            : {
                metadata: {
                  ...(entry.metadata ?? {}),
                  ...metadata,
                },
              }),
        })
      }
    },
    entries: () => [...entries],
  }
}
