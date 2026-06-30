import type { AnswerArtifact } from '../answer-schema'

/** Idempotent merge for streamed artifact events (one slot per kind; prose summary accumulates). */
export function mergeAnswerArtifact(
  existing: readonly AnswerArtifact[],
  incoming: AnswerArtifact,
): AnswerArtifact[] {
  if (incoming.kind === 'prose' && incoming.block === 'summary') {
    const withoutSummary = existing.filter(
      (artifact) => !(artifact.kind === 'prose' && artifact.block === 'summary'),
    )
    return [...withoutSummary, incoming]
  }

  const withoutKind = existing.filter((artifact) => artifact.kind !== incoming.kind)
  return [...withoutKind, incoming]
}
