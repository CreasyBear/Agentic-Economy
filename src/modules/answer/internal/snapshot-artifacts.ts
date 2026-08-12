import {
  ANSWER_OPERATION_CANDIDATE_LIMIT,
  type AnswerArtifact,
} from '../answer-schema'
import type { AnswerSource } from '../answer-synthesizer'
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
const OPERATION_CANDIDATE_LIMIT = ANSWER_OPERATION_CANDIDATE_LIMIT

const TEXT_ONLY_ARTIFACTS = ['one-line', 'prose', 'what-to-do-now'] as const
const DATA_ANSWER_ARTIFACTS = [...TEXT_ONLY_ARTIFACTS, 'operation-candidates', 'operation-outcome'] as const
const ANSWER_ARTIFACTS = [
  'one-line',
  'provider-cards',
  'operation-candidates',
  'operation-outcome',
  'location-map',
  'prose',
  'imported-claims',
  'what-to-do-now',
  'agent-json',
] as const
const COMPARE_ARTIFACTS = ['one-line', 'provider-compare-table', 'prose', 'what-to-do-now'] as const
const EMPTY_ARTIFACTS = ['one-line', 'prose', 'imported-claims', 'recovery-prompts', 'what-to-do-now', 'agent-json'] as const
const FILTER_ARTIFACTS = ['one-line', 'provider-cards', 'what-to-do-now'] as const
const HANDOFF_ARTIFACTS = ['one-line', 'selected-provider', 'what-to-do-now'] as const

