import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  executeDecisionGateway,
  JevUnavailableError,
  type DecisionGatewayOptions,
  type JevAnswer,
  type JevQuestion,
} from '@/modules/decision-engine/public'
import type {
  ToolSearchResult,
  ToolSearchRanking,
} from '@/modules/capability-supply/public'

export type ToolRerankerOptions = Readonly<
  DecisionGatewayOptions & {
    disableRerank?: boolean
    maxCandidatesToScore?: number
    /** The person's message, when it differs from the retrieval query. */
    request?: string
  }
>

const DEFAULT_MAX_CANDIDATES = 20
const MATCH_INCLUDE_SCORE = 0.5
const USE_CONFIDENCE = 0.5
const COMPARE_LIMIT = 4

export const TOOL_SEARCH_USE = {
  search: 'registry.tools.search',
  compare: 'registry.tools.compare',
  describe: 'registry.tools.describe',
  clarify: 'chat.clarify',
} as const

export type ToolSearchUse = (typeof TOOL_SEARCH_USE)[keyof typeof TOOL_SEARCH_USE]

const USE_CRITERIA = {
  [TOOL_SEARCH_USE.search]: 'The request asks to find or list Tools, and more than one candidate can be shown as a shortlist.',
  [TOOL_SEARCH_USE.compare]: 'The request asks to compare, contrast, or choose between Tools.',
  [TOOL_SEARCH_USE.describe]: 'The request asks for one Tool, or one candidate is the contribution to show.',
  [TOOL_SEARCH_USE.clarify]: 'The request is too broad to choose a tool, or the supplied facts do not establish a shortlist.',
} as const

function presentationQuestion(request: string | undefined): JevQuestion {
  return {
    type: 'choice',
    instructions: request === undefined
      ? 'Which tool should present `candidates` for `query`?'
      : 'Which tool should present `candidates` for the person\'s `request`? Use `query` only as the retrieval text.',
    criteria: USE_CRITERIA,
  }
}

function presentationRequest(query: string, request: string | undefined): string | undefined {
  const trimmed = request?.trim() ?? ''
  if (trimmed.length === 0 || trimmed === query.trim()) return undefined
  return Array.from(trimmed).slice(0, 500).join('')
}

type SearchPage = Extract<ToolSearchResult, { kind: 'ok' }>
type ScoredCandidate = Readonly<{
  item: SearchPage['items'][number]
  originalIndex: number
  score: number
}>
type ScoreOutcome =
  | { kind: 'original'; result: ToolSearchResult }
  | {
      kind: 'scored'
      result: SearchPage
      scored: ScoredCandidate[]
      remaining: SearchPage['items']
      answers: Record<string, JevAnswer>
    }

/**
 * Re-ranks tool search candidates using TypeSafe System One (Jev).
 *
 * Implements the canonical TypeSafe Re-ranking pattern (cookbooks/rerank_typesafe.md):
 * 1. Takes candidate tools from fast retrieval (Convex database index).
 * 2. Classifies each candidate in parallel in a single System One call using calibrated Noul scoring.
 * 3. Orders by the Noul probabilities, preserving retrieval order on ties.
 * 4. Requires no winner when the evidence supports no candidate or cannot separate them.
 * 5. Returns updated ToolSearchResult with re-ranked items and populated ranking array.
 *
 * Discovery is intentionally Jev-only. If Jev is unavailable or returns an
 * incomplete classification, callers retain the retriever's original order;
 * this latency-sensitive read path never escalates to a frontier LLM.
 * Requires complete valid relevance answers before reordering. Preserves Tool
 * facts, eligibility and page metadata; operational failure returns the original page.
 */
export async function rerankToolSearchResult(
  result: ToolSearchResult,
  query: string,
  options: ToolRerankerOptions = {},
): Promise<ToolSearchResult> {
  const outcome = await scoreToolSearch(result, query, options)
  if (outcome.kind === 'original') return outcome.result
  return {
    ...outcome.result,
    items: orderedItems(outcome),
    ranking: rankingFrom(outcome.scored),
  }
}

export type ToolSearchPresentation = Readonly<{
  result: ToolSearchResult
  use: ToolSearchUse | null
  /** Tool refs shown in a comparison that scored under a match. */
  belowMatch: readonly string[]
}>

