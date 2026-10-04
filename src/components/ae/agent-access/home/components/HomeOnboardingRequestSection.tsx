import { Link } from '@tanstack/react-router'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import buttonStyles from '@/components/arc/button/button.module.css'
import type { AgentOnboardingRequest } from '@/modules/agent-access/public'
import type { AgentAccessSearch } from '@/modules/agent-access/agent-lifecycle.view-model'

export function HomeOnboardingRequestSection({ request, search, onCheck, checking }: Readonly<{
  request?: AgentOnboardingRequest; search: AgentAccessSearch; onCheck: () => void; checking: boolean
}>) {
  const phase = request?.kind === 'request' ? request.phase : undefined
  const title = phase === 'pending' ? 'Your Agent is asking for access' : phase === 'issuing' ? 'Preparing the approved access'
    : phase === 'approved' ? 'Access approved; waiting for your Agent' : phase === 'exchanging' ? 'Your Agent is collecting its access'
    : phase === 'exchanged' ? 'Access returned to your Agent' : phase === 'denied' ? 'This access request was declined'
    : phase === 'expired' ? 'This access request expired' : 'Checking this access request'
  const description = search.requestInvalid ? 'The request link is incomplete. Open the exact verification link supplied by your Agent.'
    : request?.kind === 'refused' ? request.reason === 'not_found' ? 'This request is no longer available. Existing owned Calls can still be followed by their reference.'
      : 'This signed-in Account cannot follow the request. Switch to the access owner and open the original link.'
    : phase === 'pending' ? 'Review the requested access. Your approval stays separate from any permission to purchase a Tool.'
    : phase === 'issuing' || phase === 'exchanging' ? 'The request is in progress. Check its recorded status before submitting another approval or starting another request.'
    : phase === 'expired' || phase === 'denied' ? 'Continue in the same Agent task and request fresh access. If an Agent already exists, renew its access. Retain any existing Call reference; reconnecting does not retry a purchase.'
    : phase === 'exchanged' ? 'The access exchange is recorded. Authenticated requests, Calls and delivery are observed separately below.'
    : 'Keep working in your Agent. This page follows this exact request and updates automatically.'
  return <AeSection title={title} description={description} className="arc-agent-resume-section">
    <p role="status" className="arc-agent-first-use-fact">{request?.kind === 'request'
      ? `${request.clientName} · ${request.environment === 'production' ? 'Production' : 'Sandbox'}` : 'No other Agent is substituted for this request.'}</p>
    {request?.kind === 'request' ? <details className="arc-agent-first-use-fact"><summary>Request {request.grantRef.slice(-8)}</summary><p>{request.grantRef}</p></details> : null}
    <div className="arc-agent-connect-actions">
      {phase === 'pending' && request?.kind === 'request' ? <Link to="/agent-access/authorize"
        search={{ grant_ref: request.grantRef, ...(search.state === undefined ? {} : { state: search.state }) }}
        className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>Review access request</Link> : null}
      <Button type="button" variant="secondary" disabled={checking} onClick={onCheck}>{checking ? 'Checking…' : 'Check request status'}</Button>
    </div>
  </AeSection>
}
