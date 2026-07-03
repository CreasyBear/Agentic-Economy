import type { AnswerArtifact } from '../answer-schema'
import { buildAgentJsonUrl, type AnswerSnapshot } from '../answer-synthesizer'
import { isCompactLayoutProfile, resolveLayoutProfile, type AnswerLayoutProfile } from './answer-layout-profile'
import { parseLocationIntent } from './location-intent'

export type AnswerArtifactBudget = {
  layoutProfile: AnswerLayoutProfile
  allowedKinds: readonly AnswerArtifact['kind'][]
  maxArtifactCount: number
  maxProviderCards: number
}

const ANSWER_PROVIDER_CARD_LIMIT = 3
const COMPARE_PROVIDER_LIMIT = 2

const TEXT_ONLY_ARTIFACTS = ['one-line', 'prose', 'what-to-do-now'] as const
const ANSWER_ARTIFACTS = [
  'one-line',
  'provider-cards',
  'location-map',
  'prose',
  'what-to-do-now',
  'agent-json',
] as const
const COMPARE_ARTIFACTS = ['one-line', 'provider-compare-table', 'prose', 'what-to-do-now'] as const
const EMPTY_ARTIFACTS = ['one-line', 'prose', 'recovery-prompts', 'what-to-do-now', 'agent-json'] as const
const FILTER_ARTIFACTS = ['one-line', 'provider-cards', 'what-to-do-now'] as const

export function buildArtifactsFromSnapshot(
  snapshot: AnswerSnapshot,
  budgetOverride?: AnswerArtifactBudget,
): AnswerArtifact[] {
  const profile = budgetOverride?.layoutProfile ?? resolveLayoutProfile({
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    providerCount: snapshot.providers.length,
  })
  const budget = budgetOverride ?? getDefaultArtifactBudgetForLayoutProfile(profile)

  const compact = isCompactLayoutProfile(profile)
  const visibleProviderCards = snapshot.providers.slice(0, Math.max(0, budget.maxProviderCards))
  const compareProviders = snapshot.providers.slice(0, COMPARE_PROVIDER_LIMIT)
  const location = parseLocationIntent(snapshot.query)
  const artifacts: AnswerArtifact[] = [
    { kind: 'one-line', text: snapshot.oneLine },
  ]

  if (profile === 'compare_pair' && compareProviders.length >= 2) {
    artifacts.push({
      kind: 'provider-compare-table',
      providers: [...compareProviders],
      fields: ['area', 'response', 'availability', 'hours', 'trust', 'freshness', 'nextStep'],
    })
  }

  if (visibleProviderCards.length > 0) {
    artifacts.push({ kind: 'provider-cards', providers: [...visibleProviderCards] })
  }

  if (!compact && profile === 'discovery_full' && location !== undefined && visibleProviderCards.length > 0) {
    artifacts.push({ kind: 'location-map', label: location.label, placeQuery: location.placeQuery })
  }

  const showSummary =
    snapshot.summary.length > 0 &&
    (
      profile === 'discovery_full' ||
      profile === 'clarification' ||
      profile === 'compare_pair' ||
      profile === 'empty_state' ||
      profile === 'boundary_explain'
    )

  if (showSummary) {
    artifacts.push({ kind: 'prose', block: 'summary', text: snapshot.summary })
  }

  if (profile === 'empty_state') {
    artifacts.push({
      kind: 'recovery-prompts',
      title: 'Try a narrower search',
      prompts: buildRecoveryPrompts(snapshot.query),
    })
  }

  if (snapshot.nextStep.length > 0) {
    artifacts.push({ kind: 'what-to-do-now', text: snapshot.nextStep })
  }

  if (snapshot.agentJsonUrl.length > 0) {
    artifacts.push({ kind: 'agent-json', url: snapshot.agentJsonUrl })
  }

  return filterArtifactsForBudget(artifacts, budget)
}

