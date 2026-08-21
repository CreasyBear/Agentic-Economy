import type { AnswerArtifact } from '../answer-schema'
import type { AnswerSnapshot } from '../answer-synthesizer'
import { resolveLayoutProfile, type AnswerLayoutProfile } from './answer-layout-profile'
import {
  projectAnswerOperationResult,
  type AnswerOperationResultView,
} from './operation-result-presentation'

type AnswerMessagePartFromArtifact =
  | Exclude<AnswerArtifact, { kind: 'provider-cards' | 'operation-outcome' | 'what-to-do-now' }>
  | (Extract<AnswerArtifact, { kind: 'provider-cards' }> & { scroll?: boolean })
  | (Extract<AnswerArtifact, { kind: 'operation-outcome' }> & { resultView: AnswerOperationResultView })
  | (Extract<AnswerArtifact, { kind: 'what-to-do-now' }> & { compact?: boolean })

export type AnswerMessagePart = AnswerMessagePartFromArtifact | { kind: 'empty-state'; text: string }

export type AnswerMessagePartsResult = {
  profile: AnswerLayoutProfile
  parts: AnswerMessagePart[]
}

export function buildMessagePartsFromSnapshot(
  snapshot: AnswerSnapshot,
): AnswerMessagePartsResult {
  const profile = resolveLayoutProfile({
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    providerCount: snapshot.providers.length,
  })
  return { profile, parts: artifactsToMessageParts(kernelArtifactsFromSnapshot(snapshot), profile) }
}

export function kernelArtifactsFromSnapshot(snapshot: AnswerSnapshot): AnswerArtifact[] {
  const artifacts: AnswerArtifact[] = [
    { kind: 'one-line', text: snapshot.oneLine },
    { kind: 'prose', block: 'summary', text: snapshot.summary },
    { kind: 'what-to-do-now', text: snapshot.nextStep },
  ]
  if (snapshot.operationCandidates !== undefined && snapshot.operationCandidates.length > 0) {
    artifacts.push({
      kind: 'operation-candidates',
      candidates: snapshot.operationCandidates,
      ...(snapshot.operationCandidatesDigest === undefined
        ? {}
        : { operationCandidatesDigest: snapshot.operationCandidatesDigest }),
      ...(snapshot.operationSelection === undefined ? {} : { selection: snapshot.operationSelection }),
    })
  }
  if (snapshot.operationOutcome !== undefined) {
    artifacts.push({ kind: 'operation-outcome', outcome: snapshot.operationOutcome })
  }
  if (snapshot.agentJsonUrl.trim().length > 0) {
    artifacts.push({ kind: 'agent-json', url: snapshot.agentJsonUrl })
  }
  return artifacts
}

export function artifactsToMessageParts(
  artifacts: readonly AnswerArtifact[],
  profile: AnswerLayoutProfile,
): AnswerMessagePart[] {
  const parts: AnswerMessagePart[] = []

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case 'one-line':
        parts.push({ kind: 'one-line', text: artifact.text })
        break
      case 'prose':
        if (artifact.block === 'summary') {
          parts.push({ kind: 'prose', block: 'summary', text: artifact.text })
        }
        break
      case 'what-to-do-now':
        parts.push({ kind: 'what-to-do-now', text: artifact.text })
        break
      case 'operation-candidates':
        parts.push({
          kind: 'operation-candidates',
          candidates: artifact.candidates,
          ...(artifact.operationCandidatesDigest === undefined
            ? {}
            : { operationCandidatesDigest: artifact.operationCandidatesDigest }),
          ...(artifact.selection === undefined ? {} : { selection: artifact.selection }),
        })
        break
      case 'operation-outcome':
        parts.push({
          kind: 'operation-outcome',
          outcome: artifact.outcome,
          resultView: projectAnswerOperationResult(artifact.outcome),
        })
        break
      case 'agent-json':
        parts.push({ kind: 'agent-json', url: artifact.url })
        break
      case 'selected-provider':
      case 'imported-claims':
      case 'provider-cards':
      case 'provider-compare-table':
      case 'operation-comparison':
      case 'operation-plan':
      case 'recovery-prompts':
      case 'location-map':
      case 'protected-by-ae':
        break
      default: {
        const _exhaustive: never = artifact
        void _exhaustive
      }
    }
  }

  void profile
  return parts
}
