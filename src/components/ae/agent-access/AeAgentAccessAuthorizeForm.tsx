import { useReducer } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSection, AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  readAgentConsentDetails,
  type AgentConsentDetails,
  type AgentConsentTarget,
} from '@/modules/agent-access/consent-read-model'

type PublicAuthorityMode = 'inspect_only' | 'approve_each' | 'bounded_mandate'

const authorityOptions = [
  { value: 'inspect_only', label: 'Browse only', description: 'Discover, compare, and run free read-only operations.' },
  { value: 'approve_each', label: 'Ask each time', description: 'Paid or consequential work comes back to you first.' },
  { value: 'bounded_mandate', label: 'Work within limits', description: 'Paid calls up to $1 each, $5 a day, $20 a month.' },
] as const

function canSelectAuthority(value: PublicAuthorityMode, ceiling: string): boolean {
  if (value === 'inspect_only') return true
  if (value === 'approve_each') return ceiling !== 'inspect_only'
  return ceiling === 'bounded_mandate'
}

type ConsentFormState = Readonly<{
  status: 'idle' | 'approved' | 'denied' | 'error'
  pending: boolean
  selectedMode: PublicAuthorityMode
  connectionTarget: 'new_agent' | 'replace_credential'
  agentTargets: readonly AgentConsentTarget[]
  agentTargetsNextCursor?: string
  agentTargetsLoading: boolean
  agentTargetsError?: string
  replacementPrincipalRef?: string
}>

type ConsentFormAction =
  | Readonly<{ kind: 'select_mode'; value: PublicAuthorityMode }>
  | Readonly<{ kind: 'select_connection'; value: 'new_agent' | 'replace_credential' }>
  | Readonly<{ kind: 'select_replacement'; value: string }>
  | Readonly<{ kind: 'page_started' }>
  | Readonly<{ kind: 'page_loaded'; targets: readonly AgentConsentTarget[]; nextCursor?: string }>
  | Readonly<{ kind: 'page_failed' }>
  | Readonly<{ kind: 'decision_started' }>
  | Readonly<{ kind: 'decision_finished'; status: 'approved' | 'denied' | 'error' }>

function initialConsentFormState(details: AgentConsentDetails): ConsentFormState {
  return {
    status: 'idle',
    pending: false,
    selectedMode: details.mode === 'inspect_only'
      ? 'inspect_only'
      : details.mode === 'bounded_mandate'
        ? 'bounded_mandate'
        : 'approve_each',
    connectionTarget: 'new_agent',
    agentTargets: details.agentTargets,
    ...(details.agentTargetsNextCursor === undefined ? {} : { agentTargetsNextCursor: details.agentTargetsNextCursor }),
    agentTargetsLoading: false,
    ...(details.agentTargetsUnavailable
      ? { agentTargetsError: 'Existing agents could not be loaded. Retry before replacing a credential.' }
      : {}),
  }
}

function consentFormReducer(state: ConsentFormState, action: ConsentFormAction): ConsentFormState {
  if (action.kind === 'select_mode') return { ...state, selectedMode: action.value }
  if (action.kind === 'select_connection') return { ...state, connectionTarget: action.value }
  if (action.kind === 'select_replacement') return { ...state, replacementPrincipalRef: action.value }
  if (action.kind === 'page_started') return { ...state, agentTargetsLoading: true }
  if (action.kind === 'page_failed') return {
    ...state,
    agentTargetsLoading: false,
    agentTargetsError: state.agentTargets.length === 0
      ? 'Existing agents could not be loaded. Retry before replacing a credential.'
      : 'More agents could not be loaded. The choices already shown are still available.',
  }
  if (action.kind === 'page_loaded') {
    const targets = new Map(state.agentTargets.map((target) => [target.principalRef, target]))
    for (const target of action.targets) targets.set(target.principalRef, target)
    const {
      agentTargetsError: _agentTargetsError,
      agentTargetsNextCursor: _agentTargetsNextCursor,
      ...retained
    } = state
    return {
      ...retained,
      agentTargets: [...targets.values()],
      agentTargetsLoading: false,
      ...(action.nextCursor === undefined ? {} : { agentTargetsNextCursor: action.nextCursor }),
    }
  }
  if (action.kind === 'decision_started') return { ...state, pending: true }
  return { ...state, pending: false, status: action.status }
}

