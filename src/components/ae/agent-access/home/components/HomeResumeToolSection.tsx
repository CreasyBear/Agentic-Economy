import { Link } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

import { AgentRun } from '@/components/arc/blocks/agent-run/agent-run'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { Button } from '@/components/arc/button/button'
import { Stepper } from '@/components/arc/stepper/stepper'
import type { StepperStep } from '@/components/arc/stepper/stepper'
import arcButton from '@/components/arc/button/button.module.css'
import { firstToolInstruction } from '@/modules/agent-access/public'
import type { AgentFirstUseState } from '@/modules/agent-access/public'

import type { HomeResumeToolSectionProps } from '../agent-access-home.contracts'
import '../AgentHomeComposition.css'

type ObservedCallFirstUse = Extract<AgentFirstUseState, { kind: 'running' | 'awaiting_authority' | 'recover' | 'delivered' | 'recording_result' }>

function observedRunStatus(state: ObservedCallFirstUse, announcement: string): ComponentProps<typeof AgentRun>['status'] {
  switch (state.kind) {
    case 'delivered': return { phase: 'done', label: 'Delivered with a receipt', announcement }
    case 'awaiting_authority': return { phase: 'waiting', label: 'Waiting for your decision', announcement }
    case 'recover': return { phase: 'stopped', label: 'Needs recovery', announcement }
    case 'recording_result': return { phase: 'running', label: 'Recording delivery and receipt', announcement }
    case 'running': return { phase: 'running', label: state.call.phase === 'queued' ? 'Queued' : 'Running', announcement }
  }
}

function firstUseCopy(firstUse: AgentFirstUseState): Readonly<{
  title: string
  description: string
  hasAccess: boolean
  authenticated: boolean
  observedCall: Extract<AgentFirstUseState, { kind: 'running' | 'awaiting_authority' | 'recover' | 'delivered' | 'recording_result' }>['call'] | undefined
  stepperCurrent: number
  stepperSteps: StepperStep[]
  currentAccess: string
  observedState: ObservedCallFirstUse | undefined
  callActionLabel: string
  checkLabel: string
  showConnect: boolean
  showCheck: boolean
  showBrowse: boolean
  instructionAgent: Extract<AgentFirstUseState, { kind: 'authorized' | 'authenticated' | 'browse_only' }>['agent'] | undefined
}> {
  const access = 'access' in firstUse ? firstUse.access : undefined
  const hasAccess = firstUse.kind === 'authorized' || firstUse.kind === 'authenticated' || firstUse.kind === 'browse_only' || access?.kind === 'authorized' || access?.kind === 'authenticated' || access?.kind === 'browse_only'
  const authenticated = firstUse.kind === 'authenticated' || access?.authenticated === true || (firstUse.kind === 'browse_only' && firstUse.authenticated)
  const delivered = firstUse.kind === 'delivered'
  const observedState: ObservedCallFirstUse | undefined = firstUse.kind === 'running' || firstUse.kind === 'awaiting_authority' || firstUse.kind === 'recover' || firstUse.kind === 'delivered' || firstUse.kind === 'recording_result' ? firstUse : undefined
  const observedCall = observedState?.call
  const stepperCurrent = delivered ? 3 : authenticated ? 2 : hasAccess ? 1 : 0
  const stepperSteps: StepperStep[] = [
    { id: 'access', label: 'Approve access', ...(firstUse.kind === 'unavailable' ? { error: 'Current evidence unavailable' } : {}) },
    { id: 'authenticate', label: 'Authenticate the Agent' },
    { id: 'result', label: 'Get a Tool result' },
  ]
  const currentAccess = access?.kind === 'connection_required' ? 'connection or renewal required' : access?.kind === 'browse_only' ? 'Browse only' : access?.kind === 'unavailable' ? 'unconfirmed' : access?.authenticated ? 'authenticated with the current credential' : 'approved; current credential has not authenticated'
  const callActionLabel = delivered ? 'View Tool result and receipt' : firstUse.kind === 'running' ? 'View live Call' : 'Check existing Call'
  const checkLabel = firstUse.kind === 'unavailable' ? 'Check access again' : 'Check first-use progress'
  const showConnect = firstUse.kind === 'connection_required' || access?.kind === 'connection_required'
  const showCheck = firstUse.kind === 'choose_agent' || firstUse.kind === 'connection_required' ? false : true
  const instructionAgent = firstUse.kind === 'authorized' || firstUse.kind === 'authenticated' || firstUse.kind === 'browse_only' ? firstUse.agent : undefined
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

  return { title, description, hasAccess, authenticated, observedCall, observedState, stepperCurrent, stepperSteps, currentAccess, callActionLabel, checkLabel, showConnect, showCheck, showBrowse: firstUse.kind === 'browse_only', instructionAgent }
}

