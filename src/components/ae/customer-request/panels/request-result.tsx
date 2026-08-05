import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { CustomerRequestProjection, CustomerRequestView } from '@/modules/customer-request/customer-projection'
import type { ConversationTurn, WorkspaceState } from '../workspace-types'
import { Conversation } from './shared/conversation'
import { Clarification } from './shared/clarification'
import { WorkingUnderstanding } from './shared/working-understanding'
import { RecoveryActions } from './shared/recovery-actions'
import { customerFacingAeTurn, statusLabel } from './shared/prompts'
import { DirectoryFallback } from './directory-fallback'
import { OptionsCard, NoOptions } from './options/options'
import { DisclosureReview } from './disclosure/disclosure-review'
import {
  RouteDecisionCard,
  RouteReviewCard,
  RouteConfirmationCard,
  RouteProgressCard,
  ConfirmationLoadingCard,
} from './routes/routes'
import { ActionStatusCard, CancelledStatusCard } from './status/status'

export function RequestResult({ state, compare, reviewRoute, leaveRouteReview, reportRouteUnavailable, confirmRoute, actOnRoute, authorize, refresh, continueRequest, edit, restart, answer, setAnswer, routeFeedback, setRouteFeedback, turns }: { state: WorkspaceState; compare: (projection: CustomerRequestView) => Promise<void>; reviewRoute: (projection: CustomerRequestView, routeRef: string) => void; leaveRouteReview: (projection: CustomerRequestView) => void; reportRouteUnavailable: (projection: CustomerRequestView, routeRef: string) => Promise<void>; confirmRoute: (projection: CustomerRequestView, routeRef: string) => Promise<void>; actOnRoute: (projection: CustomerRequestView, operation: 'run' | 'cancellation') => Promise<void>; authorize: (projection: CustomerRequestView) => Promise<void>; refresh: (projection: CustomerRequestView) => Promise<void>; continueRequest: (projection: CustomerRequestView) => Promise<void>; edit: (projection: CustomerRequestView) => void; restart: () => void; answer: string; setAnswer: (answer: string) => void; routeFeedback: string; setRouteFeedback: (feedback: string) => void; turns: readonly ConversationTurn[] }) {
  if (state.kind === 'error') return <Card className="min-w-0 p-5" aria-live="polite"><div className="grid gap-4"><h2 className="text-2xl font-semibold">Request unavailable</h2><p className="text-muted-foreground">{state.message}</p>{state.authenticationRequired ? <Button asChild variant="default"><a href="/sign-in">Sign in to continue</a></Button> : null}</div></Card>
  if (state.kind === 'conflict') return <Card className="mx-auto w-full max-w-4xl p-5" aria-live="polite">
    <div className="grid gap-4">
      <p className="text-sm font-semibold text-brand">A newer decision is available</p>
      <h2 className="text-2xl font-semibold">This Request changed.</h2>
      <p className="text-muted-foreground">{conflictExplanation(state.reason)} No action was authorized, and your Request is preserved.</p>
      <Button type="button" variant="default" onClick={() => void refresh(state.projection)}>Load the current Request</Button>
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
  if (state.kind === 'request' && state.projection.state === 'needs_attention'
    && state.projection.nextAction === 'none') {
    return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite">
      <Conversation turns={turns} />
      <Card className="p-5">
        <div className="grid gap-4">
          <p className="text-sm font-medium text-brand">{statusLabel(state.projection.state)}</p>
          <h2 className="text-2xl font-semibold">{state.projection.summary}</h2>
          <Button type="button" variant="default" onClick={restart}>Start a new Request</Button>
        </div>
      </Card>
    </section>
  }
  if (state.kind === 'request') return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={state.projection} correct={() => edit(state.projection)} />{state.projection.clarification ? <Clarification prompt={customerFacingAeTurn(state.projection.clarification.prompt)} answer={answer} setAnswer={setAnswer} submit={() => void continueRequest(state.projection)} /> : <><Card className="p-5"><div className="grid gap-4"><p className="text-sm font-medium text-brand">{statusLabel(state.projection.state)}</p><h2 className="text-2xl font-semibold">{state.projection.summary}</h2>{state.projection.dataHandling === undefined ? null : <p className="text-muted-foreground">{state.projection.dataHandling.explanation}</p>}{state.projection.unsupportedRecovery === undefined ? null : <p className="text-muted-foreground">{state.projection.unsupportedRecovery.nextStep.summary}</p>}{state.projection.nextAction === 'prepare_options' ? <Button type="button" variant="default" onClick={() => void compare(state.projection)}>Show available options</Button> : state.projection.state === 'preparing_options' ? <Button type="button" variant="secondary" onClick={() => void compare(state.projection)}>Check again</Button> : state.projection.unsupportedRecovery === undefined ? <p className="text-muted-foreground">AE cannot prepare a useful choice for this request yet.</p> : null}<RecoveryActions edit={() => edit(state.projection)} restart={restart} /></div></Card>{state.projection.state === 'unsupported' ? <DirectoryFallback intent={customerIntentFrom(turns)} /> : null}</>}</section>
  if (state.kind === 'confirming') return <ConfirmationLoadingCard />
  if (state.kind === 'resuming' || state.kind === 'submitting' || state.kind === 'comparing' || state.kind === 'refreshing') return <Card className="min-w-0 p-5" aria-live="polite" aria-busy="true"><h2 className="text-2xl font-semibold">{state.kind === 'resuming' ? 'Reopening your Request…' : state.kind === 'submitting' ? 'Understanding your request…' : state.kind === 'comparing' ? 'Comparing your options…' : 'Checking the latest information…'}</h2><p className="mt-2 text-muted-foreground">Your request stays in place while AE works.</p></Card>
  return <Card className="min-w-0 bg-card p-5"><h2 className="text-2xl font-semibold">Your result will appear here</h2><p className="mt-2 text-muted-foreground">AE will show missing information, unsupported requests, or comparable business options.</p></Card>
}
function conflictExplanation(reason: Extract<CustomerRequestProjection, { kind: 'conflict' }>['reason']): string {
  if (reason === 'revision_changed') return 'The Request was revised before this comparison finished.'
  if (reason === 'options_changed') return 'The available ways forward changed before this comparison finished.'
  if (reason === 'identity_changed') return 'The person or agent allowed to access this Request changed.'
  return 'This operation key was already used for different work.'
}

/**
 * The projected view deliberately does not republish the raw request text, so
 * the customer's own words come from the conversation. The last customer turn
 * is the current wording after any edit.
 */
function customerIntentFrom(turns: readonly ConversationTurn[]): string {
  return turns.findLast((turn) => turn.speaker === 'customer')?.text ?? ''
}