export function AeAgentAccessAuthorizeForm({ userCode, details }: Readonly<{
  userCode: string
  details: AgentConsentDetails & Readonly<{ grantRef: string; clientName: string; mode: string }>
}>) {
  const [state, dispatch] = useReducer(consentFormReducer, details, initialConsentFormState)
  const { grantRef, clientName, mode } = details
  const accessProfile = details.accessProfile ?? 'market'
  const {
    status, pending, selectedMode, connectionTarget, agentTargets, agentTargetsNextCursor,
    agentTargetsLoading, agentTargetsError, replacementPrincipalRef,
  } = state

  async function loadAgentTargets() {
    if (agentTargetsLoading) return
    dispatch({ kind: 'page_started' })
    try {
      const query = new URLSearchParams({ user_code: userCode })
      if (agentTargetsNextCursor !== undefined) query.set('agent_cursor', agentTargetsNextCursor)
      const response = await fetch(`/oauth/authorize?${query.toString()}`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error('agent_targets_unavailable')
      const next = readAgentConsentDetails(await response.text())
      if (next.grantRef !== grantRef || next.agentTargetsUnavailable) throw new Error('agent_targets_unavailable')
      dispatch({
        kind: 'page_loaded',
        targets: next.agentTargets,
        ...(next.agentTargetsNextCursor === undefined ? {} : { nextCursor: next.agentTargetsNextCursor }),
      })
    } catch {
      dispatch({ kind: 'page_failed' })
    }
  }

  async function decide(decision: 'approve' | 'deny') {
    dispatch({ kind: 'decision_started' })
    try {
      const response = await fetch('/oauth/authorize', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_ref: grantRef,
          decision,
          authority_mode: selectedMode,
          connection_target: connectionTarget,
          ...(connectionTarget === 'replace_credential' && replacementPrincipalRef !== undefined
            ? { principal_ref: replacementPrincipalRef }
            : {}),
        }).toString(),
      })
      dispatch({ kind: 'decision_finished', status: response.ok ? (decision === 'approve' ? 'approved' : 'denied') : 'error' })
    } catch {
      dispatch({ kind: 'decision_finished', status: 'error' })
    }
  }

  return (
    <AeOperatorShell operatorRole="owner" title="Review agent access" description="Choose what this agent may do, then approve or decline." currentPath="/agent-access">
      <AeSettingsStack>
        {status === 'idle' ? (
          <>
            <AeSection
              title={`Connect ${clientName}`}
              description={accessProfile === 'supplier'
                ? 'This separate credential can inspect and manage your supplier Operations.'
                : 'How much may this agent do without asking you?'}
            >
              <fieldset className="grid gap-3" disabled={pending}>
                <legend className="text-sm font-medium text-foreground">Connection</legend>
                <RadioGroup
                  value={connectionTarget}
                  onValueChange={(value) => dispatch({ kind: 'select_connection', value: value as 'new_agent' | 'replace_credential' })}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <Label htmlFor="connection-new" className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-foreground">
                    <RadioGroupItem id="connection-new" value="new_agent" className="mt-1" />
                    <span><span className="block font-medium">New agent</span><span className="text-sm font-normal text-muted-foreground">Create an independent agent identity.</span></span>
                  </Label>
                  <Label htmlFor="connection-replace" className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-foreground">
                    <RadioGroupItem id="connection-replace" value="replace_credential" disabled={agentTargets.length === 0} className="mt-1" />
                    <span><span className="block font-medium">Replace credential</span><span className="text-sm font-normal text-muted-foreground">Keep one agent and rotate only its secret.</span></span>
                  </Label>
                </RadioGroup>
                {connectionTarget === 'replace_credential' ? (
                  <div className="grid gap-2">
                    <Label htmlFor="replacement-agent">Agent</Label>
                    <Select value={replacementPrincipalRef ?? ''} onValueChange={(value) => dispatch({ kind: 'select_replacement', value })}>
                      <SelectTrigger id="replacement-agent"><SelectValue placeholder="Choose an agent" /></SelectTrigger>
                      <SelectContent>
                        {agentTargets.map((agent) => <SelectItem key={agent.principalRef} value={agent.principalRef}>{agent.displayName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">The agent identity, activity, and credit history stay attached. Its current credential remains usable until the new one is delivered.</p>
                  </div>
                ) : null}
                {agentTargetsError !== undefined || agentTargetsNextCursor !== undefined ? (
                  <Alert>
                    <AlertTitle>{agentTargetsError === undefined ? 'More agents are available' : 'Agent list needs refreshing'}</AlertTitle>
                    <AlertDescription className="grid gap-2">
                      {agentTargetsError === undefined ? 'Load the next page if the agent you want is not shown.' : agentTargetsError}
                      <Button type="button" variant="secondary" className="w-fit" disabled={agentTargetsLoading} onClick={() => void loadAgentTargets()}>
                        {agentTargetsLoading ? 'Loading agents…' : agentTargetsError === undefined ? 'Load more agents' : 'Retry agent list'}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
              </fieldset>
              {accessProfile === 'supplier' ? (
                <Alert>
                  <AlertTitle>Supplier management</AlertTitle>
                  <AlertDescription>May inspect lifecycle and earnings, publish, recheck, withdraw, and republish your Operations. It cannot spend buyer credit or manage unrelated account settings.</AlertDescription>
                </Alert>
              ) : <fieldset className="grid gap-3" disabled={pending}>
                <legend className="sr-only">Authority</legend>
                <RadioGroup aria-describedby="consent-expiry" value={selectedMode} onValueChange={(value) => dispatch({ kind: 'select_mode', value: value as PublicAuthorityMode })} className="grid gap-2">
                  {authorityOptions.map((option) => {
                    const disabled = !canSelectAuthority(option.value, mode)
                    return (
                      <Label key={option.value} htmlFor={`authority-${option.value}`} className="grid min-h-touch cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md border border-border px-3 py-3 has-[[data-state=checked]]:border-foreground">
                        <RadioGroupItem id={`authority-${option.value}`} value={option.value} disabled={disabled} className="mt-1" />
                        <span className="grid gap-1">
                          <span className="font-medium text-foreground">{option.label}</span>
                          <span className="text-sm font-normal text-muted-foreground">{disabled ? 'This agent requested narrower access.' : option.description}</span>
                        </span>
                      </Label>
                    )
                  })}
                </RadioGroup>
              </fieldset>}
              <AeFactList facts={[
                { label: 'Application', value: `${clientName} · Development · Standard rate limits` },
                { label: 'Expiry', value: 'Access expires in seven days. You can revoke it at any time from Agents.' },
              ]} />
              <p id="consent-expiry" className="sr-only">Access expires in seven days. You can revoke it at any time from Agents.</p>
            </AeSection>
            <div className="flex flex-wrap gap-3">
              <Button aria-describedby="consent-expiry" onClick={() => void decide('approve')} disabled={pending || (connectionTarget === 'replace_credential' && replacementPrincipalRef === undefined)}>{pending ? 'Approving…' : 'Approve access'}</Button>
              <Button aria-describedby="consent-expiry" variant="secondary" onClick={() => void decide('deny')} disabled={pending}>{pending ? 'Working…' : 'Decline'}</Button>
            </div>
          </>
        ) : status === 'approved' ? (
          <Alert><AlertTitle>Access approved — return to your agent</AlertTitle><AlertDescription>{accessProfile === 'supplier' ? 'AE delivers the separate supplier key to that agent once. It can now manage the approved supplier lifecycle.' : 'AE delivers the caller key to that agent once. It can now finish setup; supplier authority is not included.'}</AlertDescription></Alert>
        ) : status === 'denied' ? (
          <Alert><AlertTitle>Access not approved</AlertTitle><AlertDescription>Your agent can start a new request if you want to try again.</AlertDescription></Alert>
        ) : (
          <Alert variant="destructive"><AlertTitle>Access request unavailable</AlertTitle><AlertDescription>It may have expired. Start a new request from your agent.</AlertDescription></Alert>
        )}
      </AeSettingsStack>
    </AeOperatorShell>
  )
}
