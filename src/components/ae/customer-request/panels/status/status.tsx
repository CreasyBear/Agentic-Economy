import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
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
    <Card padding={5}>
      <div className="grid gap-4">
        <Text className="text-sm font-semibold text-accent">
          {unknown ? 'Still confirming' : failed ? 'Could not be completed' : 'Completed'}
        </Text>
        <Heading level={2}>{projection.summary}</Heading>
        <Text color="secondary">{explanation}</Text>
        {projection.activity === undefined ? null : <Text weight="semibold">
          {activityResponsibility(projection.activity.actor, projection.activity.certainty)}
        </Text>}
        {projection.businesses === undefined ? null : <Text color="secondary">
          Through {businessList(projection.businesses.map(({ name }) => name))}
        </Text>}
        {projection.progress === undefined || projection.progress.completed === 0 ? null : <div className="rounded-md border border-border bg-surface p-4">
          <Text weight="semibold">{projection.progress.completed} of {projection.progress.total} business steps completed.</Text>
          <Text type="supporting" color="secondary" className="mt-1">{unknown
            ? 'AE will not repeat the step whose result is still being confirmed.'
            : 'Completed steps remain recorded and will not be repeated automatically.'}</Text>
        </div>}
        {action.result === undefined || notSent ? null : <div className="rounded-md border border-border bg-surface p-4">
          <Text type="supporting" weight="semibold">{partialResult ? 'Partial result received' : 'Business result'}</Text>
          <Text color="secondary" className="mt-1">{readableResult(action.result)}</Text>
          {partialResult ? <Text type="supporting" color="secondary" className="mt-1">
            This is preserved evidence, not a completed result.
          </Text> : null}
        </div>}
        <Text type="supporting" color="secondary">
          Last checked {new Date(action.observedAt).toLocaleString()}
        </Text>
        {projection.activity?.nextCheckAt === undefined ? null : <Text type="supporting" color="secondary">
          Check again after {new Date(projection.activity.nextCheckAt).toLocaleString()}.
        </Text>}
        {unknown ? <Button label="Check again" variant="primary" clickAction={refresh} /> : null}
        <RequestRecordLinks requestRef={projection.requestRef} />
        {unknown
          ? <Text weight="semibold">Wait for confirmation before changing or starting this Request again.</Text>
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
    <Card padding={5}>
      <div className="grid gap-4">
        <Text className="text-sm font-semibold text-accent">Stopped</Text>
        <Heading level={2}>{projection.summary}</Heading>
        {progress === undefined ? null : <>
          <Text weight="semibold">{progress.completed} of {progress.total} business steps completed.</Text>
          <Text color="secondary">Step {progress.current.step} did not begin. Completed work remains recorded and will not be repeated automatically.</Text>
        </>}
        <RequestRecordLinks requestRef={projection.requestRef} />
        <RecoveryActions edit={edit} restart={restart} />
      </div>
    </Card>
  </section>
}
