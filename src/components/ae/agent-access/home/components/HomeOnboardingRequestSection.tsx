import { Link } from '@tanstack/react-router'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { Stepper } from '@/components/arc/stepper/stepper'
import type { StepperStatus, StepperStep } from '@/components/arc/stepper/stepper'
import buttonStyles from '@/components/arc/button/button.module.css'
import type { AgentOnboardingRequest } from '@/modules/agent-access/public'
import type { AgentAccessSearch } from '@/modules/agent-access/agent-lifecycle.view-model'

type OnboardingRequestPhase = Extract<AgentOnboardingRequest, { kind: 'request' }>['phase']
type OnboardingRequestState = Readonly<{
  title: string
  description: string
  current: number
  statuses: readonly [StepperStatus, StepperStatus, StepperStatus]
  error?: string
}>

const requestStateByPhase: Record<OnboardingRequestPhase, OnboardingRequestState> = {
  pending: {
    title: 'Your Agent is asking for access',
    description: 'Review the requested access. Your approval stays separate from any permission to purchase a Tool.',
    current: 0,
    statuses: ['current', 'upcoming', 'upcoming'],
  },
  issuing: {
    title: 'Preparing the approved access',
    description: 'The request is in progress. Check its recorded status before submitting another approval or starting another request.',
    current: 1,
    statuses: ['complete', 'current', 'upcoming'],
  },
  approved: {
    title: 'Access approved; waiting for your Agent',
    description: 'Keep working in your Agent. This page follows this exact request and updates automatically.',
    current: 2,
    statuses: ['complete', 'complete', 'current'],
  },
  exchanging: {
    title: 'Your Agent is collecting its access',
    description: 'The request is in progress. Check its recorded status before submitting another approval or starting another request.',
    current: 2,
    statuses: ['complete', 'complete', 'current'],
  },
  exchanged: {
    title: 'Access returned to your Agent',
    description: 'The access exchange is recorded. Authenticated requests, Calls and delivery are observed separately below.',
    current: 3,
    statuses: ['complete', 'complete', 'complete'],
  },
  denied: {
    title: 'This access request was declined',
    description: 'Continue in the same Agent task and request fresh access. If an Agent already exists, renew its access. Retain any existing Call reference; reconnecting does not retry a purchase.',
    current: 0,
    statuses: ['error', 'upcoming', 'upcoming'],
    error: 'Request declined',
  },
  expired: {
    title: 'This access request expired',
    description: 'Continue in the same Agent task and request fresh access. If an Agent already exists, renew its access. Retain any existing Call reference; reconnecting does not retry a purchase.',
    current: 0,
    statuses: ['error', 'upcoming', 'upcoming'],
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
  const progress = phaseState === undefined || search.requestInvalid ? undefined : {
    current: phaseState.current,
    steps: [
      { id: 'review-access', label: 'Review access', status: phaseState.statuses[0], ...(phaseState.error === undefined ? {} : { error: phaseState.error }) },
      { id: 'prepare-approved-access', label: 'Prepare approved access', status: phaseState.statuses[1] },
      { id: 'return-access-to-agent', label: 'Return access to Agent', status: phaseState.statuses[2] },
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
    {view.progress ? <Stepper
      current={view.progress.current}
      label="Access request progress"
      completeLabel="Access exchange recorded"
      steps={view.progress.steps}
    /> : null}
    <div className="arc-agent-connect-actions">
      {view.reviewSearch ? <Link to="/agent-access/authorize"
        search={view.reviewSearch}
        className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>Review access request</Link> : null}
      <Button type="button" variant="secondary" disabled={checking} onClick={onCheck}>{checking ? 'Checking…' : 'Check request status'}</Button>
    </div>
  </AeSection>
}
