import type { PublicAnswerCheckSummary } from '@/modules/answer-thread/public'

export type AeAnswerChecksProps = {
  summary?: PublicAnswerCheckSummary | undefined
}

export function AeAnswerChecks({ summary }: AeAnswerChecksProps) {
  if (summary === undefined) {
    return null
  }

  const total = summary.checksPassed + summary.checksFailed
  const parts = [
    `${summary.catalogSearches} ${summary.catalogSearches === 1 ? 'search' : 'searches'}`,
    `${summary.listingsRead} read`,
    `${summary.listedBusinesses} listed`,
    `${summary.checksPassed}/${total} checks`,
    formatElapsed(summary.elapsedMs),
  ]

  return (
    <p aria-label="Answer checks" className="font-mono text-2xs tabular-nums text-secondary">
      {parts.join(' · ')}
    </p>
  )
}

function formatElapsed(ms: number): string {
  if (ms <= 0) {
    return '<1s'
  }
  if (ms < 1_000) {
    return `${ms}ms`
  }
  if (ms < 10_000) {
    return `${(ms / 1_000).toFixed(1)}s`
  }
  return `${Math.round(ms / 1_000)}s`
}
