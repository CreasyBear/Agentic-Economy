import type { ComparisonDecisionBrief } from './contract'
import type {
  ComparisonPresentationAdapterResult,
  ComparisonPresentationProposal,
} from './presentation-adapter'

export type ComparisonPresentationPlan = Readonly<{
  mode: ComparisonPresentationProposal['mode']
  density: ComparisonPresentationProposal['density']
  responsiveComposition: ComparisonPresentationProposal['responsiveComposition']
  emphasisIds: readonly string[]
}>

export type ComparisonPresentationResolution =
  | Readonly<{ kind: 'accepted'; plan: ComparisonPresentationPlan }>
  | Readonly<{
      kind: 'fallback'
      reason: Exclude<ComparisonPresentationAdapterResult['kind'], 'proposed'> | 'invalid_proposal'
      plan: ComparisonPresentationPlan
    }>

const FALLBACK_PLAN: ComparisonPresentationPlan = {
  mode: 'answer_first',
  density: 'comfortable',
  responsiveComposition: 'answer_then_evidence',
  emphasisIds: [],
}

const PROPOSAL_KEYS = [
  'semanticDigest',
  'mode',
  'density',
  'responsiveComposition',
  'emphasisIds',
] as const

export function resolveComparisonPresentation(input: Readonly<{
  semanticDigest: string
  brief: ComparisonDecisionBrief
  adapter: ComparisonPresentationAdapterResult
}>): ComparisonPresentationResolution {
  if (input.adapter.kind !== 'proposed') {
    return { kind: 'fallback', reason: input.adapter.kind, plan: FALLBACK_PLAN }
  }
  const proposal = parseProposal(input.adapter.proposal)
  if (
    proposal === undefined
    || proposal.semanticDigest !== input.semanticDigest
    || !hasValidEmphasis(proposal.emphasisIds, semanticIds(input.brief))
  ) {
    return { kind: 'fallback', reason: 'invalid_proposal', plan: FALLBACK_PLAN }
  }
  return {
    kind: 'accepted',
    plan: {
      mode: proposal.mode,
      density: proposal.density,
      responsiveComposition: proposal.responsiveComposition,
      emphasisIds: proposal.emphasisIds,
    },
  }
}

function parseProposal(input: unknown): ComparisonPresentationProposal | undefined {
  if (!isRecord(input) || Object.keys(input).length !== PROPOSAL_KEYS.length) return undefined
  if (!PROPOSAL_KEYS.every((key) => Object.hasOwn(input, key))) return undefined
  if (
    typeof input.semanticDigest !== 'string'
    || !['answer_first', 'guided_compare'].includes(String(input.mode))
    || !['concise', 'comfortable'].includes(String(input.density))
    || !['answer_then_evidence', 'guided_sections'].includes(String(input.responsiveComposition))
    || !Array.isArray(input.emphasisIds)
    || !input.emphasisIds.every((id) => typeof id === 'string')
  ) return undefined
  return input as ComparisonPresentationProposal
}

function semanticIds(brief: ComparisonDecisionBrief): ReadonlySet<string> {
  return new Set([
    ...brief.decisiveReasonIds,
    ...brief.foregroundableFactIds,
    ...brief.mandatoryCaveatIds,
    ...brief.detailSectionIds,
    ...brief.safeActionIds,
  ])
}

function hasValidEmphasis(ids: readonly string[], allowed: ReadonlySet<string>): boolean {
  return ids.length <= 3 && new Set(ids).size === ids.length && ids.every((id) => allowed.has(id))
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
