import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { formatDisplayAmount } from '@/modules/money/public'

const feedbackLabels = { useful: 'Useful', partly_useful: 'Partly useful', not_useful: 'Not useful' } as const
const reasonLabels = { incorrect: 'Incorrect', incomplete: 'Incomplete', irrelevant: 'Did not fit', too_slow: 'Too slow' } as const
const callHref = (ref: string) => `/admin/calls/${encodeURIComponent(ref)}`

export function AlphaLearning() {
  const [now, setNow] = useState(() => Date.now())
  const data = useQuery(api.adminConsoleMetrics.readAlphaLearningSample, { now })
  if (data === undefined) return <AeSection title="Alpha learning"><p role="status">Loading recent learning signals…</p></AeSection>
  if (data.kind === 'refused') return null
  const useful = data.feedback.filter(row => row.feedback.choice === 'useful').length
  const failed = data.calls.filter(row => row.state !== 'completed')
  const attention = data.feedback.filter(row => row.feedback.choice !== 'useful').slice(0, 5)
  const noMatch = data.selections.filter(row => row.outcome === 'no_match' || row.outcome === 'no_selection').length
  const unavailable = data.selections.filter(row => row.outcome === 'unavailable').length
  const latencies = data.calls.map(row => row.latencyMs).sort((left, right) => left - right)
  const lowerMiddle = latencies[Math.floor((latencies.length - 1) / 2)]
  const upperMiddle = latencies[Math.floor(latencies.length / 2)]
  const median = lowerMiddle === undefined || upperMiddle === undefined ? null : (lowerMiddle + upperMiddle) / 2
  const total = data.calls.reduce((sum, row) => sum + BigInt(row.amountAudUnits ?? '0'), 0n)
  return <AeSection title="Alpha learning" description={`Up to ${data.sampleLimit} recent records per signal from the past 90 days. ${data.truncated ? 'Older records are outside this sample.' : 'No records are excluded by the sample limit.'}`}>
    <div className="grid gap-intra text-sm">
      <p>{useful} useful / {data.feedback.length} responses · {failed.length} Calls need attention · {noMatch} selections without a match · {unavailable} selection failures</p>
      <p className="text-muted-foreground">{data.calls.length} recorded Calls · {formatDisplayAmount({ currency: 'AUD', units: total.toString(), exponent: 6 })} recorded buyer amount{median === null ? '' : ` · median Call latency ${(median / 1000).toFixed(1)}s`}</p>
      <Button type="button" variant="secondary" className="w-fit" onClick={() => setNow(Date.now())}>Refresh signals</Button>
      {attention.length === 0 && failed.length === 0 ? <p>No low-usefulness feedback or failed Calls in this sample.</p> : <ul className="grid gap-intra">
        {attention.map(row => <li key={`feedback:${row.callRef}`}><a className="underline" href={callHref(row.callRef)}>Review {feedbackLabels[row.feedback.choice].toLowerCase()} Call</a>
          {row.feedback.choice === 'useful' || row.feedback.reason === undefined ? '' : ` · ${reasonLabels[row.feedback.reason]}`}</li>)}
        {failed.slice(0, 5).map(row => <li key={`call:${row.callRef}`}><a className="underline" href={callHref(row.callRef)}>{row.state === 'outcome_unknown' ? 'Review uncertain Call' : 'Review refused Call'}</a></li>)}
      </ul>}
      <p className="text-xs text-muted-foreground">Showing up to five low-usefulness responses and five failed Calls. Signals exclude prompts and outputs. Founder content review is available on individual Calls.</p>
    </div>
  </AeSection>
}
