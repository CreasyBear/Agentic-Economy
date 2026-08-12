import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import { formatTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount } from '@/modules/money/public'
import { CUSTOMER_REQUEST_HUMAN_COMPREHENSION } from '@/modules/customer-request/public-comprehension'
import { CustomerRequestRepeatPermissionControl } from '../../CustomerRequestRepeatPermissionControl'
import type { ConversationTurn, CustomerRoute } from '../../workspace-types'
import { Conversation } from '../shared/conversation'
import { Fact, FactBlock, FactValue } from '../shared/fact'
import { WorkingUnderstanding } from '../shared/working-understanding'
import { RecoveryActions } from '../shared/recovery-actions'
import {
  activityResponsibility,
  businessList,
  readableLabel,
  effectLabel,
  reversibilityLabel,
  uncertaintyLabel,
} from '../shared/format'
import {
  CancellationDetail,
  EffectsDetail,
  FullRouteDisclosure,
  RouteDisclosureDetails,
  SharingDetail,
  SharingSummary,
  RouteDisclosure,
} from './route-disclosure'
import { RequestRecordLinks } from '../records/records'

export function RouteDecisionCard({ projection, turns, review, check, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  review: (routeRef: string) => void
  check: () => Promise<void>
  edit: () => void
  restart: () => void
}) {
  const decision = projection.decision
  if (decision === undefined) return null
  const recommendation = decision.comparison.kind === 'recommended' ? decision.comparison : undefined
  const recommendedRoute = recommendation === undefined
    ? undefined
    : decision.routes.find(({ routeRef }) => routeRef === recommendation.routeRef)
  return <section className="mx-auto grid w-full max-w-4xl gap-6" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <header className="grid gap-2">
      <p className="text-sm font-semibold text-brand">Ways forward</p>
      <h2 className="text-3xl font-semibold">{decision.outcome.summary}</h2>
      <p className="block text-muted-foreground">{decision.outcome.kind === 'routes_expired'
        ? 'Your Request is preserved. Check again to rebuild the available ways forward from current business information.'
        : 'Compare cost, who is involved, what you share, and what happens if something goes wrong.'}</p>
      {/* The comparison summary restates the count in the heading and adds the
          not-a-recommendation boundary. Keep the exact string, demote the weight
          so it reads as a qualifier instead of a second headline. */}
      <p className="block text-sm text-muted-foreground">{decision.comparison.summary}</p>
    </header>
    {recommendation === undefined ? null : <Card className="p-4">
      <p className="font-semibold">Why AE recommends this way</p>
      <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
        {recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      <p className="mt-3 text-sm font-semibold">Tradeoffs checked</p>
      <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
        {recommendation.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}
      </ul>
      {recommendation.commercialInfluence === 'disclosed'
        ? <div className="mt-3 grid gap-1">
          <p className="text-muted-foreground">
            Commercial relationships did not change eligibility, inclusion, or order.
          </p>
          {recommendedRoute?.comparison.commercialInfluence.status === 'disclosed'
            ? recommendedRoute.comparison.commercialInfluence.summaries.map((summary) => (
              <p key={summary} className="text-sm text-muted-foreground">{summary}</p>
            ))
            : null}
        </div>
        : null}
    </Card>}
    {decision.changes.kind === 'changed'
      ? <DecisionChanges changes={decision.changes.items} routes={decision.routes} />
      : null}
    <div className="grid gap-4">
      {decision.routes.map((route, index) => <Card key={route.routeRef} className="p-5">
        <article className="grid gap-5">
          <div className="grid gap-1">
            <p className="text-sm text-muted-foreground">
              {route.availability === 'expired'
                ? 'Expired way forward'
                : recommendation?.routeRef === route.routeRef
                  ? 'Recommended for your stated priority'
                  : decision.routes.length === 1
                    ? 'Current way forward'
                    : recommendation === undefined
                      ? `Current way forward ${index + 1}`
                      : `Other way forward ${index + 1}`}
            </p>
            <h3 className="text-xl font-semibold">{route.result.summary}</h3>
            <p className="text-muted-foreground">Through {businessList(route.businesses.map(({ name }) => name))}</p>
            {route.result.deliverables.length === 0 ? null : <p className="text-sm text-muted-foreground">
              Expected result: {route.result.deliverables.join(', ')}
            </p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Fact label="Cost">
              <FactValue tone={route.maximumTotalCost.kind === 'known' ? 'material' : 'unresolved'}>
                {route.maximumTotalCost.kind === 'known'
                  ? `Maximum ${formatCurrencyAmount(route.maximumTotalCost.amount)}`
                  : 'Price needs confirmation'}
              </FactValue>
            </Fact>
            <Fact label="Available until">
              <FactValue>{formatTimestamp(route.validUntil)}</FactValue>
            </Fact>
          </div>
          <FactBlock label="Why it fits">
            <p className="text-muted-foreground">{route.comparison.hardConstraints === 'satisfied'
              ? 'It covers the requested result and the details AE could verify.'
              : 'The businesses can return the stated result. Some details in your request still need confirmation.'}</p>
          </FactBlock>
          {/* Consequence before housekeeping: what leaves and what cannot be undone
              lead, and the routine declarations follow in the same row. */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span className="font-semibold text-foreground">{route.dataUse.recipientCount} information {route.dataUse.recipientCount === 1 ? 'recipient' : 'recipients'}</span>
            <span className="font-semibold text-foreground">{route.comparison.irreversibleEffectCount} irreversible {route.comparison.irreversibleEffectCount === 1 ? 'effect' : 'effects'}</span>
            <span className="text-muted-foreground">{route.comparison.recovery === 'retry_safe' ? 'Safe retry after confirmed failure' : 'Check required before retry'}</span>
            <span className="text-muted-foreground">{route.comparison.duration === 'not_declared' ? 'Timing not declared' : route.comparison.duration}</span>
          </div>
          <RouteImportantDetails route={route} />
          <RouteDisclosure defaultIsOpen={false} trigger={<span className="text-base font-semibold">How it works</span>}>
            <ol className="mt-3 grid gap-3 text-sm text-muted-foreground">
              {(route.steps ?? []).map((step) => <li key={step.step}>
                <strong>Step {step.step}: {step.business.name}.</strong>{' '}
                {step.after.length === 0
                  ? 'This starts the work.'
                  : `${step.business.name} will follow ${step.after.length === 1 ? `step ${step.after[0]}` : `steps ${step.after.join(', ')}`}.`}
              </li>)}
            </ol>
          </RouteDisclosure>
          {/* Natural width so the action reads as a control, not a banner. */}
          <div className="justify-self-start">
            {route.availability === 'current' && route.maximumTotalCost.kind === 'known'
              ? <Button type="button" variant="default" onClick={() => review(route.routeRef)}>Review this option</Button>
              : <Button type="button" variant="secondary" onClick={() => void check()}>Check current options</Button>}
          </div>
        </article>
      </Card>)}
    </div>
    <Card className="p-4">
      <p className="block text-muted-foreground">You decide before AE shares details or starts work.</p>
    </Card>
    <RecoveryActions edit={edit} restart={restart} />
  </section>
}
function RouteImportantDetails({ route }: { route: CustomerRoute }) {
  return <RouteDisclosure defaultIsOpen={false} trigger={<span className="text-base font-semibold">Important details</span>}>
    <div className="mt-4 grid gap-5">
      <RouteDisclosureDetails route={route} />
    </div>
  </RouteDisclosure>
}
function repeatPermissionEligible(route: CustomerRoute): boolean {
  return route.availability === 'current'
    && route.maximumTotalCost.kind === 'known'
    && route.effects.length > 0
    && route.effects.every((effect) => effect.kind === 'information_shared')
}
/**
 * The confirm gate. Restarting is deliberately not offered here: it destroys
 * the Request, which is a different task from deciding this choice. Declining
 * returns to the decision surface, where restarting stays one click away.
 */
export function RouteReviewCard({ projection, routeRef, turns, confirm, reportUnavailable, routeFeedback, setRouteFeedback, decline, edit }: {
  projection: CustomerRequestView
  routeRef: string
  turns: readonly ConversationTurn[]
  confirm: () => Promise<void>
  reportUnavailable: () => Promise<void>
  routeFeedback: string
  setRouteFeedback: (feedback: string) => void
  decline: () => void
  edit: () => void
}) {
  const route = projection.decision?.routes.find((candidate) => candidate.routeRef === routeRef)
  const actions = projection.decision?.actions
  if (route === undefined || actions === undefined) return <Card className="mx-auto w-full max-w-4xl p-5" aria-live="polite">
    <div className="grid gap-4">
      <h2 className="text-2xl font-semibold">This choice is no longer available.</h2>
      <p className="text-muted-foreground">Return to the current options before deciding. Your choice was not confirmed.</p>
      <Button type="button" variant="default" onClick={decline}>Return to options</Button>
    </div>
  </Card>
  return <section className="mx-auto grid w-full max-w-4xl gap-6" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <header className="grid gap-2">
      <p className="text-sm font-semibold text-brand">Your choice</p>
      <h2 className="text-3xl font-semibold">Review before you confirm</h2>
    </header>
    <Card className="p-5">
      <div className="grid gap-6">
        <div className="grid gap-1">
          <h3 className="text-xl font-semibold">{route.result.summary}</h3>
          <p className="text-muted-foreground">Through {businessList(route.businesses.map(({ name }) => name))}</p>
          {route.result.deliverables.length === 0 ? null : <p className="text-sm text-muted-foreground">Expected result: {route.result.deliverables.join(', ')}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Fact label="Cost">
            <FactValue tone={route.maximumTotalCost.kind === 'known' ? 'material' : 'unresolved'}>
              {route.maximumTotalCost.kind === 'known'
                ? `Maximum ${formatCurrencyAmount(route.maximumTotalCost.amount)}`
                : 'Price needs confirmation'}
            </FactValue>
          </Fact>
          <Fact label="Confirm before">
            <FactValue>{formatTimestamp(route.validUntil)}</FactValue>
          </Fact>
          <Fact label="Shared">
            <SharingSummary route={route} />
          </Fact>
        </div>
        <div className="grid justify-items-start gap-3 pt-6">
          <Separator />
          <Button type="button" variant="default" onClick={() => void confirm()}>Confirm this choice</Button>
          <p className="block text-sm text-muted-foreground">
            Confirming gives AE permission for this exact choice and maximum cost. AE will ask before sharing information or starting work.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {repeatPermissionEligible(route)
              ? <CustomerRequestRepeatPermissionControl projection={projection} route={route} />
              : null}
            <Button type="button" variant="ghost" onClick={edit}>Change this Request</Button>
            <Button type="button" variant="ghost" onClick={decline}>Decline this choice</Button>
          </div>
        </div>
        <div className="grid gap-5 pt-6">
          <Separator />
          <SharingDetail route={route} emptyLabel="Nothing is shared." />
          <EffectsDetail route={route} label="What starting changes" />
          <CancellationDetail route={route} />
          <p className="text-sm text-muted-foreground">{actions.start.summary}</p>
        </div>
        <div className="pt-6">
          <Separator />
          <FullRouteDisclosure route={route} subject="choice" />
        </div>
        <div className="pt-6">
          <Separator />
          <RouteDisclosure
            defaultIsOpen={false}
            trigger={<span className="text-base font-semibold">This option does not work?</span>}
          >
            <FieldGroup className="gap-3 pt-4">
              <p className="text-muted-foreground">Tell AE what makes this exact option unsuitable. Your request stays here while AE looks for a different current option.</p>
              <Field>
                <FieldLabel htmlFor="route-feedback">Why does this option not work?</FieldLabel>
                <Textarea
                  id="route-feedback"
                  value={routeFeedback}
                  onChange={(event) => setRouteFeedback(event.target.value)}
                  rows={3}
                  maxLength={2_000}
                  required
                  className="min-h-20 resize-y"
                />
              </Field>
              <Field orientation="horizontal">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={routeFeedback.trim().length === 0}
                  onClick={() => void reportUnavailable()}
                >
                  Find another option
                </Button>
              </Field>
            </FieldGroup>
          </RouteDisclosure>
        </div>
      </div>
    </Card>
  </section>
}
export function RouteConfirmationCard({ projection, turns, start, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  start: () => Promise<void>
  edit: () => void
  restart: () => void
}) {
  const confirmation = projection.confirmation
  if (confirmation === undefined) return null
  const route = confirmation.route
  return <section className="mx-auto grid w-full max-w-4xl gap-6" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <Card className="p-5">
      <div className="grid gap-5">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-brand">Choice confirmed</p>
          <h2 className="text-2xl font-semibold">{route.result.summary}</h2>
          <p className="text-muted-foreground">Through {businessList(route.businesses.map(({ name }) => name))}. Nothing has started yet.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-sm font-semibold">Confirmed until</p><p className="text-muted-foreground">{formatTimestamp(confirmation.validUntil)}</p></div>
        </div>
        <div><p className="font-semibold">Information recipients</p><ul className="mt-2 grid gap-1 text-sm text-muted-foreground">{route.dataUse.recipients.map((recipient) => <li key={recipient.recipientRef}>{recipient.name} — {recipient.purposes.map(readableLabel).join(', ')}. Fields: {recipient.fields.map(({ label, classification }) => `${label} (${classification})`).join(', ')}</li>)}</ul></div>
        <div><p className="font-semibold">What changes</p><ul className="mt-2 grid gap-1 text-sm text-muted-foreground">{route.effects.map((effect) => <li key={`${effect.kind}:${effect.reversibility}`}>{effectLabel(effect.kind)} — {reversibilityLabel(effect.reversibility)}</li>)}</ul></div>
        <div><p className="font-semibold">Evidence expected</p><p className="mt-1 text-muted-foreground">{route.evidence.map(({ label }) => label).join(', ') || 'No completion evidence is declared.'}</p></div>
        <div><p className="font-semibold">What still needs confirmation</p><p className="mt-1 text-muted-foreground">{route.uncertainty.length === 0 ? 'No uncertainty is declared for this choice.' : route.uncertainty.map(uncertaintyLabel).join(', ')}</p></div>
        <div><p className="font-semibold">Fallback</p><p className="mt-1 text-muted-foreground">{route.fallback.available ? `${route.fallback.alternatives.length} alternative ${route.fallback.alternatives.length === 1 ? 'way is' : 'ways are'} available before work starts.` : 'No alternative way is currently declared.'}</p></div>
        <div><p className="font-semibold">Cancellation</p><p className="mt-1 text-muted-foreground">{route.cancellation.summary}</p></div>
        <div><p className="font-semibold">Recovery by step</p><ul className="mt-2 grid gap-1 text-sm text-muted-foreground">{route.recovery.map((recovery) => <li key={recovery.step}>Step {recovery.step}, {recovery.businessName}: {recovery.posture === 'retry_safe' ? 'AE can safely retry after a confirmed failure.' : 'AE must check what happened before any retry.'}</li>)}</ul></div>
        <p className="text-sm text-muted-foreground">Confirmation code {confirmation.confirmationRef}</p>
        <Button type="button" variant="default" onClick={() => void start()}>Start now</Button>
      </div>
    </Card>
    <RecoveryActions edit={edit} restart={restart} />
  </section>
}
export function RouteProgressCard({ projection, turns, refresh, cancel, edit, restart }: {
  projection: CustomerRequestView
  turns: readonly ConversationTurn[]
  refresh: () => Promise<void>
  cancel: () => Promise<void>
  edit: () => void
  restart: () => void
}) {
  const progress = projection.progress
  if (progress === undefined) return null
  const stateLabel = progress.current.state === 'queued'
    ? 'Waiting to begin'
    : progress.current.state === 'leased'
      ? 'Working through the active transport handoff'
      : progress.current.state === 'ready_to_contact'
        ? 'Preparing business contact'
        : progress.current.state === 'contacting'
          ? 'Contacting the business'
          : progress.current.state === 'awaiting_result'
            ? 'Waiting for the business result'
            : progress.current.state === 'completed'
              ? 'Business result checked'
              : 'Needs attention'
  return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <Card className="p-5">
      <div className="grid gap-4">
        <p className="text-sm font-semibold text-brand">In progress</p>
        <h2 className="text-2xl font-semibold">{projection.summary}</h2>
        <p className="font-semibold">Step {progress.current.step} of {progress.total}</p>
        <p className="text-muted-foreground">{stateLabel}</p>
        {projection.activity === undefined ? null : <p className="font-semibold">
          {activityResponsibility(projection.activity.actor, projection.activity.certainty)}
        </p>}
        <p className="text-sm text-muted-foreground">{progress.completed} of {progress.total} steps completed. Rechecking will not send the work again.</p>
        {progress.dependencies === undefined ? null : <div className="grid gap-2 rounded-md border border-border bg-card p-4">
          {progress.dependencies.completed.map(({ step, business }) => (
            <p key={`completed:${step}`} className="text-sm text-muted-foreground">Completed: {business}</p>
          ))}
          {progress.dependencies.blocked.map(({ step, business, waitingForBusiness }) => (
            <p key={`blocked:${step}`} className="text-sm text-muted-foreground">
              Waiting: {business}, after {waitingForBusiness}
            </p>
          ))}
        </div>}
        <p className="text-sm text-muted-foreground">AE is acting only within the choice you confirmed.</p>
        {cancellationMessage(projection.activity?.cancellation)}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="default" onClick={() => void refresh()}>Check progress</Button>
          {cancellationAvailable(projection.activity?.cancellation)
            ? <Button type="button" variant="secondary" onClick={() => void cancel()}>Stop before the next step</Button>
            : null}
        </div>
        <RequestRecordLinks requestRef={projection.requestRef} />
        <RecoveryActions edit={edit} restart={restart} />
      </div>
    </Card>
  </section>
}
function cancellationAvailable(
  cancellation: NonNullable<CustomerRequestView['activity']>['cancellation'] | undefined,
): boolean {
  return cancellation === 'available_before_next_step'
    || (typeof cancellation === 'object' && cancellation.state === 'available')
}
function cancellationMessage(
  cancellation: NonNullable<CustomerRequestView['activity']>['cancellation'] | undefined,
) {
  if (typeof cancellation === 'object' && cancellation.state === 'available') {
    return <p className="text-sm text-muted-foreground">
      AE will not release the next business step before {formatTimestamp(cancellation.releaseMayStartAt)}.
    </p>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'pending') {
    return <div className="grid gap-1">
      <p className="text-sm text-muted-foreground">
        AE sent one stop request to the business. The business has not confirmed the outcome yet.
      </p>
      <p className="text-sm text-muted-foreground">
        Sent at {formatTimestamp(cancellation.requestedAt)}. Check again after {formatTimestamp(cancellation.nextCheckAt)}.
        {' '}AE will not send the stop request twice.
      </p>
    </div>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'unknown') {
    return <div className="grid gap-1">
      <p className="text-sm text-muted-foreground">
        AE cannot yet confirm whether the business received or accepted the stop request.
      </p>
      <p className="text-sm text-muted-foreground">
        Sent at {formatTimestamp(cancellation.requestedAt)}; uncertainty recorded at {formatTimestamp(cancellation.observedAt)}.
        {' '}AE will not repeat it while the outcome is unknown. Check again after {formatTimestamp(cancellation.nextCheckAt)}.
      </p>
    </div>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'rejected') {
    return <div className="grid gap-1">
      <p className="text-sm text-muted-foreground">
        The business declined the stop request. The current work may continue.
      </p>
      <p className="text-sm text-muted-foreground">
        AE sent the stop request at {formatTimestamp(cancellation.requestedAt)}.
      </p>
      <p className="text-sm text-muted-foreground">
        The business response was recorded at {formatTimestamp(cancellation.observedAt)}; AE will not send the stop request twice.
      </p>
    </div>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'not_available'
    && cancellation.reason === 'business_step_leased') {
    return <div className="grid gap-1">
      <p className="text-sm text-muted-foreground">
        AE is finishing the active transport handoff for this business step. It has not been released to the business yet.
      </p>
      <p className="text-sm text-muted-foreground">
        Check progress again while AE resolves this step. AE will not send it twice.
      </p>
    </div>
  }
  if (typeof cancellation !== 'object' || cancellation.state !== 'not_available'
    || cancellation.reason !== 'business_step_released') return null
  return <div className="grid gap-1">
    <p className="text-sm text-muted-foreground">
      {cancellation.requestedAt === undefined
        ? 'This business step has started, so AE can no longer stop it before release.'
        : 'You asked AE to stop, but the business step had already started.'}
    </p>
    <p className="text-sm text-muted-foreground">
      The business step was released at {formatTimestamp(cancellation.changedAt)}.
    </p>
    {cancellation.requestedAt === undefined ? null : <p className="text-sm text-muted-foreground">
      AE recorded your stop request at {formatTimestamp(cancellation.requestedAt)}.
    </p>}
  </div>
}
export function ConfirmationLoadingCard() {
  return <Card className="mx-auto w-full max-w-4xl p-5" aria-live="polite" aria-busy="true">
    <div className="grid gap-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-[72%]" />
      <Skeleton className="h-4 w-[55%]" />
      <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      <Skeleton className="h-28 w-full" />
      <p className="text-muted-foreground">Confirming your choice. Work has not started.</p>
    </div>
  </Card>
}
function DecisionChanges({ changes, routes }: {
  changes: Extract<NonNullable<CustomerRequestView['decision']>['changes'], { kind: 'changed' }>['items']
  routes: NonNullable<CustomerRequestView['decision']>['routes']
}) {
  const resultNames = new Map(routes.map(({ result }) => [result.resultRef, result.summary]))
  for (const change of changes) {
    if (change.kind !== 'route_result') continue
    for (const result of [...change.before.results, ...change.after.results]) {
      resultNames.set(result.resultRef, result.summary)
    }
  }
  return <Card className="p-4">
    <div className="grid gap-2">
      <h3 className="text-xl font-semibold">What changed</h3>
      <ul className="grid gap-1 text-sm text-muted-foreground">
        {changes.map((change) => <li key={change.kind}>{decisionChangeLabel(change, resultNames)}</li>)}
      </ul>
    </div>
  </Card>
}
function decisionChangeLabel(
  change: Extract<NonNullable<CustomerRequestView['decision']>['changes'], { kind: 'changed' }>['items'][number],
  resultNames: ReadonlyMap<string, string>,
): string {
  if (change.kind === 'request_criteria') {
    return `What matters changed. Before: ${criteriaList(change.before)}. Now: ${criteriaList(change.after)}.`
  }
  if (change.kind === 'maximum_cost' && change.before.length === 1 && change.after.length === 1
    && change.before[0]?.cost.kind === 'known' && change.after[0]?.cost.kind === 'known') {
    return `The maximum for ${resultName(change.after[0].resultRef, resultNames)} changed from ${formatCurrencyAmount(change.before[0].cost.amount)} to ${formatCurrencyAmount(change.after[0].cost.amount)}.`
  }
  if (change.kind === 'maximum_cost') {
    return `Maximum costs changed. Before: ${costList(change.before, resultNames)}. Now: ${costList(change.after, resultNames)}.`
  }
  if (change.kind === 'route_result') {
    return `Ways forward changed. Before: ${resultList(change.before.results)}. Now: ${resultList(change.after.results)}.`
  }
  if (change.kind === 'businesses') {
    return `Businesses changed. Before: ${routeBusinessList(change.before, resultNames)}. Now: ${routeBusinessList(change.after, resultNames)}.`
  }
  if (change.kind === 'step_shape') {
    return `The sequence changed. Before: ${shapeList(change.before, resultNames)}. Now: ${shapeList(change.after, resultNames)}.`
  }
  if (change.kind === 'data_use') {
    return `Information sharing changed. Before: ${recipientList(change.before, resultNames)}. Now: ${recipientList(change.after, resultNames)}.`
  }
  if (change.kind === 'effects') {
    return `Consequences changed. Before: ${effectsList(change.before, resultNames)}. Now: ${effectsList(change.after, resultNames)}.`
  }
  if (change.kind === 'evidence') {
    return `Required evidence changed. Before: ${evidenceList(change.before, resultNames)}. Now: ${evidenceList(change.after, resultNames)}.`
  }
  if (change.kind === 'uncertainty') {
    return `Uncertainty changed. Before: ${uncertaintyList(change.before, resultNames)}. Now: ${uncertaintyList(change.after, resultNames)}.`
  }
  if (change.kind === 'expiry') {
    return `Availability changed. Before: ${dateList(change.before, resultNames)}. Now: ${dateList(change.after, resultNames)}.`
  }
  if (change.kind === 'fallback') {
    return `Fallbacks changed. Before: ${fallbackList(change.before, resultNames)}. Now: ${fallbackList(change.after, resultNames)}.`
  }
  if (change.kind === 'recovery') {
    return `Recovery changed. Before: ${recoveryList(change.before, resultNames)}. Now: ${recoveryList(change.after, resultNames)}.`
  }
  return `Cancellation changed. Before: ${cancellationList(change.before, resultNames)}. Now: ${cancellationList(change.after, resultNames)}.`
}
function criteriaList(criteria: readonly Readonly<{ label: string; value: unknown }>[]): string {
  return criteria.map(({ label, value }) => `${label}: ${customerValue(value)}`).join('; ')
}
function customerValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value !== null && typeof value === 'object' && 'currency' in value && 'units' in value && 'exponent' in value
    && typeof value.currency === 'string' && typeof value.units === 'string' && typeof value.exponent === 'number') {
    const formatted = formatCurrencyAmount({ currency: value.currency, units: value.units, exponent: value.exponent })
    if (formatted !== undefined) return formatted
  }
  return JSON.stringify(value)
}
function costList(
  costs: readonly { resultRef: string; cost: NonNullable<CustomerRequestView['decision']>['routes'][number]['maximumTotalCost'] }[],
  names: ReadonlyMap<string, string>,
): string {
  return costs.map(({ resultRef, cost }) => `${resultName(resultRef, names)}: ${cost.kind === 'known'
    ? formatCurrencyAmount(cost.amount)
    : 'price needs confirmation'}`).join(', ') || 'none'
}
function routeBusinessList(
  routes: readonly { resultRef: string; businesses: readonly { name: string }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, businesses }) => (
    `${resultName(resultRef, names)}: ${businessList(businesses.map(({ name }) => name))}`
  )).join('; ') || 'none'
}
function resultList(results: readonly { summary: string; position?: number | undefined }[]): string {
  return results.map((result) => result.position === undefined
    ? result.summary
    : `${result.summary} (position ${result.position})`).join('; ') || 'none'
}
function shapeList(
  shapes: readonly { resultRef: string; steps: number; dependencies: number }[],
  names: ReadonlyMap<string, string>,
): string {
  return shapes.map(({ resultRef, steps, dependencies }) => (
    `${resultName(resultRef, names)}: ${steps} ${steps === 1 ? 'step' : 'steps'}, ${dependencies} ${dependencies === 1 ? 'dependency' : 'dependencies'}`
  )).join('; ') || 'none'
}
function recipientList(
  routes: readonly { resultRef: string; recipients: readonly { name: string; purposes: readonly string[] }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, recipients }) => `${resultName(resultRef, names)}: ${recipients
    .map(({ name, purposes }) => `${name} for ${purposes.map(readableLabel).join(', ')}`).join(', ') || 'none'}`)
    .join('; ') || 'none'
}
function effectsList(
  routes: readonly { resultRef: string; effects: readonly { kind: 'information_shared' | 'financial_commitment' | 'external_change'; reversibility: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible' }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, effects }) => `${resultName(resultRef, names)}: ${effects
    .map(({ kind, reversibility }) => `${effectLabel(kind)} (${reversibilityLabel(reversibility)})`).join(', ') || 'none'}`)
    .join('; ') || 'none'
}
function evidenceList(
  routes: readonly { resultRef: string; evidence: readonly { label: string; purpose: 'comparison' | 'completion' | 'recovery' }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, evidence }) => `${resultName(resultRef, names)}: ${evidence
    .map(({ label, purpose }) => `${label} for ${readableLabel(purpose)}`).join(', ') || 'none'}`)
    .join('; ') || 'none'
}
function uncertaintyList(
  routes: readonly {
    resultRef: string
    uncertainty: readonly ('price_needs_confirmation' | 'customer_fact_needs_evidence')[]
  }[],
  names: ReadonlyMap<string, string>,
): string {
  return routes.map(({ resultRef, uncertainty }) => `${resultName(resultRef, names)}: ${uncertainty
    .map(uncertaintyLabel).join(', ') || 'none'}`).join('; ') || 'none'
}
function dateList(
  values: readonly { resultRef: string; validUntil: number }[],
  names: ReadonlyMap<string, string>,
): string {
  return values.map(({ resultRef, validUntil }) => `${resultName(resultRef, names)}: ${formatTimestamp(validUntil)}`)
    .join(', ') || 'none'
}
function fallbackList(
  values: readonly { resultRef: string; alternatives: readonly { summary: string }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return values.map(({ resultRef, alternatives }) => `${resultName(resultRef, names)}: ${alternatives
    .map(({ summary }) => summary).join(', ') || 'none'}`).join('; ') || 'none'
}
function recoveryList(
  values: readonly { resultRef: string; steps: readonly { step: number; businessName: string; posture: 'retry_safe' | 'reconcile_required' }[] }[],
  names: ReadonlyMap<string, string>,
): string {
  return values.map(({ resultRef, steps }) => `${resultName(resultRef, names)}: ${steps.map((step) => (
    `step ${step.step}, ${step.businessName}: ${step.posture === 'retry_safe' ? 'safe retry' : 'check before retry'}`
  )).join(', ') || 'none'}`).join('; ') || 'none'
}
function cancellationList(
  values: readonly { resultRef: string; cancellation: { summary: string } }[],
  names: ReadonlyMap<string, string>,
): string {
  return values.map(({ resultRef, cancellation }) => `${resultName(resultRef, names)}: ${cancellation.summary}`)
    .join('; ') || 'none'
}
function resultName(resultRef: string, names: ReadonlyMap<string, string>): string {
  return names.get(resultRef)?.replace(/[.!?]+$/u, '') ?? 'This way forward'
}
