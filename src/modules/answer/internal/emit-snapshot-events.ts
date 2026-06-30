import { splitSentences } from './text-utils'
import type { AnswerArtifact } from '../answer-schema'
import { computeLayoutProfile } from './answer-layout-profile'
import { buildArtifactsFromSnapshot } from './snapshot-artifacts'
import type { AnswerEvent, AnswerSnapshot, AnswerSynthesizerFollowUpIntent } from '../answer-synthesizer'

export async function* emitSnapshotEvents(
  snapshot: AnswerSnapshot,
  options: { emitThinking?: boolean } = {},
): AsyncIterable<AnswerEvent> {
  const emitThinking = options.emitThinking !== false

  if (emitThinking) {
    yield { type: 'thinking', step: 'write', label: 'Writing answer…' }
  }

  yield { type: 'one-line', oneLine: snapshot.oneLine }
  yield { type: 'sources', providers: snapshot.providers }

  for (const delta of splitSentences(snapshot.summary)) {
    yield { type: 'summary-delta', delta }
  }

  yield { type: 'next-step', nextStep: snapshot.nextStep }

  for (const artifact of buildArtifactsFromSnapshot(snapshot)) {
    yield { type: 'artifact', artifact }
  }

  yield { type: 'complete', answer: snapshot }
}

export function mergeProseIntoSnapshot(input: {
  query: string
  evidence: {
    providers: AnswerSnapshot['providers']
    agentJsonUrl: string
  }
  oneLine: string
  summary: string
  nextStep: string
  compactLayout?: boolean
  followUpIntent?: AnswerSynthesizerFollowUpIntent
}): AnswerSnapshot {
  const compactLayout = input.compactLayout === true
  const layoutProfile = computeLayoutProfile({
    ...(compactLayout ? { compactLayout: true } : {}),
    ...(input.followUpIntent === undefined ? {} : { followUpIntent: input.followUpIntent }),
    providerCount: input.evidence.providers.length,
  })

  return {
    query: input.query,
    oneLine: input.oneLine,
    providers: input.evidence.providers,
    summary: input.summary,
    nextStep: input.nextStep,
    agentJsonUrl: input.evidence.agentJsonUrl,
    ...(compactLayout ? { compactLayout: true } : {}),
    layoutProfile,
  }
}

export type { AnswerArtifact }
