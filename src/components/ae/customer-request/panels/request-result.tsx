import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import type { CustomerRequestProjection, CustomerRequestView } from '@/modules/customer-request/customer-projection'
import type { ConversationTurn, WorkspaceState } from '../workspace-types'
import {
  Conversation,
  Clarification,
  WorkingUnderstanding,
  RecoveryActions,
  customerClarificationPrompt,
  statusLabel,
} from './shared'
import { OptionsCard, NoOptions } from './options'
import { DisclosureReview } from './disclosure'
import {
  RouteDecisionCard,
  RouteReviewCard,
  RouteConfirmationCard,
  RouteProgressCard,
  ConfirmationLoadingCard,
} from './routes'
import { ActionStatusCard, CancelledStatusCard } from './status'

export function RequestResult({ state, compare, reviewRoute, leaveRouteReview, reportRouteUnavailable, confirmRoute, actOnRoute, authorize, refresh, continueRequest, edit, restart, answer, setAnswer, routeFeedback, setRouteFeedback, turns }: { state: WorkspaceState; compare: (projection: CustomerRequestView) => Promise<void>; reviewRoute: (projection: CustomerRequestView, routeRef: string) => void; leaveRouteReview: (projection: CustomerRequestView) => void; reportRouteUnavailable: (projection: CustomerRequestView, routeRef: string) => Promise<void>; confirmRoute: (projection: CustomerRequestView, routeRef: string) => Promise<void>; actOnRoute: (projection: CustomerRequestView, operation: 'run' | 'cancellation') => Promise<void>; authorize: (projection: CustomerRequestView) => Promise<void>; refresh: (projection: CustomerRequestView) => Promise<void>; continueRequest: (projection: CustomerRequestView) => Promise<void>; edit: (projection: CustomerRequestView) => void; restart: () => void; answer: string; setAnswer: (answer: string) => void; routeFeedback: string; setRouteFeedback: (feedback: string) => void; turns: readonly ConversationTurn[] }) {
  if (state.kind === 'error') return <Card padding={5} className="min-w-0" aria-live="polite"><div className="grid gap-4"><Heading level={2}>Request unavailable</Heading><Text color="secondary">{state.message}</Text>{state.authenticationRequired ? <Button label="Sign in to continue" href="/sign-in" variant="primary" /> : null}</div></Card>
  if (state.kind === 'conflict') return <Card padding={5} className="mx-auto w-full max-w-4xl" aria-live="polite">
    <div className="grid gap-4">
      <Text className="text-sm font-semibold text-accent">A newer decision is available</Text>
      <Heading level={2}>This Request changed.</Heading>
      <Text color="secondary">{conflictExplanation(state.reason)} No action was authorized, and your Request is preserved.</Text>
      <Button label="Load the current Request" variant="primary" clickAction={() => void refresh(state.projection)} />
      <RecoveryActions edit={() => edit(state.projection)} restart={restart} />
    </div>
  </Card>
  if (state.kind === 'request' && state.projection.confirmation !== undefined) {
    return <RouteConfirmationCard projection={state.projection} turns={turns} start={() => actOnRoute(state.projection, 'run')} edit={() => edit(state.projection)} restart={restart} />
  }
  if (state.kind === 'reviewing') {
    return <RouteReviewCard projection={state.projection} routeRef={state.routeRef} turns={turns} confirm={() => confirmRoute(state.projection, state.routeRef)} reportUnavailable={() => reportRouteUnavailable(state.projection, state.routeRef)} routeFeedback={routeFeedback} setRouteFeedback={setRouteFeedback} decline={() => leaveRouteReview(state.projection)} edit={() => edit(state.projection)} />
  }
  if (state.kind === 'request' && state.projection.decision !== undefined) {
    return <RouteDecisionCard projection={state.projection} turns={turns} review={(routeRef) => reviewRoute(state.projection, routeRef)} check={() => compare(state.projection)} edit={() => edit(state.projection)} restart={restart} />
  }
  if (state.kind === 'request' && state.projection.state === 'options_ready') return <OptionsCard projection={state.projection} turns={turns} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'no_options') return <NoOptions projection={state.projection} turns={turns} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'needs_authorization') return <DisclosureReview projection={state.projection} turns={turns} authorize={() => authorize(state.projection)} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'in_progress') return <RouteProgressCard projection={state.projection} turns={turns} refresh={() => refresh(state.projection)} cancel={() => actOnRoute(state.projection, 'cancellation')} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && state.projection.state === 'cancelled') return <CancelledStatusCard projection={state.projection} turns={turns} edit={() => edit(state.projection)} restart={restart} />
  if (state.kind === 'request' && (state.projection.state === 'outcome_unknown'
    || state.projection.state === 'completed' || state.projection.state === 'failed')) {
    return <ActionStatusCard projection={state.projection} turns={turns} refresh={() => refresh(state.projection)} edit={() => edit(state.projection)} restart={restart} />
  }
  if (state.kind === 'request') return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={state.projection} correct={() => edit(state.projection)} />{state.projection.clarification ? <Clarification prompt={customerClarificationPrompt(state.projection.clarification)} answer={answer} setAnswer={setAnswer} submit={() => void continueRequest(state.projection)} /> : <Card padding={5}><div className="grid gap-4"><Text className="text-sm font-medium text-accent">{statusLabel(state.projection.state)}</Text><Heading level={2}>{state.projection.summary}</Heading>{state.projection.dataHandling === undefined ? null : <Text color="secondary">{state.projection.dataHandling.explanation}</Text>}{state.projection.unsupportedRecovery === undefined ? null : <Text color="secondary">{state.projection.unsupportedRecovery.nextStep.summary}</Text>}{state.projection.nextAction === 'prepare_options' ? <Button label="Show available options" variant="primary" clickAction={() => void compare(state.projection)} /> : state.projection.state === 'preparing_options' ? <Button label="Check again" variant="secondary" clickAction={() => void compare(state.projection)} /> : state.projection.unsupportedRecovery === undefined ? <Text color="secondary">AE cannot prepare a useful choice for this request yet.</Text> : null}<RecoveryActions edit={() => edit(state.projection)} restart={restart} /></div></Card>}</section>
  if (state.kind === 'confirming') return <ConfirmationLoadingCard />
  if (state.kind === 'resuming' || state.kind === 'submitting' || state.kind === 'comparing' || state.kind === 'refreshing') return <Card padding={5} className="min-w-0" aria-live="polite" aria-busy="true"><Heading level={2}>{state.kind === 'resuming' ? 'Reopening your Request…' : state.kind === 'submitting' ? 'Understanding your request…' : state.kind === 'comparing' ? 'Comparing available options…' : 'Checking with the latest evidence…'}</Heading><Text color="secondary" className="mt-2">No purchase, booking, or business step occurs during this moment.</Text></Card>
  return <Card padding={5} className="min-w-0 bg-surface"><Heading level={2}>Your result will appear here</Heading><Text color="secondary" className="mt-2">AE will show missing information, unsupported requests, or comparable business options.</Text></Card>
}
function conflictExplanation(reason: Extract<CustomerRequestProjection, { kind: 'conflict' }>['reason']): string {
  if (reason === 'revision_changed') return 'The Request was revised before this comparison finished.'
  if (reason === 'options_changed') return 'The available ways forward changed before this comparison finished.'
  if (reason === 'identity_changed') return 'The person or agent allowed to access this Request changed.'
  return 'This operation key was already used for different work.'
}