export function buildArtifactsFromSnapshot(
  snapshot: AnswerSnapshot,
  budgetOverride?: AnswerArtifactBudget,
): AnswerArtifact[] {
  const profile = budgetOverride?.layoutProfile ?? resolveLayoutProfile({
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    providerCount: snapshot.providers.length,
  })
  const selectedProvider = hasProviderIdentity(snapshot.selectedProvider) ? snapshot.selectedProvider : undefined
  const budget = getArtifactBudgetForSnapshot({ ...snapshot, layoutProfile: profile }, budgetOverride)

  const compact = isCompactLayoutProfile(profile)
  const visibleProviderCards = snapshot.providers.slice(0, Math.max(0, budget.maxProviderCards))
  const compareProviders = snapshot.providers.slice(0, COMPARE_PROVIDER_LIMIT)
  const location = parseLocationIntent(snapshot.query)
  const artifacts: AnswerArtifact[] = [
    { kind: 'one-line', text: snapshot.oneLine },
  ]
  if (snapshot.operationCandidates !== undefined && snapshot.operationCandidates.length > 0) {
    artifacts.push({
      kind: 'operation-candidates',
      candidates: [...snapshot.operationCandidates].slice(0, OPERATION_CANDIDATE_LIMIT),
      ...(snapshot.operationCandidatesDigest === undefined ? {} : { operationCandidatesDigest: snapshot.operationCandidatesDigest }),
      ...(snapshot.operationSelection === undefined ? {} : { selection: snapshot.operationSelection }),
    })
  }
  if (snapshot.operationOutcome !== undefined) {
    artifacts.push({ kind: 'operation-outcome', outcome: snapshot.operationOutcome })
  }

  if (selectedProvider !== undefined) {
    artifacts.push({ kind: 'selected-provider', provider: selectedProvider })
  }

  if (profile === 'compare_pair' && compareProviders.length >= 2) {
    artifacts.push({
      kind: 'provider-compare-table',
      providers: [...compareProviders],
      fields: ['area', 'response', 'availability', 'hours', 'trust', 'freshness', 'nextStep'],
    })
  }

  if (selectedProvider === undefined && visibleProviderCards.length > 0) {
    artifacts.push({ kind: 'provider-cards', providers: [...visibleProviderCards] })
  }

  if (!compact && profile === 'discovery_full' && location !== undefined && visibleProviderCards.length > 0) {
    artifacts.push({ kind: 'location-map', label: location.label, placeQuery: location.placeQuery })
  }

  const showSummary =
    snapshot.summary.length > 0 &&
    (
      profile === 'discovery_full' ||
      profile === 'data_answer' ||
      profile === 'clarification' ||
      profile === 'compare_pair' ||
      profile === 'empty_state' ||
      profile === 'boundary_explain' ||
      profile === 'safety_refusal'
    )

  if (showSummary) {
    artifacts.push({ kind: 'prose', block: 'summary', text: snapshot.summary })
  }
  if (snapshot.importedClaims !== undefined && snapshot.importedClaims.length > 0) {
    artifacts.push({ kind: 'imported-claims', claims: snapshot.importedClaims.slice(0, 5) })
  }


  if (profile === 'empty_state') {
    artifacts.push({
      kind: 'recovery-prompts',
      title: 'Try a narrower search',
      prompts: buildRecoveryPrompts(snapshot.query),
      links: [{ label: 'Own a business? List it free', href: '/claim' }],
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

export function getArtifactBudgetForSnapshot(
  snapshot: AnswerSnapshot,
  budgetOverride?: AnswerArtifactBudget,
): AnswerArtifactBudget {
  const profile = budgetOverride?.layoutProfile ?? resolveLayoutProfile({
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    providerCount: snapshot.providers.length,
  })
  return withSelectedProviderBudget(
    budgetOverride ?? getDefaultArtifactBudgetForLayoutProfile(profile),
    hasProviderIdentity(snapshot.selectedProvider),
  )
}

export function getArtifactBudgetForArtifacts(
  profile: AnswerLayoutProfile,
  artifacts: readonly AnswerArtifact[],
  budgetOverride?: AnswerArtifactBudget,
): AnswerArtifactBudget {
  return withSelectedProviderBudget(
    budgetOverride ?? getDefaultArtifactBudgetForLayoutProfile(profile),
    artifacts.some((artifact) => artifact.kind === 'selected-provider'),
  )
}

export function getDefaultArtifactBudgetForLayoutProfile(profile: AnswerLayoutProfile): AnswerArtifactBudget {
  switch (profile) {
    case 'clarification':
      return {
        layoutProfile: profile,
        allowedKinds: DATA_ANSWER_ARTIFACTS,
        maxArtifactCount: 5,
        maxProviderCards: 0,
      }
    case 'boundary_explain':
    case 'safety_refusal':
      return {
        layoutProfile: profile,
        allowedKinds: TEXT_ONLY_ARTIFACTS,
        maxArtifactCount: 3,
        maxProviderCards: 0,
      }
    case 'data_answer':
      return {
        layoutProfile: profile,
        allowedKinds: DATA_ANSWER_ARTIFACTS,
        maxArtifactCount: 5,
        maxProviderCards: 0,
      }
    case 'empty_state':
      return {
        layoutProfile: profile,
        allowedKinds: EMPTY_ARTIFACTS,
        maxArtifactCount: 6,
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

function withSelectedProviderBudget(
  budget: AnswerArtifactBudget,
  hasSelectedProvider: boolean,
): AnswerArtifactBudget {
  if (!hasSelectedProvider || budget.layoutProfile !== 'refinement_compact') {
    return budget
  }

  return {
    ...budget,
    allowedKinds: HANDOFF_ARTIFACTS,
    maxArtifactCount: 3,
    maxProviderCards: 0,
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
    case 'imported-claims':
      return {
        kind: 'imported-claims',
        claims: artifact.claims.slice(0, 5),
      }
    case 'operation-candidates': {
      const candidates = artifact.candidates.slice(0, OPERATION_CANDIDATE_LIMIT)
      return candidates.length === 0
        ? undefined
        : {
            kind: 'operation-candidates',
            candidates,
            ...(artifact.operationCandidatesDigest === undefined ? {} : { operationCandidatesDigest: artifact.operationCandidatesDigest }),
            ...(artifact.selection === undefined ? {} : { selection: artifact.selection }),
          }
    }
    case 'operation-outcome':
      return artifact
    case 'one-line':
    case 'selected-provider':
    case 'recovery-prompts':
    case 'location-map':
    case 'prose':
    case 'what-to-do-now':
    case 'agent-json':
    case 'protected-by-ae':
      return artifact
  }
}


function hasProviderIdentity(provider: AnswerSource | undefined): provider is AnswerSource {
  return provider !== undefined
    && provider.slug.trim().length > 0
    && provider.name.trim().length > 0
}

function buildRecoveryPrompts(query: string): { label: string; query: string }[] {
  const fields = normalizeRecoveryFields(query)
  const service = fields.service.length > 0 ? fields.service : 'local service'
  const nearby = fields.location === undefined
    ? `${service} near me`
    : `${service} near ${fields.location}`
  const browse = fields.location === undefined
    ? service
    : `${service} in ${fields.location}`
  return [
    { label: 'Search a nearby suburb', query: nearby },
    { label: 'Try the service type only', query: service },
    { label: 'Browse listed businesses', query: browse },
  ]
}

function normalizeRecoveryFields(query: string): { service: string; location?: string } {
  const normalized = query.trim()
  const parsedLocation = parseLocationIntent(normalized)
  const leadingLocation = normalized.match(/^\s*([A-Z][A-Za-z' -]{1,60}),\s*[A-Z]{2,3}\b/)
  const location = (parsedLocation?.label ?? leadingLocation?.[1])?.replace(
    /\s+(?:is|for|please|and)\b.*$/i,
    '',
  ).trim()
  let service = normalized
  if (location !== undefined && location.length > 0) {
    const escaped = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    service = service
      .replace(new RegExp(`\\b(?:near|around|in|at|serving)\\s+${escaped}\\b`, 'i'), ' ')
      .replace(new RegExp(`\\b${escaped}\\b`, 'i'), ' ')
  }
  service = service
    .replace(/\b(?:is\s+correct|please|find|search|show|look\s+for|only|options?|businesses?|providers?|the|best|way|to|contact|them|provide|details?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    service: stripPlaceWords(service),
    ...(location === undefined || location.length === 0 ? {} : { location }),
  }
}

function stripPlaceWords(query: string): string {
  const stripped = query
    .replace(/\bnear\s+[A-Za-z][A-Za-z\s'-]*$/i, '')
    .replace(/\bin\s+[A-Za-z][A-Za-z\s'-]*$/i, '')
    .replace(/\b\d{4}\b/g, '')
    .trim()
  return stripped.length > 0 ? stripped : query
}
