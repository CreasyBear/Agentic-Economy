import type { AnswerArtifact, AnswerCompareField } from '../answer-schema'
import type { AnswerSnapshot, AnswerSource } from '../answer-synthesizer'
import { resolveLayoutProfile, type AnswerLayoutProfile } from './answer-layout-profile'
import {
  buildArtifactsFromSnapshot,
  filterArtifactsForBudget,
  getDefaultArtifactBudgetForLayoutProfile,
  type AnswerArtifactBudget,
} from './snapshot-artifacts'

export type AnswerMessagePart =
  | { kind: 'one-line'; text: string }
  | { kind: 'provider-cards'; providers: AnswerSnapshot['providers']; scroll?: boolean }
  | {
      kind: 'provider-compare-table'
      providers: readonly AnswerSource[]
      fields?: readonly AnswerCompareField[]
    }
  | { kind: 'service-area-fit'; providers: readonly AnswerSource[]; locationLabel?: string }
  | { kind: 'next-step-menu'; providers: readonly AnswerSource[] }
  | { kind: 'confirmation-checklist'; title?: string; items: readonly string[] }
  | { kind: 'recovery-prompts'; title?: string; prompts: readonly { label: string; query: string }[] }
  | { kind: 'route-perspective'; providers: readonly AnswerSource[]; query?: string }
  | { kind: 'published-details-rail'; providers: readonly AnswerSource[] }
  | { kind: 'provider-tradeoff-list'; providers: readonly AnswerSource[] }
  | {
      kind: 'message-starter'
      provider: AnswerSource
      need: string
      location?: string
      timing?: string
    }
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

  const budget = budgetOverride ?? getDefaultArtifactBudgetForLayoutProfile(profile)
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
  const budget = budgetOverride ?? getDefaultArtifactBudgetForLayoutProfile(profile)
  const budgetedArtifacts = filterArtifactsForBudget(artifacts, budget)
  const parts: AnswerMessagePart[] = []

  for (const artifact of budgetedArtifacts) {
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
      case 'provider-compare-table':
        parts.push({
          kind: 'provider-compare-table',
          providers: artifact.providers,
          ...(artifact.fields === undefined ? {} : { fields: artifact.fields }),
        })
        break
      case 'service-area-fit':
        parts.push({
          kind: 'service-area-fit',
          providers: artifact.providers,
          ...(artifact.locationLabel === undefined ? {} : { locationLabel: artifact.locationLabel }),
        })
        break
      case 'next-step-menu':
        parts.push({ kind: 'next-step-menu', providers: artifact.providers })
        break
      case 'confirmation-checklist':
        parts.push({
          kind: 'confirmation-checklist',
          items: artifact.items,
          ...(artifact.title === undefined ? {} : { title: artifact.title }),
        })
        break
      case 'recovery-prompts':
        parts.push({
          kind: 'recovery-prompts',
          prompts: artifact.prompts,
          ...(artifact.title === undefined ? {} : { title: artifact.title }),
        })
        break
      case 'route-perspective':
        parts.push({
          kind: 'route-perspective',
          providers: artifact.providers,
          ...(artifact.query === undefined ? {} : { query: artifact.query }),
        })
        break
      case 'published-details-rail':
        parts.push({ kind: 'published-details-rail', providers: artifact.providers })
        break
      case 'provider-tradeoff-list':
        parts.push({ kind: 'provider-tradeoff-list', providers: artifact.providers })
        break
      case 'message-starter':
        parts.push({
          kind: 'message-starter',
          provider: artifact.provider,
          need: artifact.need,
          ...(artifact.location === undefined ? {} : { location: artifact.location }),
          ...(artifact.timing === undefined ? {} : { timing: artifact.timing }),
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
