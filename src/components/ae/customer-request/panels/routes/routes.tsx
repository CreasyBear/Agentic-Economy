import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import { CUSTOMER_REQUEST_PUBLIC_COMPREHENSION } from '@/modules/customer-request/public-comprehension'
import { CustomerRequestRepeatPermissionControl } from '../../CustomerRequestRepeatPermissionControl'
import type { ConversationTurn, CustomerRoute } from '../../workspace-types'
import {
  Conversation,
  Fact,
  FactBlock,
  FactValue,
  WorkingUnderstanding,
  RecoveryActions,
  activityResponsibility,
  formatMoney,
  formatOptionTime,
  businessList,
  readableLabel,
  effectLabel,
  reversibilityLabel,
  uncertaintyLabel,
} from '../shared'
import {
  CancellationDetail,
  EffectsDetail,
  FullRouteDisclosure,
  RouteDisclosureDetails,
  SharingDetail,
  SharingSummary,
} from './route-disclosure'
import { RequestRecordLinks } from '../records'

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
      <Text className="text-sm font-semibold text-accent">Ways forward</Text>
      <Heading level={2} className="text-3xl">{decision.outcome.summary}</Heading>
      <Text color="secondary" className="block">{decision.outcome.kind === 'routes_expired'
        ? 'Your Request is preserved. Check again to rebuild the available ways forward from current business information.'
        : 'Compare cost, who is involved, what you share, and what happens if something goes wrong.'}</Text>
      {/* The comparison summary restates the count in the heading and adds the
          not-a-recommendation boundary. Keep the exact string, demote the weight
          so it reads as a qualifier instead of a second headline. */}
      <Text type="supporting" color="secondary" className="block">{decision.comparison.summary}</Text>
    </header>
    {recommendation === undefined ? null : <Card padding={4}>
      <Text weight="semibold">Why AE recommends this way</Text>
      <ul className="mt-2 grid gap-1 text-sm text-secondary">
        {recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      <Text type="supporting" weight="semibold" className="mt-3">Tradeoffs checked</Text>
      <ul className="mt-1 grid gap-1 text-sm text-secondary">
        {recommendation.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}
      </ul>
      {recommendation.commercialInfluence === 'disclosed'
        ? <div className="mt-3 grid gap-1">
          <Text color="secondary">
            Commercial relationships did not change eligibility, inclusion, or order.
          </Text>
          {recommendedRoute?.comparison.commercialInfluence.status === 'disclosed'
            ? recommendedRoute.comparison.commercialInfluence.summaries.map((summary) => (
              <Text key={summary} type="supporting" color="secondary">{summary}</Text>
            ))
            : null}
        </div>
        : null}
    </Card>}
    {decision.changes.kind === 'changed'
      ? <DecisionChanges changes={decision.changes.items} routes={decision.routes} />
      : null}
    <div className="grid gap-4">
      {decision.routes.map((route, index) => <Card key={route.routeRef} padding={5}>
        <article className="grid gap-5">
          <div className="grid gap-1">
            <Text type="supporting" color="secondary">
              {route.availability === 'expired'
                ? 'Expired way forward'
                : recommendation?.routeRef === route.routeRef
                  ? 'Recommended for your stated priority'
                  : decision.routes.length === 1
                    ? 'Current way forward'
                    : recommendation === undefined
                      ? `Current way forward ${index + 1}`
                      : `Other way forward ${index + 1}`}
            </Text>
            <Heading level={3}>{route.result.summary}</Heading>
            <Text color="secondary">Through {businessList(route.businesses.map(({ name }) => name))}</Text>
            {route.result.deliverables.length === 0 ? null : <Text type="supporting" color="secondary">
              Expected result: {route.result.deliverables.join(', ')}
            </Text>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Fact label="Cost">
              <FactValue tone={route.maximumTotalCost.kind === 'known' ? 'material' : 'unresolved'}>
                {route.maximumTotalCost.kind === 'known'
                  ? `Maximum ${formatMoney(route.maximumTotalCost.currency, route.maximumTotalCost.amountMinor)}`
                  : 'Price needs confirmation'}
              </FactValue>
            </Fact>
            <Fact label="Available until">
              <FactValue>{formatOptionTime(route.validUntil)}</FactValue>
            </Fact>
          </div>
          <FactBlock label="Why it fits">
            <Text color="secondary">{route.comparison.hardConstraints === 'satisfied'
              ? 'It covers the requested result and every constraint AE could verify.'
              : 'The registered steps can return the stated result. AE has not independently verified every detail in your Request.'}</Text>
          </FactBlock>
          {/* Consequence before housekeeping: what leaves and what cannot be undone
              lead, and the routine declarations follow in the same row. */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span className="font-semibold text-primary">{route.dataUse.recipientCount} information {route.dataUse.recipientCount === 1 ? 'recipient' : 'recipients'}</span>
            <span className="font-semibold text-primary">{route.comparison.irreversibleEffectCount} irreversible {route.comparison.irreversibleEffectCount === 1 ? 'effect' : 'effects'}</span>
            <span className="text-secondary">{route.comparison.recovery === 'retry_safe' ? 'Safe retry after confirmed failure' : 'Check required before retry'}</span>
            <span className="text-secondary">{route.comparison.duration === 'not_declared' ? 'Timing not declared' : route.comparison.duration}</span>
          </div>
          <RouteImportantDetails route={route} />
          <Collapsible defaultIsOpen={false} trigger={<span className="text-base font-semibold">How it works</span>}>
            <ol className="mt-3 grid gap-3 text-sm text-secondary">
              {(route.steps ?? []).map((step) => <li key={step.step}>
                <strong>Step {step.step}: {step.business.name}.</strong>{' '}
                {step.after.length === 0
                  ? 'This starts the work.'
                  : `${step.business.name} will follow ${step.after.length === 1 ? `step ${step.after[0]}` : `steps ${step.after.join(', ')}`}.`}
              </li>)}
            </ol>
          </Collapsible>
          {/* Natural width so the action reads as a control, not a banner. */}
          <div className="justify-self-start">
            {route.availability === 'current' && route.maximumTotalCost.kind === 'known'
              ? <Button label="Review this option" variant="primary" clickAction={() => review(route.routeRef)} />
              : <Button label="Check current options" variant="secondary" clickAction={() => void check()} />}
          </div>
        </article>
      </Card>)}
    </div>
    <Card padding={4}>
      <Text color="secondary" className="block">Nothing is authorized or shared until you confirm a choice.</Text>
      {/* The sandbox boundary names which businesses these examples use. That
          is a claim about the supply, not a disclaimer about AE, so it stays
          while the repeated reassurance above it does not. */}
      <Text type="supporting" color="secondary" className="mt-2 block">{CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.sandboxBoundary}</Text>
    </Card>
    <RecoveryActions edit={edit} restart={restart} />
  </section>
}
function RouteImportantDetails({ route }: { route: CustomerRoute }) {
  return <Collapsible defaultIsOpen={false} trigger={<span className="text-base font-semibold">Important details</span>}>
    <div className="mt-4 grid gap-5">
      <RouteDisclosureDetails route={route} />
    </div>
  </Collapsible>
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
  if (route === undefined || actions === undefined) return <Card padding={5} className="mx-auto w-full max-w-4xl" aria-live="polite">
    <div className="grid gap-4">
      <Heading level={2}>This choice is no longer available.</Heading>
      <Text color="secondary">Return to the current options before deciding. Nothing was confirmed or shared.</Text>
      <Button label="Return to options" variant="primary" clickAction={decline} />
    </div>
  </Card>
  return <section className="mx-auto grid w-full max-w-4xl gap-6" aria-live="polite">
    <Conversation turns={turns} />
    <WorkingUnderstanding projection={projection} correct={edit} />
    <header className="grid gap-2">
      <Text className="text-sm font-semibold text-accent">Your choice</Text>
      <Heading level={2} className="text-3xl">Review before you confirm</Heading>
    </header>
    <Card padding={5}>
      <div className="grid gap-6">
        {/* Immediate: the four facts a person needs to decide, nothing else. */}
        <div className="grid gap-1">
          <Heading level={3}>{route.result.summary}</Heading>
          <Text color="secondary">Through {businessList(route.businesses.map(({ name }) => name))}</Text>
          {route.result.deliverables.length === 0 ? null : <Text type="supporting" color="secondary">Expected result: {route.result.deliverables.join(', ')}</Text>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Fact label="Cost">
            {/* The qualifier rides on the value: a price ceiling must never read
                as a fixed price, including when the value is read on its own. */}
            <FactValue tone={route.maximumTotalCost.kind === 'known' ? 'material' : 'unresolved'}>
              {route.maximumTotalCost.kind === 'known'
                ? `Maximum ${formatMoney(route.maximumTotalCost.currency, route.maximumTotalCost.amountMinor)}`
                : 'Price needs confirmation'}
            </FactValue>
          </Fact>
          <Fact label="Confirm before">
            <FactValue>{formatOptionTime(route.validUntil)}</FactValue>
          </Fact>
          <Fact label="Shared">
            <SharingSummary route={route} />
          </Fact>
        </div>

        {/* The one decision. Confirming is the dominant action on this surface.
            It sits at its natural width so it reads as a control, not a banner. */}
        <div className="grid justify-items-start gap-3 border-t border-border pt-6">
          <Button label="Confirm this choice" variant="primary" clickAction={confirm} />
          <Text type="supporting" color="secondary" className="block">
            Confirming gives AE permission for this exact choice and maximum cost. It does not start work or share information yet.
          </Text>
          <div className="flex flex-wrap items-center gap-4">
            {repeatPermissionEligible(route)
              ? <CustomerRequestRepeatPermissionControl projection={projection} route={route} />
              : null}
            <Button label="Change this Request" variant="ghost" clickAction={edit} />
            <Button label="Decline this choice" variant="ghost" clickAction={decline} />
          </div>
        </div>

        {/* Expanded: what confirming commits you to. */}
        <div className="grid gap-5 border-t border-border pt-6">
          <SharingDetail route={route} emptyLabel="Nothing is shared." />
          <EffectsDetail route={route} label="What starting changes" />
          <CancellationDetail route={route} />
          <Text type="supporting" color="secondary">{actions.start.summary}</Text>
        </div>

        {/* On demand: everything else AE registered about this route. */}
        <div className="border-t border-border pt-6">
          <FullRouteDisclosure route={route} subject="choice" />
        </div>

        {/* On demand: the escape hatch, closed until asked for. */}
        <div className="border-t border-border pt-6">
          <Collapsible
            defaultIsOpen={false}
            trigger={<span className="text-base font-semibold">This option does not work?</span>}
          >
            <div className="grid gap-3 pt-4">
              <Text color="secondary">Tell AE what makes this exact option unsuitable. AE will keep this Request and look for a different current option. Nothing will be confirmed or shared.</Text>
              <label htmlFor="route-feedback" className="text-sm font-semibold">Why does this option not work?</label>
              <textarea
                id="route-feedback"
                value={routeFeedback}
                onChange={(event) => setRouteFeedback(event.target.value)}
                rows={3}
                maxLength={2_000}
                required
                className="min-h-20 resize-y rounded-md border border-border bg-card px-3 py-2 text-primary outline-none focus:ring-2 focus:ring-accent"
              />
              <Button
                label="Find another option"
                variant="secondary"
                isDisabled={routeFeedback.trim().length === 0}
                clickAction={() => void reportUnavailable()}
              />
            </div>
          </Collapsible>
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
    <Card padding={5}>
      <div className="grid gap-5">
        <div className="grid gap-2">
          <Text className="text-sm font-semibold text-accent">Choice confirmed</Text>
          <Heading level={2}>{route.result.summary}</Heading>
          <Text color="secondary">Through {businessList(route.businesses.map(({ name }) => name))}. Nothing has started yet.</Text>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Text type="supporting" weight="semibold">Maximum cost</Text><Text type="large" weight="semibold">{route.maximumTotalCost.kind === 'known' ? formatMoney(route.maximumTotalCost.currency, route.maximumTotalCost.amountMinor) : 'Not confirmed'}</Text></div>
          <div><Text type="supporting" weight="semibold">Confirmed until</Text><Text color="secondary">{formatOptionTime(confirmation.validUntil)}</Text></div>
        </div>
        <div><Text weight="semibold">Information recipients</Text><ul className="mt-2 grid gap-1 text-sm text-secondary">{route.dataUse.recipients.map((recipient) => <li key={recipient.recipientRef}>{recipient.name} — {recipient.purposes.map(readableLabel).join(', ')}. Fields: {recipient.fields.map(({ label, classification }) => `${label} (${classification})`).join(', ')}</li>)}</ul></div>
        <div><Text weight="semibold">What changes</Text><ul className="mt-2 grid gap-1 text-sm text-secondary">{route.effects.map((effect) => <li key={`${effect.kind}:${effect.reversibility}`}>{effectLabel(effect.kind)} — {reversibilityLabel(effect.reversibility)}</li>)}</ul></div>
        <div><Text weight="semibold">Evidence expected</Text><Text color="secondary" className="mt-1">{route.evidence.map(({ label }) => label).join(', ') || 'No completion evidence is declared.'}</Text></div>
        <div><Text weight="semibold">What still needs confirmation</Text><Text color="secondary" className="mt-1">{route.uncertainty.length === 0 ? 'No uncertainty is declared for this choice.' : route.uncertainty.map(uncertaintyLabel).join(', ')}</Text></div>
        <div><Text weight="semibold">Fallback</Text><Text color="secondary" className="mt-1">{route.fallback.available ? `${route.fallback.alternatives.length} alternative ${route.fallback.alternatives.length === 1 ? 'way is' : 'ways are'} available before work starts.` : 'No alternative way is currently declared.'}</Text></div>
        <div><Text weight="semibold">Cancellation</Text><Text color="secondary" className="mt-1">{route.cancellation.summary}</Text></div>
        <div><Text weight="semibold">Recovery by step</Text><ul className="mt-2 grid gap-1 text-sm text-secondary">{route.recovery.map((recovery) => <li key={recovery.step}>Step {recovery.step}, {recovery.businessName}: {recovery.posture === 'retry_safe' ? 'AE can safely retry after a confirmed failure.' : 'AE must check what happened before any retry.'}</li>)}</ul></div>
        <Text type="supporting" color="secondary">Confirmation code {confirmation.confirmationRef}</Text>
        <Button label="Start now" variant="primary" clickAction={start} />
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
    <Card padding={5}>
      <div className="grid gap-4">
        <Text className="text-sm font-semibold text-accent">In progress</Text>
        <Heading level={2}>{projection.summary}</Heading>
        <Text weight="semibold">Step {progress.current.step} of {progress.total}</Text>
        <Text color="secondary">{stateLabel}</Text>
        {projection.activity === undefined ? null : <Text weight="semibold">
          {activityResponsibility(projection.activity.actor, projection.activity.certainty)}
        </Text>}
        <Text type="supporting" color="secondary">{progress.completed} of {progress.total} steps completed. Rechecking will not send the work again.</Text>
        {progress.dependencies === undefined ? null : <div className="grid gap-2 rounded-md border border-border bg-surface p-4">
          {progress.dependencies.completed.map(({ step, business }) => (
            <Text key={`completed:${step}`} type="supporting" color="secondary">Completed: {business}</Text>
          ))}
          {progress.dependencies.blocked.map(({ step, business, waitingForBusiness }) => (
            <Text key={`blocked:${step}`} type="supporting" color="secondary">
              Waiting: {business}, after {waitingForBusiness}
            </Text>
          ))}
        </div>}
        <Text type="supporting" color="secondary">AE is acting only within the choice you confirmed.</Text>
        {cancellationMessage(projection.activity?.cancellation)}
        <div className="flex flex-wrap gap-3">
          <Button label="Check progress" variant="primary" clickAction={refresh} />
          {cancellationAvailable(projection.activity?.cancellation)
            ? <Button label="Stop before the next step" variant="secondary" clickAction={cancel} />
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
    return <Text type="supporting" color="secondary">
      AE will not release the next business step before {new Date(cancellation.releaseMayStartAt).toISOString()}.
    </Text>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'pending') {
    return <div className="grid gap-1">
      <Text type="supporting" color="secondary">
        AE sent one stop request to the business. The business has not confirmed the outcome yet.
      </Text>
      <Text type="supporting" color="secondary">
        Sent at {new Date(cancellation.requestedAt).toISOString()}. Check again after {new Date(cancellation.nextCheckAt).toISOString()}.
        {' '}AE will not send the stop request twice.
      </Text>
    </div>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'unknown') {
    return <div className="grid gap-1">
      <Text type="supporting" color="secondary">
        AE cannot yet confirm whether the business received or accepted the stop request.
      </Text>
      <Text type="supporting" color="secondary">
        Sent at {new Date(cancellation.requestedAt).toISOString()}; uncertainty recorded at {new Date(cancellation.observedAt).toISOString()}.
        {' '}AE will not repeat it while the outcome is unknown. Check again after {new Date(cancellation.nextCheckAt).toISOString()}.
      </Text>
    </div>
  }
  if (typeof cancellation === 'object' && cancellation.state === 'rejected') {
    return <div className="grid gap-1">
      <Text type="supporting" color="secondary">
        The business declined the stop request. The current work may continue.
      </Text>
      <Text type="supporting" color="secondary">
        AE sent the stop request at {new Date(cancellation.requestedAt).toISOString()}.
      </Text>
      <Text type="supporting" color="secondary">
        The business response was recorded at {new Date(cancellation.observedAt).toISOString()}; AE will not send the stop request twice.
      </Text>
    </div>
  }
  if (typeof cancellation !== 'object' || cancellation.state !== 'not_available'
    || cancellation.reason !== 'business_step_released') return null
  return <div className="grid gap-1">
    <Text type="supporting" color="secondary">
      {cancellation.requestedAt === undefined
        ? 'This business step has started, so AE can no longer stop it before release.'
        : 'You asked AE to stop, but the business step had already started.'}
    </Text>
    <Text type="supporting" color="secondary">
      The business step was released at {new Date(cancellation.changedAt).toISOString()}.
    </Text>
    {cancellation.requestedAt === undefined ? null : <Text type="supporting" color="secondary">
      AE recorded your stop request at {new Date(cancellation.requestedAt).toISOString()}.
    </Text>}
  </div>
}
export function ConfirmationLoadingCard() {
  return <Card padding={5} className="mx-auto w-full max-w-4xl" aria-live="polite" aria-busy="true">
    <div className="grid gap-5">
      <Skeleton height="1rem" width="8rem" index={0} />
      <Skeleton height="2.25rem" width="72%" index={1} />
      <Skeleton height="1rem" width="55%" index={2} />
      <div className="grid gap-4 sm:grid-cols-2"><Skeleton height="4rem" width="100%" index={3} /><Skeleton height="4rem" width="100%" index={4} /></div>
      <Skeleton height="7rem" width="100%" index={5} />
      <Text color="secondary">Confirming your choice. Nothing is being purchased, booked, or started.</Text>
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
  return <Card padding={4}>
    <div className="grid gap-2">
      <Heading level={3}>What changed</Heading>
      <ul className="grid gap-1 text-sm text-secondary">
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
    return `The maximum for ${resultName(change.after[0].resultRef, resultNames)} changed from ${formatMoney(change.before[0].cost.currency, change.before[0].cost.amountMinor)} to ${formatMoney(change.after[0].cost.currency, change.after[0].cost.amountMinor)}.`
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
  return JSON.stringify(value)
}
function costList(
  costs: readonly { resultRef: string; cost: NonNullable<CustomerRequestView['decision']>['routes'][number]['maximumTotalCost'] }[],
  names: ReadonlyMap<string, string>,
): string {
  return costs.map(({ resultRef, cost }) => `${resultName(resultRef, names)}: ${cost.kind === 'known'
    ? formatMoney(cost.currency, cost.amountMinor)
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
  return values.map(({ resultRef, validUntil }) => `${resultName(resultRef, names)}: ${formatOptionTime(validUntil)}`)
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
