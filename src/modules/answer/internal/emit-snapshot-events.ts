import type {
  AnswerEvent,
  AnswerPlanEvent,
  AnswerResponseMode,
  AnswerSnapshot,
} from '../answer-synthesizer'

type EmitSnapshotPlan = Pick<AnswerPlanEvent, 'mode' | 'providerBudget' | 'artifactBudget'>

type EmitSnapshotEventsOptions = {
  emitThinking?: boolean
  emitComplete?: boolean
  pauseMs?: number
  plan?: EmitSnapshotPlan
  responseMode?: AnswerResponseMode
}

const TEXT_ARTIFACT_KINDS = ['one-line', 'prose', 'what-to-do-now', 'operation-outcome'] as const

export async function* emitSnapshotEvents(
  snapshot: AnswerSnapshot,
  options: EmitSnapshotEventsOptions = {},
): AsyncIterable<AnswerEvent> {
  const emitThinking = options.emitThinking !== false
  const emitComplete = options.emitComplete !== false
  const pauseMs = options.pauseMs ?? 140
  const mode = options.plan?.mode ?? options.responseMode ?? 'answer'

  yield {
    type: 'plan',
    mode,
    layoutProfile: snapshot.layoutProfile ?? 'data_answer',
    providerBudget: options.plan?.providerBudget ?? { searchLimit: 0, visibleLimit: 0 },
    artifactBudget: options.plan?.artifactBudget ?? {
      layoutProfile: snapshot.layoutProfile ?? 'data_answer',
      allowedKinds: TEXT_ARTIFACT_KINDS,
      maxArtifactCount: TEXT_ARTIFACT_KINDS.length,
      maxProviderCards: 0,
    },
  }

  if (emitThinking) {
    yield { type: 'thinking', step: 'write', label: 'Putting together the answer…' }
  }

  yield { type: 'one-line', oneLine: snapshot.oneLine }
  await progressivePause(pauseMs)

  yield { type: 'next-step', nextStep: snapshot.nextStep }
  await progressivePause(pauseMs)
  for (const delta of snapshot.summary
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)) {
    yield { type: 'summary-delta', delta }
    await progressivePause(pauseMs)
  }

  if (snapshot.operationOutcome !== undefined) {
    yield {
      type: 'artifact',
      artifact: {
        kind: 'operation-outcome',
        outcome: snapshot.operationOutcome,
      },
    }
    await progressivePause(pauseMs)
  }

  if (emitComplete) {
    yield { type: 'complete', answer: snapshot }
  }
}

function progressivePause(pauseMs: number): Promise<void> {
  if (pauseMs <= 0 || process.env.NODE_ENV === 'test') {
    return Promise.resolve()
  }

  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, pauseMs)
  return promise
}