/**
 * Chooses which tool presents a chat search, and which scored candidates fill it.
 * One System One call ranks every candidate and chooses the tool. A match score
 * of at least one half fills the tool. Compare with one match keeps the
 * next-highest Tool and records it in belowMatch. No match, or an explicit
 * clarify choice, leaves the ranked page and does not present a shortlist.
 * An uncertain choice is derived from the match count. Operational failure
 * returns the original page.
 */
export async function presentToolSearch(
  result: ToolSearchResult,
  query: string,
  options: ToolRerankerOptions = {},
): Promise<ToolSearchPresentation> {
  const request = presentationRequest(query, options.request)
  const outcome = await scoreToolSearch(
    result,
    query,
    request === undefined ? options : { ...options, request },
    { use: presentationQuestion(request) },
  )
  if (outcome.kind === 'original') return { result: outcome.result, use: null, belowMatch: [] }
  const included = outcome.scored.filter((candidate) => candidate.score >= MATCH_INCLUDE_SCORE)
  const requested = adoptedUse(outcome.answers.use)
  const use = requested === null ? deriveUse(included.length) : fitUse(requested, included.length, outcome.scored.length)
  const filled = fillPresentation(use, included, outcome)
  return {
    use,
    belowMatch: filled.belowMatch,
    result: { ...outcome.result, items: filled.items, ranking: rankingFrom(outcome.scored) },
  }
}

function adoptedUse(answer: JevAnswer | undefined): ToolSearchUse | null {
  if (answer?.type !== 'choice' || answer.confidence < USE_CONFIDENCE) return null
  switch (answer.choice) {
    case TOOL_SEARCH_USE.search:
    case TOOL_SEARCH_USE.compare:
    case TOOL_SEARCH_USE.describe:
    case TOOL_SEARCH_USE.clarify:
      return answer.choice
    default:
      return null
  }
}

function deriveUse(includedCount: number): ToolSearchUse {
  if (includedCount === 0) return TOOL_SEARCH_USE.clarify
  if (includedCount === 1) return TOOL_SEARCH_USE.describe
  return TOOL_SEARCH_USE.search
}

function fitUse(requested: ToolSearchUse, includedCount: number, scoredCount: number): ToolSearchUse {
  if (includedCount === 0 || requested === TOOL_SEARCH_USE.clarify) return TOOL_SEARCH_USE.clarify
  switch (requested) {
    case TOOL_SEARCH_USE.describe:
      return TOOL_SEARCH_USE.describe
    case TOOL_SEARCH_USE.compare:
      return includedCount >= 2 || scoredCount >= 2 ? TOOL_SEARCH_USE.compare : TOOL_SEARCH_USE.describe
    case TOOL_SEARCH_USE.search:
      return includedCount === 1 ? TOOL_SEARCH_USE.describe : TOOL_SEARCH_USE.search
    default: {
      const exhaustive: never = requested
      return exhaustive
    }
  }
}

function fillPresentation(
  use: ToolSearchUse,
  included: readonly ScoredCandidate[],
  outcome: Extract<ScoreOutcome, { kind: 'scored' }>,
): { items: SearchPage['items']; belowMatch: readonly string[] } {
  if (use === TOOL_SEARCH_USE.clarify) return { items: orderedItems(outcome), belowMatch: [] }
  if (use === TOOL_SEARCH_USE.describe) {
    return { items: included[0] === undefined ? [] : [included[0].item], belowMatch: [] }
  }
  if (use === TOOL_SEARCH_USE.search) return { items: included.map((candidate) => candidate.item), belowMatch: [] }
  if (use === TOOL_SEARCH_USE.compare) return comparisonItems(included, outcome.scored)
  const exhaustive: never = use
  return exhaustive
}

function comparisonItems(
  included: readonly ScoredCandidate[],
  scored: readonly ScoredCandidate[],
): { items: SearchPage['items']; belowMatch: readonly string[] } {
  if (included.length >= 2) {
    return { items: included.slice(0, COMPARE_LIMIT).map((candidate) => candidate.item), belowMatch: [] }
  }
  const lead = included[0]
  const next = lead === undefined
    ? undefined
    : scored.find((candidate) => candidate.item.toolRef !== lead.item.toolRef)
  if (lead === undefined || next === undefined) {
    return { items: lead === undefined ? [] : [lead.item], belowMatch: [] }
  }
  return { items: [lead.item, next.item], belowMatch: [next.item.toolRef] }
}

