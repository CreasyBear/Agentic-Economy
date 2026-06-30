import type { AnswerArtifact } from '../answer-schema'
import type { AnswerSnapshot } from '../answer-synthesizer'
import { resolveLayoutProfile, type AnswerLayoutProfile } from './answer-layout-profile'
import { buildArtifactsFromSnapshot } from './snapshot-artifacts'

export type AnswerMessagePart =
  | { kind: 'one-line'; text: string }
  | { kind: 'provider-cards'; providers: AnswerSnapshot['providers']; scroll?: boolean }
  | { kind: 'location-map'; label: string; placeQuery: string }
  | { kind: 'prose'; block: 'summary'; text: string }
  | { kind: 'what-to-do-now'; text: string; compact?: boolean }
  | { kind: 'agent-json'; url: string }
  | { kind: 'protected-by-ae' }
  | { kind: 'empty-state'; text: string }

export type AnswerMessagePartsResult = {
  profile: AnswerLayoutProfile
  parts: AnswerMessagePart[]
}

export function buildMessagePartsFromSnapshot(snapshot: AnswerSnapshot): AnswerMessagePartsResult {
  const profile = resolveLayoutProfile({
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    providerCount: snapshot.providers.length,
  })

  const artifacts = buildArtifactsFromSnapshot({ ...snapshot, layoutProfile: profile })
  const parts = artifactsToMessageParts(artifacts, profile)
  return { profile, parts }
}

export function artifactsToMessageParts(
  artifacts: readonly AnswerArtifact[],
  profile: AnswerLayoutProfile,
): AnswerMessagePart[] {
  const scrollCards = profile === 'refinement_compact' || profile === 'compare_pair'
  const compactNextStep =
    profile === 'refinement_compact' || profile === 'boundary_explain' || profile === 'compare_pair'
  const parts: AnswerMessagePart[] = []

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case 'one-line':
        parts.push({ kind: 'one-line', text: artifact.text })
        break
      case 'provider-cards':
        parts.push({
          kind: 'provider-cards',
          providers: artifact.providers,
          ...(scrollCards ? { scroll: true } : {}),
        })
        break
      case 'location-map':
        parts.push({ kind: 'location-map', label: artifact.label, placeQuery: artifact.placeQuery })
        break
      case 'prose':
        if (artifact.block === 'summary') {
          parts.push({ kind: 'prose', block: 'summary', text: artifact.text })
        }
        break
      case 'what-to-do-now':
        parts.push({
          kind: 'what-to-do-now',
          text: artifact.text,
          ...(compactNextStep ? { compact: true } : {}),
        })
        break
      case 'agent-json':
        parts.push({ kind: 'agent-json', url: artifact.url })
        break
      case 'protected-by-ae':
        parts.push({ kind: 'protected-by-ae' })
        break
      default: {
        const _exhaustive: never = artifact
        void _exhaustive
      }
    }
  }

  if (profile === 'empty_state' && !parts.some((part) => part.kind === 'empty-state')) {
    const summary = parts.find((part) => part.kind === 'prose')
    parts.push({
      kind: 'empty-state',
      text: summary?.kind === 'prose' ? summary.text : 'No listed businesses match that yet.',
    })
  }

  return parts
}