function HomeResumeActions({ copy, onConnect, onCheck, checking, resumeTool }: Pick<HomeResumeToolSectionProps, 'onConnect' | 'onCheck' | 'checking' | 'resumeTool'> & Readonly<{
  copy: ReturnType<typeof firstUseCopy>
}>) {
  const { hasAccess, observedCall, callActionLabel, showConnect, showCheck, showBrowse, checkLabel } = copy
  const callAction = observedCall === undefined ? null : <Link to="/calls/$callRef" params={{ callRef: observedCall.callRef }}
    className={`${arcButton.button} ${arcButton.primary} ${arcButton.md} arc-agent-inline-action`}>{callActionLabel}</Link>

  return <>
    {callAction}
    <div className="arc-agent-connect-actions">
      {showBrowse && resumeTool === undefined ? <Link to="/market" search={{ view: 'tools' }} className={`${arcButton.button} ${arcButton.primary} ${arcButton.md}`}>Browse Tools</Link> : null}
      {showConnect ? <Button type="button" variant={observedCall === undefined ? 'primary' : 'secondary'} onClick={onConnect}>Connect an Agent</Button> : null}
      {showCheck ? <Button type="button" variant="secondary" onClick={onCheck} disabled={checking}>{checking ? 'Checking…' : checkLabel}</Button> : null}
      {resumeTool !== undefined && hasAccess ? <Link to="/tools/$toolRef" params={{ toolRef: resumeTool }} className={`${arcButton.button} ${showBrowse ? arcButton.primary : arcButton.secondary} ${arcButton.md}`}>Return to selected Tool</Link> : null}
    </div>
  </>
}

function HomeResumeChoicesOrStepper({ firstUse, search, resumeTool, observedCall, stepperCurrent, stepperSteps }: Readonly<{
  firstUse: HomeResumeToolSectionProps['firstUse']
  search: HomeResumeToolSectionProps['search']
  resumeTool: HomeResumeToolSectionProps['resumeTool']
}> & Pick<ReturnType<typeof firstUseCopy>, 'observedCall' | 'stepperCurrent' | 'stepperSteps'>) {
  return firstUse.kind === 'choose_call' ? <div className="arc-agent-connect-actions">{firstUse.calls.map(call => <Link key={call.callRef} to="/agent-access"
    search={{ ...search, caller: firstUse.agent.principalRef, callRef: call.callRef }}
    className={`${arcButton.button} ${arcButton.secondary} ${arcButton.md} arc-agent-choice-link`}>
    <span>{call.phase === 'recovery_required' ? 'Needs recovery' : 'In progress'}</span><span>{call.callRef}</span></Link>)}</div>
    : observedCall !== undefined || firstUse.kind === 'browse_only' ? null : firstUse.kind === 'choose_agent' ? (
    <div className="arc-agent-connect-actions">
      {firstUse.agents.map(agent => <Link key={agent.principalRef} to="/agent-access"
        search={{ caller: agent.principalRef, ...(resumeTool === undefined ? {} : { resumeTool }) }}
        title={agent.principalRef} className={`${arcButton.button} ${arcButton.secondary} ${arcButton.md} arc-agent-choice-link`}>
        <span>{agent.displayName}</span><span>{agent.environment === 'production' ? 'Production' : 'Sandbox'} · {agent.connectorDisplayNames.join(', ') || 'Client not recorded'} · {agent.principalRef.slice(-8)}</span>
      </Link>)}
    </div>
  ) : <Stepper current={stepperCurrent}
    label="First Tool use" completeLabel="Tool delivered with a receipt"
    steps={stepperSteps} />
}

export function HomeResumeToolSection({ search, firstUse, liveUpdates, resumeTool, onConnect, onCheck, checking }: HomeResumeToolSectionProps) {
  const copy = firstUseCopy(firstUse)
  const { title, description, authenticated, observedCall, observedState, stepperCurrent, stepperSteps, currentAccess, instructionAgent } = copy
  const homeResumeActions = <HomeResumeActions copy={copy} onConnect={onConnect} onCheck={onCheck} checking={checking}
    {...(resumeTool === undefined ? {} : { resumeTool })} />

  if (observedState !== undefined) {
    const announcement = liveUpdates === 'delayed' ? `Last confirmed service state: ${title}` : title
    const status = observedRunStatus(observedState, announcement)
    const facts = [
      { label: 'Tool reference', value: observedState.call.toolRef },
      ...(observedState.kind === 'delivered' ? [{ label: 'Receipt reference', value: observedState.call.receiptRef }] : []),
    ]
    // Existing readback remains authoritative for every fact in this presentation.
    return <AgentRun title={title} description={description}
      byline={<><span>{observedState.agent.displayName}</span><code title={observedState.call.callRef}>{observedState.call.callRef}</code></>}
      status={status} facts={facts} actions={homeResumeActions}>
      <p className="arc-agent-first-use-fact" role="status">Current access: {currentAccess}. This Call retains its original authority and reference.</p>
    </AgentRun>
  }

  return <AeSection title={title} description={description} className="arc-agent-resume-section">
    <p className="sr-only" role="status">{liveUpdates === 'delayed' ? `Last confirmed service state: ${title}` : title}</p>
    <HomeResumeChoicesOrStepper firstUse={firstUse} search={search} resumeTool={resumeTool} observedCall={observedCall} stepperCurrent={stepperCurrent} stepperSteps={stepperSteps} />
    {instructionAgent !== undefined ? <>
      <p className="arc-agent-first-use-fact" role="status">{authenticated ? 'An authenticated request from the current credential has been observed.' : 'Access approved. No authenticated request from the current credential has been observed yet.'} Browser access does not create a Call.</p>
      <AeCopyCommand label="First Tool instruction" code={firstToolInstruction(resumeTool, instructionAgent.authorityMode)} prompt={false} comfortable actionLabel="Copy instruction for your Agent" resolveOrigin={false} className="arc-copy-command-instruction" />
      <p className="arc-agent-first-use-fact">Stay in the same Agent task through any approval or funding handoff. If a result is uncertain, check its existing Call before retrying.</p>
    </> : null}
    {homeResumeActions}
  </AeSection>
}
