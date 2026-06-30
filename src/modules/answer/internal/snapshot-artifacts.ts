import type { AnswerArtifact } from '../answer-schema'
import { buildAgentJsonUrl, type AnswerSnapshot } from '../answer-synthesizer'
import { isCompactLayoutProfile, resolveLayoutProfile } from './answer-layout-profile'
import { parseLocationIntent } from './location-intent'

export function buildArtifactsFromSnapshot(snapshot: AnswerSnapshot): AnswerArtifact[] {
  const profile = resolveLayoutProfile({
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    providerCount: snapshot.providers.length,
  })

  const compact = isCompactLayoutProfile(profile)
  const artifacts: AnswerArtifact[] = [
    { kind: 'one-line', text: snapshot.oneLine },
  ]

  if (snapshot.providers.length > 0) {
    artifacts.push({ kind: 'provider-cards', providers: [...snapshot.providers] })
  }

  if (!compact && profile !== 'empty_state') {
    const location = parseLocationIntent(snapshot.query)
    if (location !== undefined && snapshot.providers.length > 0) {
      artifacts.push({ kind: 'location-map', label: location.label, placeQuery: location.placeQuery })
    }
  }

  const showSummary =
    !compact &&
    snapshot.summary.length > 0 &&
    (profile === 'discovery_full' || profile === 'compare_pair' || profile === 'empty_state')

  if (showSummary) {
    artifacts.push({ kind: 'prose', block: 'summary', text: snapshot.summary })
  }

  if (snapshot.nextStep.length > 0) {
    artifacts.push({ kind: 'what-to-do-now', text: snapshot.nextStep })
  }

  return artifacts
}

export function buildAgentJsonUrlForQuery(query: string, limit?: number): string {
  return buildAgentJsonUrl(query, limit)
}
