import type { PublicAnswerCheckSummary } from '@/modules/answer-thread/public'

export type AeAnswerChecksProps = {
  summary?: PublicAnswerCheckSummary | undefined
}

export function AeAnswerChecks({ summary }: AeAnswerChecksProps) {
  if (summary === undefined) {
    return null
  }

  const sentence = answerCheckSentence(summary)

  if (sentence.length === 0) {
    return null
  }

  return (
    <p aria-label="Answer checks" className="text-xs leading-snug text-secondary">
      {sentence}
    </p>
  )
}

function answerCheckSentence(summary: PublicAnswerCheckSummary): string {
  const total = summary.checksPassed + summary.checksFailed
  const parts = [
    summary.listedBusinesses > 0 ? `Compared ${summary.listedBusinesses} ${summary.listedBusinesses === 1 ? 'listed business' : 'listed businesses'}` : '',
    total > 0 ? `checked ${total} ${total === 1 ? 'fact' : 'facts'}` : '',
    `done in ${formatElapsed(summary.elapsedMs)}`,
  ].filter((part) => part.length > 0)

  return parts.length === 0 ? '' : `${parts.join('; ')}.`
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
