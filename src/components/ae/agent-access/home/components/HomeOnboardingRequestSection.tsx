import { Link } from '@tanstack/react-router'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeStatusStepper } from '@/components/ae/shared/status-stepper/AeStatusStepper'
import { Button } from '@/components/arc/button/button'
import { Stepper } from '@/components/arc/stepper/stepper'
import type { StepperStep } from '@/components/arc/stepper/stepper'
import type { AgentOnboardingRequest } from '@/modules/agent-access/public'
import type { AgentAccessSearch } from '@/modules/agent-access/agent-lifecycle.view-model'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

type OnboardingRequestPhase = Extract<AgentOnboardingRequest, { kind: 'request' }>['phase']
type OnboardingRequestState = Readonly<{
  title: string
  description: string
  current: number
  error?: string
}>

const requestStateByPhase: Record<OnboardingRequestPhase, OnboardingRequestState> = {
  pending: {
    title: 'Your Agent is asking for access',
    description: 'Review the requested access. Your approval stays separate from any permission to purchase a Tool.',
    current: 0,
  },
  issuing: {
    title: 'Preparing the approved access',
    description: 'The request is in progress. Check its recorded status before submitting another approval or starting another request.',
    current: 1,
  },
  approved: {
    title: 'Access approved; waiting for your Agent',
    description: 'Keep working in your Agent. This page follows this exact request and updates automatically.',
    current: 2,
  },
  exchanging: {
    title: 'Your Agent is collecting its access',
    description: 'The request is in progress. Check its recorded status before submitting another approval or starting another request.',
    current: 2,
  },
  exchanged: {
    title: 'Access returned to your Agent',
    description: 'The access exchange is recorded. Authenticated requests, Calls and delivery are observed separately below.',
    current: 3,
  },
  denied: {
    title: 'This access request was declined',
    description: 'Continue in the same Agent task and request fresh access. If an Agent already exists, renew its access. Retain any existing Call reference; reconnecting does not retry a purchase.',
    current: 0,
    error: 'Request declined',
  },
  expired: {
    title: 'This access request expired',
    description: 'Continue in the same Agent task and request fresh access. If an Agent already exists, renew its access. Retain any existing Call reference; reconnecting does not retry a purchase.',
    current: 0,
    error: 'Request expired',
  },
}

type RequestSectionView = Readonly<{
  title: string
  description: string
  identityCopy: string
  grantRef?: string
  reviewSearch?: Readonly<{ grant_ref: string; state?: string }>
  progress?: Readonly<{ current: number; steps: readonly StepperStep[] }>
}>

function requestSectionView(request: AgentOnboardingRequest | undefined, search: AgentAccessSearch): RequestSectionView {
  const phase = request?.kind === 'request' ? request.phase : undefined
  const phaseState = phase === undefined ? undefined : requestStateByPhase[phase]
  const title = phaseState?.title ?? 'Checking this access request'
  const description = search.requestInvalid ? 'The request link is incomplete. Open the exact verification link supplied by your Agent.'
    : request?.kind === 'refused' ? request.reason === 'not_found' ? 'This request is no longer available. Existing owned Calls can still be followed by their reference.'
      : 'This signed-in Account cannot follow the request. Switch to the access owner and open the original link.'
    : phaseState?.description ?? 'Keep working in your Agent. This page follows this exact request and updates automatically.'
  const identityCopy = request?.kind === 'request'
    ? `${request.clientName} · ${request.environment === 'production' ? 'Production' : 'Sandbox'}`
    : 'No other Agent is substituted for this request.'
  const grantRef = request?.kind === 'request' ? request.grantRef : undefined
  const reviewSearch = request?.kind === 'request' && request.phase === 'pending'
    ? { grant_ref: request.grantRef, ...(search.state === undefined ? {} : { state: search.state }) }
    : undefined
  // A recorded exchange ends this request's milestones; authentication and
  // existing Call progress remain separate observations in the first-use lane.
  // Keep exact request facts/checking and all invalid, denial and expiry states.
  const progress = phaseState === undefined || phase === 'exchanged' || search.requestInvalid ? undefined : {
    current: phaseState.current,
    steps: [
      { id: 'review-access', label: 'Review access', ...(phaseState.error === undefined ? {} : { error: phaseState.error }) },
      { id: 'prepare-approved-access', label: 'Prepare approved access' },
      { id: 'return-access-to-agent', label: 'Return access to Agent' },
    ],
  }
  return {
    title,
    description,
    identityCopy,
    ...(grantRef === undefined ? {} : { grantRef }),
    ...(reviewSearch === undefined ? {} : { reviewSearch }),
    ...(progress === undefined ? {} : { progress }),
  }
}

export function HomeOnboardingRequestSection({ request, search, onCheck, checking }: Readonly<{
  request?: AgentOnboardingRequest; search: AgentAccessSearch; onCheck: () => void; checking: boolean
}>) {
  const view = requestSectionView(request, search)
  return <AeSection title={view.title} description={view.description} className="arc-agent-resume-section">
    <p role="status" className="arc-agent-first-use-fact">{view.identityCopy}</p>
    {view.grantRef !== undefined ? <details className="arc-agent-first-use-fact"><summary>Request {view.grantRef.slice(-8)}</summary><p>{view.grantRef}</p></details> : null}
    {view.progress ? view.progress.steps.some((step) => step.error !== undefined)
      ? <AeStatusStepper
        current={view.progress.steps.length}
        label="Access request progress"
        completeLabel="Access exchange recorded"
        announceLabel={`Access request progress: ${view.progress.steps.find((step) => step.error !== undefined)?.error ?? 'An error occurred'}`}
        steps={view.progress.steps.map((step) => ({
          ...step,
          status: step.error === undefined ? 'upcoming' as const : 'error' as const,
          statusLabel: step.error === undefined ? 'Not started' : 'Error',
        }))}
      />
      : <Stepper
        current={view.progress.current}
        label="Access request progress"
        completeLabel="Access exchange recorded"
        steps={[...view.progress.steps]}
      />
      : null}
    <div className="arc-agent-connect-actions">
      {view.reviewSearch ? <Link to="/agent-access/authorize"
        search={view.reviewSearch}
        className={actionLinkClassName('primary', 'md')}>Review access request</Link> : null}
      <Button type="button" variant="secondary" disabled={checking} onClick={onCheck}>{checking ? 'Checking…' : 'Check request status'}</Button>
    </div>
  </AeSection>
}