function orderedItems(outcome: Extract<ScoreOutcome, { kind: 'scored' }>): SearchPage['items'] {
  return [
    ...outcome.scored.map((candidate) => candidate.item),
    ...outcome.remaining,
  ]
}

function rankingFrom(scored: readonly ScoredCandidate[]): ToolSearchRanking[] {
  return scored.map(({ item, score }, index) => ({
    toolRef: item.toolRef,
    rank: index + 1,
    score,
  }))
}

async function scoreToolSearch(
  result: ToolSearchResult,
  query: string,
  options: ToolRerankerOptions,
  extraQuestions: Record<string, JevQuestion> = {},
): Promise<ScoreOutcome> {
  if (
    options.disableRerank === true ||
    result.kind !== 'ok' ||
    result.items.length <= 1 ||
    query.trim().length === 0
  ) {
    return { kind: 'original', result }
  }
  // Assessments are keyed by Tool identity; a duplicate page cannot support an
  // unambiguous assessment. Preserve retrieval rather than inventing one.
  if (new Set(result.items.map(item => item.toolRef)).size !== result.items.length) {
    return { kind: 'original', result }
  }

  const cleanQuery = query.trim()
  const request = presentationRequest(cleanQuery, options.request)
  const requestedCandidateLimit = options.maxCandidatesToScore
  const maxCandidates =
    requestedCandidateLimit === undefined || !Number.isInteger(requestedCandidateLimit)
      ? DEFAULT_MAX_CANDIDATES
      : Math.min(DEFAULT_MAX_CANDIDATES, Math.max(1, requestedCandidateLimit))
  const candidatesToScore = result.items.slice(0, maxCandidates)
  const remaining = result.items.slice(maxCandidates)
  const questions: Record<string, JevQuestion> = { ...extraQuestions }
  const candidateState = candidatesToScore.map((item) => ({
    toolRef: item.toolRef,
    label: item.listing.label,
    capabilityId: item.contract.capabilityId,
    summary: item.summary,
  }))

  candidatesToScore.forEach((_item, index) => {
    questions[`match_${index}`] = {
      type: 'noul',
      instructions: request === undefined
        ? `Does \`candidates[${index}]\` directly satisfy the capability request in \`query\`?`
        : `Does \`candidates[${index}]\` directly satisfy the capability request in \`request\`?`,
      criteria: {
        true: 'The Tool directly performs the requested bounded contribution and satisfies every explicit capability constraint supported by the supplied facts.',
        false: 'The Tool is unrelated, only shares generic terms, or the supplied facts do not establish one or more explicit capability constraints.',
      },
    }
  })

  let decision
  try {
    decision = await executeDecisionGateway(
      {
        state: {
          query: cleanQuery,
          ...(request === undefined ? {} : { request }),
          candidates: candidateState,
        },
        questions,
      },
      { ...options, purpose: 'discovery', disableSecondaryLlm: true },
    )
  } catch (cause) {
    if (!(cause instanceof JevUnavailableError)) throw cause
    return {
      kind: 'original',
      result: degradeBackend(cause, result, { site: 'rerankToolSearchResult', reason: 'source_unavailable' }),
    }
  }

  if (decision.tier !== 'jev_system_one') return { kind: 'original', result }
  const scoredCandidates = candidatesToScore.map((item, index) => {
    const noulAns = decision.answers[`match_${index}`]
    if (
      noulAns?.type !== 'noul' ||
      !Number.isFinite(noulAns.noul) ||
      noulAns.noul < 0 ||
      noulAns.noul > 1
    ) {
      return undefined
    }
    return {
      item,
      originalIndex: index,
      score: Math.round(noulAns.noul * 1000) / 1000,
    }
  })
  if (scoredCandidates.some((candidate) => candidate === undefined)) return { kind: 'original', result }
  const scored = scoredCandidates.filter(
    (candidate): candidate is ScoredCandidate => candidate !== undefined,
  )
  scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
  return { kind: 'scored', result, scored, remaining, answers: decision.answers }
}
