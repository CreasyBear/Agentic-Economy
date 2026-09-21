import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  executeDecisionGateway,
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
 * 3. Asks a companion Choice question to determine separation and the top recommendation.
 * 4. Uses the Noul probabilities as reusable relevance scores and the Choice only as a tie-break.
 * 5. Returns updated ToolSearchResult with re-ranked items and populated ranking array.
 *
 * Discovery is intentionally Jev-only. If Jev is unavailable or returns an
 * incomplete classification, callers retain the retriever's original order;
 * this latency-sensitive read path never escalates to a frontier LLM.
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

  const cleanQuery = query.trim()
  const requestedCandidateLimit = options.maxCandidatesToScore
  const maxCandidates =
    requestedCandidateLimit === undefined || !Number.isInteger(requestedCandidateLimit)
      ? DEFAULT_MAX_CANDIDATES
      : Math.min(DEFAULT_MAX_CANDIDATES, Math.max(1, requestedCandidateLimit))
  const candidatesToScore = result.items.slice(0, maxCandidates)
  const remainingCandidates = result.items.slice(maxCandidates)

  try {
    const questions: Record<string, JevQuestion> = {}
    const candidateChoices: Record<string, string> = {}

    const candidateState = candidatesToScore.map((item) => ({
      toolRef: item.toolRef,
      label: item.listing.label,
      capabilityId: item.contract.capabilityId,
      summary: item.summary,
    }))

    candidatesToScore.forEach((item, index) => {
      const qKey = `match_${index}`
      const candidateSummary = `${item.listing.label} (${item.contract.capabilityId}): ${item.summary}`
      candidateChoices[item.toolRef] = candidateSummary

      questions[qKey] = {
        type: 'noul',
        instructions: `Does \`candidates[${index}]\` directly satisfy the capability request in \`query\`?`,
        criteria: {
          true: 'The Tool directly performs the requested bounded contribution and satisfies every explicit capability constraint supported by the supplied facts.',
          false: 'The Tool is unrelated, only shares generic terms, or the supplied facts do not establish one or more explicit capability constraints.',
        },
      }
    })

    questions.best_match = {
      type: 'choice',
      instructions: `Which candidate tool is the single best match for the capability request: "${cleanQuery}"?`,
      criteria: candidateChoices,
    }

    const decision = await executeDecisionGateway(
      {
        state: { query: cleanQuery, candidates: candidateState },
        questions,
      },
      { ...options, disableSecondaryLlm: true },
    )

    if (decision.tier !== 'jev_system_one') return result

    const bestToolRef =
      decision.answers.best_match?.type === 'choice'
        ? decision.answers.best_match.choice
        : undefined

    if (bestToolRef === undefined || !(bestToolRef in candidateChoices)) return result

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
      Number(b.item.toolRef === bestToolRef) - Number(a.item.toolRef === bestToolRef) ||
      a.originalIndex - b.originalIndex,
    )

    const rerankedItems = [
      ...completeScores.map((candidate) => candidate.item),
      ...remainingCandidates,
    ]

    const ranking: ToolSearchRanking[] = rerankedItems.map((item, index) => {
      const scored = completeScores.find((candidate) => candidate.item.toolRef === item.toolRef)
      return {
        toolRef: item.toolRef,
        rank: index + 1,
        score: scored ? scored.score : 0.0,
      }
    })

    return {
      ...result,
      items: rerankedItems,
      ranking,
    }
  } catch (cause) {
    degradeBackend(cause, undefined, {
      site: 'rerankToolSearchResult',
      reason: 'invalid_response',
    })
    return result
  }
}
