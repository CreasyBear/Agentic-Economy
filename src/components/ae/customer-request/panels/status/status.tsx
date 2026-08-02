import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import { formatTimestamp } from '@/lib/ui/format-time'
import type { ConversationTurn } from '../../workspace-types'
import {
  Conversation,
  WorkingUnderstanding,
  RecoveryActions,
  activityResponsibility,
  businessList,
  isPartialResult,
  readableResult,
} from '../shared'
import { RequestRecordLinks } from '../records'

export function ActionStatusCard({ projection, turns, refresh, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  refresh: () => Promise<void>
  edit: () => void
  restart: () => void
}) {
  const action = projection.action
  if (action === undefined) return null
  const unknown = action.state === 'unknown'
  const failed = action.state === 'failed'
  const notSent = failed && action.resolution === 'not_sent'
  const partialResult = unknown && isPartialResult(action.result)
  const multipleBusinesses = (projection.businesses?.length ?? 0) > 1
  const explanation = unknown
    ? multipleBusinesses
      ? 'The Request is preserved while AE checks evidence from the businesses. There will be no automatic retry.'
      : 'The Request is preserved while AE checks evidence from the business. There will be no automatic retry.'
    : notSent
      ? (projection.progress?.completed ?? 0) > 0
        ? 'No further business action occurred. Review the completed work before deciding what to do next.'
        : 'No business action occurred. Review or revise your request before trying another option.'
    : failed
      ? 'The failure is final for this action. AE did not send it again.'
      : action.resolution === 'reconciled'
        ? multipleBusinesses
          ? 'AE confirmed this from later evidence supplied by the same business connections.'
          : 'AE confirmed this from later evidence supplied by the same business connection.'
        : multipleBusinesses
          ? 'AE validated the result returned by the businesses.'
          : 'AE validated the result returned by the business.'
  return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <Card className="p-5">
      <div className="grid gap-4">
        <p className="text-sm font-semibold text-brand">
          {unknown ? 'Still confirming' : failed ? 'Could not be completed' : 'Completed'}
        </p>
        <h2 className="text-2xl font-semibold">{projection.summary}</h2>
        <p className="text-muted-foreground">{explanation}</p>
        {projection.activity === undefined ? null : <p className="font-semibold">
          {activityResponsibility(projection.activity.actor, projection.activity.certainty)}
        </p>}
        {projection.businesses === undefined ? null : <p className="text-muted-foreground">
          Through {businessList(projection.businesses.map(({ name }) => name))}
        </p>}
        {projection.progress === undefined || projection.progress.completed === 0 ? null : <div className="rounded-md border border-border bg-card p-4">
          <p className="font-semibold">{projection.progress.completed} of {projection.progress.total} business steps completed.</p>
          <p className="mt-1 text-sm text-muted-foreground">{unknown
            ? 'AE will not repeat the step whose result is still being confirmed.'
            : 'Completed steps remain recorded and will not be repeated automatically.'}</p>
        </div>}
        {action.result === undefined || notSent ? null : <div className="rounded-md border border-border bg-card p-4">
          <p className="text-sm font-semibold">{partialResult ? 'Partial result received' : 'Business result'}</p>
          <p className="mt-1 text-muted-foreground">{readableResult(action.result)}</p>
          {partialResult ? <p className="mt-1 text-sm text-muted-foreground">
            This is preserved evidence, not a completed result.
          </p> : null}
        </div>}
        <p className="text-sm text-muted-foreground">
          Last checked {formatTimestamp(action.observedAt)}
        </p>
        {projection.activity?.nextCheckAt === undefined ? null : <p className="text-sm text-muted-foreground">
          Check again after {formatTimestamp(projection.activity.nextCheckAt)}.
        </p>}
        {unknown ? <Button type="button" variant="default" onClick={() => void refresh()}>Check again</Button> : null}
        <RequestRecordLinks requestRef={projection.requestRef} />
        {unknown
          ? <p className="font-semibold">Wait for confirmation before changing or starting this Request again.</p>
          : <RecoveryActions edit={edit} restart={restart} />}
      </div>
    </Card>
  </section>
}
export function CancelledStatusCard({ projection, turns, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  edit: () => void
  restart: () => void
}) {
  const progress = projection.progress
  return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <Card className="p-5">
      <div className="grid gap-4">
        <p className="text-sm font-semibold text-brand">Stopped</p>
        <h2 className="text-2xl font-semibold">{projection.summary}</h2>
        {progress === undefined ? null : <>
          <p className="font-semibold">{progress.completed} of {progress.total} business steps completed.</p>
          <p className="text-muted-foreground">Step {progress.current.step} did not begin. Completed work remains recorded and will not be repeated automatically.</p>
        </>}
        <RequestRecordLinks requestRef={projection.requestRef} />
        <RecoveryActions edit={edit} restart={restart} />
      </div>
    </Card>
  </section>
}
