import { formatCount, formatRelativeTime } from '@/lib/ui/format-time'
import { rankToolsForSelection, type ToolSelectionEvidence } from '@/modules/common/tool-selection-score'
import type { SearchResult, SearchSignals } from './tool-choice-contracts'
import { formatToolDuration } from './tool-latency'

/** One Tool's AE outcomes, as `marketListingEvidence.selectionEvidence` returns them. */
export type SearchEvidenceRow = Readonly<{
  toolRef: string
  aeCompleted: number
  aeFailed: number
  reportedByBuyers30d: number
  usedBefore: boolean
  latencyP50Ms?: number
  lastVerifiedAt?: number
}>

function signalsFor(row: SearchResult, evidence: SearchEvidenceRow | undefined): SearchSignals {
  const calls = evidence === undefined ? 0 : evidence.aeCompleted + evidence.aeFailed
  const payers30d = row.signals?.payers30d
  return {
    calls,
    // Observed rate only; the Laplace prior lives in scoreToolEvidence and never in what is shown.
    ...(evidence === undefined || calls === 0 ? {} : { successRate: evidence.aeCompleted / calls }),
    ...(evidence?.latencyP50Ms === undefined ? {} : { latencyP50Ms: evidence.latencyP50Ms }),
    ...(evidence?.lastVerifiedAt === undefined ? {} : { lastVerifiedAt: evidence.lastVerifiedAt }),
    ...(payers30d === undefined ? {} : { payers30d }),
  }
}

function selectionEvidence(row: SearchResult, evidence: SearchEvidenceRow | undefined): ToolSelectionEvidence {
  const usdPrice = row.sourcePrice?.endsWith(' USDC') === true ? Number.parseFloat(row.sourcePrice) : undefined
  return {
    ...(row.signals?.payers30d === undefined ? {} : { payers30d: row.signals.payers30d }),
    aeCompleted: evidence?.aeCompleted ?? 0,
    aeFailed: evidence?.aeFailed ?? 0,
    reportedByBuyers30d: evidence?.reportedByBuyers30d ?? 0,
    ...(usdPrice === undefined || !Number.isFinite(usdPrice) ? {} : { minimumUsdPrice: usdPrice }),
    usedBefore: evidence?.usedBefore ?? false,
  }
}

/**
 * Groups rows by access (callable first), then orders each group by `rankToolsForSelection`
 * in src/modules/common/tool-selection-score.ts: a decayed blend of the incoming relevance
 * rank and `scoreToolEvidence`, so strong evidence can move a row above a more relevant one.
 * Attaches the signals every surface shows; signals never filter.
 *
 * Page-local: callers cut the page before ranking, so callable rows lead within one page only.
 * A non-callable row on page 1 can precede a callable row on page 2.
 */
export function rankSearchRowsByEvidence(
  rows: readonly SearchResult[],
  evidenceByToolRef: ReadonlyMap<string, SearchEvidenceRow>,
): SearchResult[] {
  const evidenceOf = (row: SearchResult) => row.toolRef === undefined ? undefined : evidenceByToolRef.get(row.toolRef)
  const rank = (group: readonly SearchResult[]) => rankToolsForSelection(group,
    row => selectionEvidence(row, evidenceOf(row)), 'balanced')
    .map(({ candidate }) => ({ ...candidate, signals: signalsFor(candidate, evidenceOf(candidate)) }))
  return [
    ...rank(rows.filter(row => row.access === 'ae_callable')),
    ...rank(rows.filter(row => row.access !== 'ae_callable')),
  ]
}

/** Completed AE calls, derived from the observed success rate. */
export function completedCalls(signals: SearchSignals): number {
  return Math.round((signals.successRate ?? 0) * signals.calls)
}

/** One line for CLI and MCP text. Web tables show these as separate columns. Fewer than two payers reads as "new". */
export function formatSearchSignals(signals: SearchSignals, now = Date.now()): string {
  return [
    signals.successRate === undefined
      ? 'No AE calls yet'
      : `${completedCalls(signals)} of ${signals.calls} AE ${signals.calls === 1 ? 'call' : 'calls'} completed`,
    ...(signals.latencyP50Ms === undefined ? [] : [`p50 ${formatToolDuration(signals.latencyP50Ms)}`]),
    ...(signals.lastVerifiedAt === undefined ? [] : [`verified ${formatRelativeTime(signals.lastVerifiedAt, now)}`]),
    ...(signals.payers30d === undefined ? [] : [signals.payers30d < 2 ? 'new' : `${formatCount(signals.payers30d)} payers`]),
  ].join(' · ')
}
