import { formatCount } from '@/lib/ui/format-time'

/**
 * One deterministic scorer for choosing a Tool on a buyer's behalf.
 *
 * Retrieval decides *which* Tools are relevant; this decides *which relevant
 * Tool to pick*. It needs no model and no network, so selection never depends
 * on Jev/OpenRouter being up. Every failed AE Call lowers a Tool's reliability
 * immediately, and the Laplace prior lets a new Tool compete from 50%.
 */

export const TOOL_SELECTION_PREFERENCES = ['balanced', 'cheapest', 'reliable'] as const
export type ToolSelectionPreference = typeof TOOL_SELECTION_PREFERENCES[number]

export type ToolSelectionEvidence = Readonly<{
  /** Distinct payers in the last 30 days (Bazaar); undefined when unknown. */
  payers30d?: number
  /** AE Calls to this Tool that completed / failed on the provider side. */
  aeCompleted: number
  aeFailed: number
  /** Distinct verified paid-answer reporters in the last 30 days; separate from delivery failures. */
  reportedByBuyers30d?: number
  /** Cheapest price per call in USD; undefined when unknown. */
  minimumUsdPrice?: number
  /** The requesting account has completed a Call to this Tool before. */
  usedBefore: boolean
}>

export type ScoredTool<T> = Readonly<{ candidate: T; score: number; reasons: readonly string[] }>

const WEIGHTS: Readonly<Record<ToolSelectionPreference, Readonly<{ reliability: number; adoption: number; price: number; usual: number }>>> = {
  balanced: { reliability: 0.4, adoption: 0.3, price: 0.2, usual: 0.1 },
  cheapest: { reliability: 0.25, adoption: 0.15, price: 0.5, usual: 0.1 },
  reliable: { reliability: 0.55, adoption: 0.3, price: 0.05, usual: 0.1 },
}

/** Each retrieval rank below the first costs 5% so evidence cannot bury the clearly relevant match. */
const RANK_DECAY = 0.05

export function scoreToolEvidence(evidence: ToolSelectionEvidence, preference: ToolSelectionPreference): number {
  const weights = WEIGHTS[preference]
  const reliability = (evidence.aeCompleted + 1) / (evidence.aeCompleted + evidence.aeFailed + 2)
  const adoption = Math.min(1, Math.log10(1 + Math.max(0, evidence.payers30d ?? 0)) / 4)
  const price = evidence.minimumUsdPrice === undefined ? 0.5 : 1 / (1 + Math.max(0, evidence.minimumUsdPrice) * 100)
  const usual = evidence.usedBefore ? 1 : 0
  const reports = Math.max(0, evidence.reportedByBuyers30d ?? 0)
  // Bounded complaint signal: repeated reports by one buyer count once upstream.
  const reportPenalty = 0.15 * reports / (reports + 3)
  return Math.max(0, weights.reliability * reliability + weights.adoption * adoption + weights.price * price + weights.usual * usual - reportPenalty)
}

export function toolSelectionReasons(evidence: ToolSelectionEvidence): readonly string[] {
  const reasons: string[] = []
  if (evidence.usedBefore) reasons.push('you have used it before')
  const aeTotal = evidence.aeCompleted + evidence.aeFailed
  if (aeTotal > 0) reasons.push(`${Math.round((evidence.aeCompleted / aeTotal) * 100)}% of ${aeTotal} calls succeeded`)
  if (evidence.payers30d !== undefined && evidence.payers30d > 0) reasons.push(`${formatCount(evidence.payers30d)} buyers this month`)
  if ((evidence.reportedByBuyers30d ?? 0) > 0) reasons.push(`${evidence.reportedByBuyers30d} buyers reported an answer this month`)
  return reasons
}

/**
 * Orders retrieval-ranked candidates (best retrieval match first) by evidence.
 * Stable: equal scores keep retrieval order. Never drops a candidate.
 */
export function rankToolsForSelection<T>(
  candidates: readonly T[],
  evidenceOf: (candidate: T) => ToolSelectionEvidence,
  preference: ToolSelectionPreference = 'balanced',
): readonly ScoredTool<T>[] {
  return candidates
    .map((candidate, rank) => {
      const evidence = evidenceOf(candidate)
      return { candidate, rank, score: scoreToolEvidence(evidence, preference) * (1 - RANK_DECAY * rank), reasons: toolSelectionReasons(evidence) }
    })
    .sort((left, right) => right.score - left.score || left.rank - right.rank)
    .map(({ candidate, score, reasons }) => ({ candidate, score, reasons }))
}
