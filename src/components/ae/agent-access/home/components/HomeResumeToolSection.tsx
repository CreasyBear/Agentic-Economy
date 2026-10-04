import { Link } from '@tanstack/react-router'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { Button } from '@/components/arc/button/button'
import { Stepper } from '@/components/arc/stepper/stepper'
import arcButton from '@/components/arc/button/button.module.css'
import { firstToolInstruction } from '@/modules/agent-access/public'

import type { HomeResumeToolSectionProps } from '../agent-access-home.contracts'
import '../AgentHomeComposition.css'

export function HomeResumeToolSection({ search, firstUse, liveUpdates, resumeTool, onConnect, onCheck, checking }: HomeResumeToolSectionProps) {
  const callObserved = firstUse.kind === 'running' || firstUse.kind === 'awaiting_authority' || firstUse.kind === 'recover' || firstUse.kind === 'delivered' || firstUse.kind === 'recording_result'
  const access = 'access' in firstUse ? firstUse.access : undefined
  const hasAccess = firstUse.kind === 'authorized' || firstUse.kind === 'authenticated' || firstUse.kind === 'browse_only' || access?.kind === 'authorized' || access?.kind === 'authenticated' || access?.kind === 'browse_only'
  const authenticated = firstUse.kind === 'authenticated' || access?.authenticated === true || (firstUse.kind === 'browse_only' && firstUse.authenticated)
  const delivered = firstUse.kind === 'delivered'
  const title = firstUse.kind === 'choose_call' ? 'Choose the Call to follow'
    : firstUse.kind === 'recording_result' ? 'Recording the Tool result'
    : firstUse.kind === 'choose_agent' ? 'Choose the Agent for this task'
    : firstUse.kind === 'unavailable' ? 'Check access before continuing'
    : firstUse.kind === 'connection_required' ? 'Finish the Agent connection'
    : firstUse.kind === 'recover' ? 'Resolve the existing Call'
    : firstUse.kind === 'awaiting_authority' ? 'Your Agent needs a decision'
    : firstUse.kind === 'running' ? firstUse.call.phase === 'running' ? 'The Tool is running' : 'Your Call is queued'
    : firstUse.kind === 'browse_only' ? 'Explore Tools with your Agent'
    : delivered ? 'A Tool result is recorded'
    : firstUse.kind === 'authenticated' ? 'Your Agent is connected'
    : 'Access approved; waiting for your Agent'
  const description = firstUse.kind === 'choose_call' ? 'Several Calls are active for this Agent. Select the original Call for this task.'
    : firstUse.kind === 'recording_result' ? 'The Call has finished. Waiting for its recorded delivery and receipt; keep following the same Call.'
    : firstUse.kind === 'choose_agent' ? 'Select the Agent you are using. Another Agent’s connection does not authorize this task.'
    : firstUse.kind === 'unavailable' ? 'Current access could not be confirmed. Your selected Tool and known Agent records are retained.'
    : firstUse.kind === 'connection_required' ? 'Connect or renew this Agent’s access. Your selected Tool remains saved.'
    : firstUse.kind === 'recover' ? 'Check this Call’s delivery and payment status before making another purchase.'
    : firstUse.kind === 'awaiting_authority' ? 'The Agent has requested permission for this Call. Review its Quote, price and effects in the waiting approvals below.'
    : firstUse.kind === 'running' ? 'The existing Call has been accepted. Its recorded status updates here automatically; keep its reference and wait for delivery.'
    : firstUse.kind === 'browse_only' ? `${firstUse.agent.displayName} has Browse only access. Discover and compare Tools; approve purchase authority only when you decide to use one.`
    : delivered ? `${firstUse.agent.displayName} has a delivered Tool result and a receipt. Review the Call’s input and result before using it in your current task.`
    : firstUse.kind === 'authenticated' ? `${firstUse.agent.displayName} is connected. Keep working in your existing Agent task; recorded Calls and results appear here automatically. The instruction below is available if your Agent needs guidance.`
    : `${firstUse.agent?.displayName ?? 'Your Agent'} has approved access. Continue in your existing Agent task; this page updates when its current credential authenticates. Copy the instruction below if your Agent needs guidance.`

  return <AeSection title={title} description={description} className="arc-agent-resume-section">
    <p className="sr-only" role="status">{liveUpdates === 'delayed' ? `Last confirmed service state: ${title}` : title}</p>
    {firstUse.kind === 'choose_call' ? <div className="arc-agent-connect-actions">{firstUse.calls.map(call => <Link key={call.callRef} to="/agent-access"
      search={{ ...search, caller: firstUse.agent.principalRef, callRef: call.callRef }}
      className={`${arcButton.button} ${arcButton.secondary} ${arcButton.md} arc-agent-choice-link`}>
      <span>{call.phase === 'recovery_required' ? 'Needs recovery' : 'In progress'}</span><span>{call.callRef}</span></Link>)}</div>
      : callObserved || firstUse.kind === 'browse_only' ? null : firstUse.kind === 'choose_agent' ? (
      <div className="arc-agent-connect-actions">
        {firstUse.agents.map(agent => <Link key={agent.principalRef} to="/agent-access"
          search={{ caller: agent.principalRef, ...(resumeTool === undefined ? {} : { resumeTool }) }}
          title={agent.principalRef} className={`${arcButton.button} ${arcButton.secondary} ${arcButton.md} arc-agent-choice-link`}>
          <span>{agent.displayName}</span><span>{agent.environment === 'production' ? 'Production' : 'Sandbox'} · {agent.connectorDisplayNames.join(', ') || 'Client not recorded'} · {agent.principalRef.slice(-8)}</span>
        </Link>)}
      </div>
    ) : <Stepper current={delivered ? 3 : authenticated ? 2 : hasAccess ? 1 : 0}
      label="First Tool use" completeLabel="Tool delivered with a receipt"
      steps={[
        { id: 'access', label: 'Approve access', status: hasAccess ? 'complete' : firstUse.kind === 'unavailable' ? 'error' : 'current', ...(firstUse.kind === 'unavailable' ? { error: 'Current evidence unavailable' } : {}) },
        { id: 'authenticate', label: 'Authenticate the Agent', status: authenticated ? 'complete' : hasAccess ? 'current' : 'upcoming' },
        { id: 'result', label: 'Get a Tool result', status: authenticated ? 'current' : 'upcoming' },
      ]} />}
    {firstUse.kind === 'authorized' || firstUse.kind === 'authenticated' || firstUse.kind === 'browse_only' ? <>
      <p className="arc-agent-first-use-fact" role="status">{authenticated ? 'An authenticated request from the current credential has been observed.' : 'Access approved. No authenticated request from the current credential has been observed yet.'} Browser access does not create a Call.</p>
      <AeCopyCommand label="First Tool instruction" code={firstToolInstruction(resumeTool, firstUse.agent.authorityMode)} prompt={false} comfortable actionLabel="Copy instruction for your Agent" resolveOrigin={false} className="arc-copy-command-instruction" />
      <p className="arc-agent-first-use-fact">Stay in the same Agent task through any approval or funding handoff. If a result is uncertain, check its existing Call before retrying.</p>
    </> : null}
    {callObserved ? <p className="arc-agent-first-use-fact" role="status">Current access: {access?.kind === 'connection_required' ? 'connection or renewal required' : access?.kind === 'browse_only' ? 'Browse only' : access?.kind === 'unavailable' ? 'unconfirmed' : access?.authenticated ? 'authenticated with the current credential' : 'approved; current credential has not authenticated'}. This Call retains its original authority and reference.</p> : null}
    {callObserved ? <Link to="/calls/$callRef" params={{ callRef: firstUse.call.callRef }}
      className={`${arcButton.button} ${arcButton.primary} ${arcButton.md} arc-agent-inline-action`}>{delivered ? 'View Tool result and receipt' : firstUse.kind === 'running' ? 'View live Call' : 'Check existing Call'}</Link> : null}
    <div className="arc-agent-connect-actions">
      {firstUse.kind === 'connection_required' || access?.kind === 'connection_required' ? <Button type="button" onClick={onConnect}>Connect an Agent</Button> : null}
      {firstUse.kind === 'choose_agent' || firstUse.kind === 'connection_required' ? null : <Button type="button" variant="secondary" onClick={onCheck} disabled={checking}>{checking ? 'Checking…' : firstUse.kind === 'unavailable' ? 'Check access again' : 'Check first-use progress'}</Button>}
      {resumeTool !== undefined && hasAccess ? <Link to="/tools/$toolRef" params={{ toolRef: resumeTool }} className={`${arcButton.button} ${arcButton.secondary} ${arcButton.md}`}>Return to selected Tool</Link> : null}
    </div>
  </AeSection>
}
