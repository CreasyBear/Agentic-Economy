import type { PublicAnswerCheckSummary } from '@/modules/answer-thread/public'

export type AeAnswerChecksProps = {
  summary?: PublicAnswerCheckSummary | undefined
}

export function AeAnswerChecks({ summary }: AeAnswerChecksProps) {
  if (summary === undefined) {
    return null
  }

  const items = [
    { label: 'Catalog searches', value: summary.catalogSearches },
    { label: 'Listings read', value: summary.listingsRead },
    { label: 'Listed businesses', value: summary.listedBusinesses },
    { label: 'Checks passed', value: summary.checksPassed },
    { label: 'Checks failed', value: summary.checksFailed },
    { label: 'Elapsed', value: formatElapsed(summary.elapsedMs) },
  ] as const

  return (
    <section className="ae-answer-checks" aria-label="Answer checks">
      <div className="ae-answer-checks__header">
        <h3 className="ae-answer-checks__title">Answer checks</h3>
      </div>
      <dl className="ae-answer-checks__grid">
        {items.map((item) => (
          <div key={item.label} className="ae-answer-checks__item">
            <dt className="ae-answer-checks__label">{item.label}</dt>
            <dd className="ae-answer-checks__value">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
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
