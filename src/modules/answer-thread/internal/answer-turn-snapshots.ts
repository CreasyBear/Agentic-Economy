import {
  emitSnapshotEvents,
  type AnswerEvent,
  type AnswerSnapshot,
} from '@/modules/answer/public'
import type { LiveAnswerHarnessOperation } from './answer-harness-operation'
import type {
  SnapshotPlanMetadata,
  SnapshotAssemblyPlan,
  TurnPathId,
  TurnTimingCollector,
  WorkStepEmitter,
} from './turns/types'

export type AnswerTurnSnapshotStreamInput = {
  signal: AbortSignal | undefined
  send: (event: AnswerEvent) => void
  timings: TurnTimingCollector
}

export type AnswerTurnSnapshotAssemblyInput = AnswerTurnSnapshotStreamInput & {
  workLog: WorkStepEmitter
  harness?: LiveAnswerHarnessOperation
}

export type AnswerTurnSnapshotDeferInput = AnswerTurnSnapshotAssemblyInput & {
  deferAssembly?: boolean
}

const TURN_PATH_IDS = [
  'clarification',
  'retrieval_first',
  'retrieval_empty',
  'frozen_filter',
  'frozen_compare',
  'agent',
  'boundary_explain',
  'unsupported',
] as const satisfies readonly TurnPathId[]

function isTurnPathId(path: string): path is TurnPathId {
  return (TURN_PATH_IDS as readonly string[]).includes(path)
}

export function snapshotStreamPauseMs(path: string): number {
  if (!isTurnPathId(path)) {
    return 140
  }
  switch (path) {
    case 'clarification':
    case 'boundary_explain':
    case 'unsupported':
      return 250
    case 'retrieval_first':
    case 'retrieval_empty':
    case 'frozen_filter':
    case 'frozen_compare':
    case 'agent':
      return 140
    default: {
      const _exhaustive: never = path
      return _exhaustive
    }
  }
}

export async function emitTimedSnapshot(
  input: AnswerTurnSnapshotStreamInput,
  snapshot: AnswerSnapshot,
  path: string,
  metadata: SnapshotPlanMetadata = {},
): Promise<void> {
  const stopSseTiming = input.timings.start('sse.emit_snapshot', {
    path,
    providerCount: snapshot.providers.length,
  })
  let eventCount = 0
  try {
    for await (const event of emitSnapshotEvents(snapshot, {
      emitThinking: true,
      emitComplete: false,
      pauseMs: snapshotStreamPauseMs(path),
      ...(metadata.plan === undefined ? {} : { plan: metadata.plan }),
      ...(metadata.planMode === undefined
        ? {}
        : { responseMode: metadata.planMode }),
    })) {
      if (input.signal?.aborted === true) {
        break
      }
      eventCount += 1
      input.send(event)
    }
  } finally {
    stopSseTiming({ eventCount })
  }
}

export async function emitOrDeferSnapshot(
  input: AnswerTurnSnapshotDeferInput,
  snapshot: AnswerSnapshot,
  path: string,
  metadata: SnapshotPlanMetadata = {},
): Promise<SnapshotAssemblyPlan | undefined> {
  if (input.deferAssembly === true) {
    return { path, metadata }
  }
  await emitSnapshotWithAssembly(input, snapshot, path, metadata)
  return undefined
}

export async function emitSnapshotWithAssembly(
  input: AnswerTurnSnapshotAssemblyInput,
  snapshot: AnswerSnapshot,
  path: string,
  metadata: SnapshotPlanMetadata = {},
): Promise<void> {
  const assemble = async (): Promise<void> => {
    const startedAt = Date.now()
    input.workLog.emit({
      id: 'assemble.answer',
      phase: 'assemble',
      status: 'running',
      title: 'Putting together the answer',
      summary: 'Putting the answer together from the details.',
      detailRows: [
        { label: 'Matches', value: String(snapshot.providers.length) },
      ],
      relatedProviderSlugs: snapshot.providers.map((provider) => provider.slug),
      startedAtMs: startedAt,
    })

    await emitTimedSnapshot(input, snapshot, path, metadata)

    input.workLog.emit({
      id: 'assemble.answer',
      phase: 'assemble',
      status: input.signal?.aborted === true ? 'stopped' : 'complete',
      title: 'Putting together the answer',
      summary:
        input.signal?.aborted === true
          ? 'The answer stopped before it finished.'
          : 'The answer is ready.',
      detailRows: [
        { label: 'Matches', value: String(snapshot.providers.length) },
        { label: 'Next step', value: snapshot.nextStep },
      ],
      relatedProviderSlugs: snapshot.providers.map((provider) => provider.slug),
      startedAtMs: startedAt,
      completedAtMs: Date.now(),
    })
  }

  if (input.harness === undefined) {
    await assemble()
    return
  }
  await input.harness.phase('assemble', assemble)
}
