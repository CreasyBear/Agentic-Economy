import type { AnswerArtifact, AnswerCompareField } from '../answer-schema'
import type { AnswerSnapshot, AnswerSource } from '../answer-synthesizer'
import { resolveLayoutProfile, type AnswerLayoutProfile } from './answer-layout-profile'
import {
  buildArtifactsFromSnapshot,
  filterArtifactsForBudget,
  getArtifactBudgetForArtifacts,
  getArtifactBudgetForSnapshot,
  type AnswerArtifactBudget,
} from './snapshot-artifacts'

export type AnswerMessagePart =
  | { kind: 'one-line'; text: string }
  | { kind: 'selected-provider'; provider: AnswerSource }
  | { kind: 'provider-cards'; providers: AnswerSnapshot['providers']; scroll?: boolean }
  | {
      kind: 'provider-compare-table'
      providers: readonly AnswerSource[]
      fields?: readonly AnswerCompareField[]
    }
  | { kind: 'recovery-prompts'; title?: string; prompts: readonly { label: string; query: string }[]; links?: readonly { label: string; href: '/claim' | '/registry' }[] }
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

export function buildMessagePartsFromSnapshot(
  snapshot: AnswerSnapshot,
  budgetOverride?: AnswerArtifactBudget,
): AnswerMessagePartsResult {
  const profile = resolveLayoutProfile({
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    providerCount: snapshot.providers.length,
  })

  const budget = getArtifactBudgetForSnapshot({ ...snapshot, layoutProfile: profile }, budgetOverride)
  const artifacts = buildArtifactsFromSnapshot({ ...snapshot, layoutProfile: profile }, budget)
  const parts = artifactsToMessageParts(artifacts, profile, budget)
  return { profile, parts }
}

export function artifactsToMessageParts(
  artifacts: readonly AnswerArtifact[],
  profile: AnswerLayoutProfile,
  budgetOverride?: AnswerArtifactBudget,
): AnswerMessagePart[] {
  const scrollCards = profile === 'refinement_compact' || profile === 'compare_pair'
  const compactNextStep =
    profile === 'clarification' ||
    profile === 'refinement_compact' ||
    profile === 'boundary_explain' ||
    profile === 'compare_pair'
  const budget = getArtifactBudgetForArtifacts(profile, artifacts, budgetOverride)
  const budgetedArtifacts = filterArtifactsForBudget(artifacts, budget)
  const parts: AnswerMessagePart[] = []

  for (const artifact of budgetedArtifacts) {
    switch (artifact.kind) {
      case 'one-line':
        parts.push({ kind: 'one-line', text: artifact.text })
        break
      case 'selected-provider':
        parts.push({ kind: 'selected-provider', provider: artifact.provider })
        break
      case 'provider-cards':
        parts.push({
          kind: 'provider-cards',
          providers: artifact.providers,
          ...(scrollCards ? { scroll: true } : {}),
        })
        break
      case 'provider-compare-table':
        parts.push({
          kind: 'provider-compare-table',
          providers: artifact.providers,
          ...(artifact.fields === undefined ? {} : { fields: artifact.fields }),
        })
        break
      case 'recovery-prompts':
        parts.push({
          kind: 'recovery-prompts',
          prompts: artifact.prompts,
          ...(artifact.title === undefined ? {} : { title: artifact.title }),
          ...(artifact.links === undefined ? {} : { links: artifact.links }),
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
