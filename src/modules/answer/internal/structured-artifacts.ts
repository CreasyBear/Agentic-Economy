import type { AnswerArtifact } from '../answer-schema'
import type { AnswerSource } from '../answer-synthesizer'

export function artifactsFromStructured(partial: {
  oneLine?: string
  providers?: readonly AnswerSource[]
  summary?: string
  whatToDoNow?: string
  locationMap?: { label: string; placeQuery: string }
  agentJsonUrl?: string
}): AnswerArtifact[] {
  const artifacts: AnswerArtifact[] = []

  if (partial.oneLine !== undefined) {
    artifacts.push({ kind: 'one-line', text: partial.oneLine })
  }
  if (partial.providers !== undefined && partial.providers.length > 0) {
    artifacts.push({ kind: 'provider-cards', providers: [...partial.providers] })
  }
  if (partial.locationMap !== undefined) {
    artifacts.push({ kind: 'location-map', ...partial.locationMap })
  }
  if (partial.summary !== undefined && partial.summary.length > 0) {
    artifacts.push({ kind: 'prose', block: 'summary', text: partial.summary })
  }
  if (partial.whatToDoNow !== undefined && partial.whatToDoNow.length > 0) {
    artifacts.push({ kind: 'what-to-do-now', text: partial.whatToDoNow })
  }
  if (partial.agentJsonUrl !== undefined) {
    artifacts.push({ kind: 'agent-json', url: partial.agentJsonUrl })
  }
  artifacts.push({ kind: 'protected-by-ae' })

  return artifacts
}
