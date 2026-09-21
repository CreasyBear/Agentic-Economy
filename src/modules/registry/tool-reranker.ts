import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  executeDecisionGateway,
  JevUnavailableError,
  type DecisionGatewayOptions,
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
  }
>

const DEFAULT_MAX_CANDIDATES = 20

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
  if (
    options.disableRerank === true ||
    result.kind !== 'ok' ||
    result.items.length <= 1 ||
    query.trim().length === 0
  ) {
    return result
  }
  // Assessments are keyed by Tool identity; a duplicate page cannot support an
  // unambiguous assessment. Preserve retrieval rather than inventing one.
  if (new Set(result.items.map(item => item.toolRef)).size !== result.items.length) return result

  const cleanQuery = query.trim()
  const requestedCandidateLimit = options.maxCandidatesToScore
  const maxCandidates =
    requestedCandidateLimit === undefined || !Number.isInteger(requestedCandidateLimit)
      ? DEFAULT_MAX_CANDIDATES
      : Math.min(DEFAULT_MAX_CANDIDATES, Math.max(1, requestedCandidateLimit))
  const candidatesToScore = result.items.slice(0, maxCandidates)
  const remainingCandidates = result.items.slice(maxCandidates)

  const questions: Record<string, JevQuestion> = {}

  const candidateState = candidatesToScore.map((item) => ({
    toolRef: item.toolRef,
    label: item.listing.label,
    capabilityId: item.contract.capabilityId,
    summary: item.summary,
  }))

  candidatesToScore.forEach((_item, index) => {
    const qKey = `match_${index}`

    questions[qKey] = {
      type: 'noul',
      instructions: `Does \`candidates[${index}]\` directly satisfy the capability request in \`query\`?`,
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
        state: { query: cleanQuery, candidates: candidateState },
        questions,
      },
      { ...options, purpose: 'discovery', disableSecondaryLlm: true },
    )
  } catch (cause) {
    if (!(cause instanceof JevUnavailableError)) throw cause
    return degradeBackend(cause, result, { site: 'rerankToolSearchResult', reason: 'source_unavailable' })
  }

  if (decision.tier !== 'jev_system_one') return result

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

  if (scoredCandidates.some((candidate) => candidate === undefined)) return result
  const completeScores = scoredCandidates.filter(
    (candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined,
  )

  completeScores.sort((a, b) =>
    b.score - a.score ||
    a.originalIndex - b.originalIndex,
  )

  const rerankedItems = [
    ...completeScores.map((candidate) => candidate.item),
    ...remainingCandidates,
  ]

  // Only observed scores belong here. A tail item remains in the page but has
  // no ranking entry, distinguishable from an assessed candidate scoring zero.
  const ranking: ToolSearchRanking[] = completeScores.map(({ item, score }, index) => ({
    toolRef: item.toolRef,
    rank: index + 1,
    score,
  }))

  return {
    ...result,
    items: rerankedItems,
    ranking,
  }
}