export function getDefaultArtifactBudgetForLayoutProfile(profile: AnswerLayoutProfile): AnswerArtifactBudget {
  switch (profile) {
    case 'clarification':
      return {
        layoutProfile: profile,
        allowedKinds: TEXT_ONLY_ARTIFACTS,
        maxArtifactCount: 3,
        maxProviderCards: 0,
      }
    case 'boundary_explain':
      return {
        layoutProfile: profile,
        allowedKinds: TEXT_ONLY_ARTIFACTS,
        maxArtifactCount: 3,
        maxProviderCards: 0,
      }
    case 'empty_state':
      return {
        layoutProfile: profile,
        allowedKinds: EMPTY_ARTIFACTS,
        maxArtifactCount: 5,
        maxProviderCards: 0,
      }
    case 'compare_pair':
      return {
        layoutProfile: profile,
        allowedKinds: COMPARE_ARTIFACTS,
        maxArtifactCount: 4,
        maxProviderCards: 0,
      }
    case 'refinement_compact':
      return {
        layoutProfile: profile,
        allowedKinds: FILTER_ARTIFACTS,
        maxArtifactCount: 3,
        maxProviderCards: ANSWER_PROVIDER_CARD_LIMIT,
      }
    case 'discovery_full':
      return {
        layoutProfile: profile,
        allowedKinds: ANSWER_ARTIFACTS,
        maxArtifactCount: 6,
        maxProviderCards: ANSWER_PROVIDER_CARD_LIMIT,
      }
  }
}

export function filterArtifactsForBudget(
  artifacts: readonly AnswerArtifact[],
  budget: AnswerArtifactBudget,
): AnswerArtifact[] {
  const maxArtifactCount = Math.max(0, budget.maxArtifactCount)
  let remainingProviderCards = Math.max(0, budget.maxProviderCards)
  const budgeted: AnswerArtifact[] = []
  const allowedKinds = new Set(budget.allowedKinds)

  for (const artifact of artifacts) {
    if (budgeted.length >= maxArtifactCount) {
      break
    }
    if (!allowedKinds.has(artifact.kind)) {
      continue
    }

    const capped = capArtifactForBudget(artifact, budget, remainingProviderCards)
    if (capped === undefined) {
      continue
    }

    if (capped.kind === 'provider-cards') {
      remainingProviderCards -= capped.providers.length
    }

    budgeted.push(capped)
  }

  return budgeted
}

function capArtifactForBudget(
  artifact: AnswerArtifact,
  budget: AnswerArtifactBudget,
  remainingProviderCards: number,
): AnswerArtifact | undefined {
  switch (artifact.kind) {
    case 'provider-cards': {
      const providers = artifact.providers.slice(0, remainingProviderCards)
      return providers.length === 0 ? undefined : { kind: 'provider-cards', providers }
    }
    case 'provider-compare-table': {
      const providers = artifact.providers.slice(0, COMPARE_PROVIDER_LIMIT)
      return providers.length === 0
        ? undefined
        : {
            kind: 'provider-compare-table',
            providers,
            ...(artifact.fields === undefined ? {} : { fields: artifact.fields }),
          }
    }
    case 'one-line':
    case 'recovery-prompts':
    case 'location-map':
    case 'prose':
    case 'what-to-do-now':
    case 'agent-json':
    case 'protected-by-ae':
      return artifact
  }
}


function buildRecoveryPrompts(query: string): { label: string; query: string }[] {
  const normalized = query.trim()
  const base = normalized.length > 0 ? normalized : 'local service'
  return [
    { label: 'Search a nearby suburb', query: `${base} near me` },
    { label: 'Try the service type only', query: stripPlaceWords(base) },
    { label: 'Browse listed businesses', query: base },
  ]
}

function stripPlaceWords(query: string): string {
  const stripped = query
    .replace(/\bnear\s+[A-Za-z][A-Za-z\s'-]*$/i, '')
    .replace(/\bin\s+[A-Za-z][A-Za-z\s'-]*$/i, '')
    .replace(/\b\d{4}\b/g, '')
    .trim()
  return stripped.length > 0 ? stripped : query
}
