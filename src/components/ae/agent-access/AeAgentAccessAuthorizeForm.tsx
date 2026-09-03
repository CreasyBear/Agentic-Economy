import { useReducer, useRef, useState } from 'react'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { useReverification } from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSection, AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import {
  searchMarketOperations,
  type OperationChoiceSearchResult,
} from '@/components/ae/command-panel/market-operations-client'
import {
  readAgentConsentDetails,
  type AgentConsentDetails,
  type AgentConsentTarget,
} from '@/modules/agent-access/public'
import { presentConnectionProblem } from '@/modules/agent-access/public'

type PublicAuthorityMode = 'inspect_only' | 'approve_each' | 'bounded_mandate'

const authorityOptions = [
  { value: 'inspect_only', label: 'Browse only', description: 'Discover, compare, and run free read-only operations.' },
  { value: 'approve_each', label: 'Ask each time', description: 'Paid or consequential work comes back to you first.' },
  { value: 'bounded_mandate', label: 'Work within limits', description: 'Paid work stays within the exact limits shown below.' },
] as const

function canSelectAuthority(value: PublicAuthorityMode, ceiling: string): boolean {
  if (value === 'inspect_only') return true
  if (value === 'approve_each') return ceiling !== 'inspect_only'
  return ceiling === 'bounded_mandate'
}

type ConsentFormState = Readonly<{
  status: 'idle' | 'approved' | 'denied' | 'error' | 'outcome_unknown'
  pending: boolean
  selectedMode: PublicAuthorityMode
  connectionTarget: 'new_agent' | 'replace_credential'
  replacementMode: 'planned' | 'compromise'
  agentTargets: readonly AgentConsentTarget[]
  agentTargetsNextCursor?: string
  agentTargetsLoading: boolean
  agentTargetsError?: string
  replacementPrincipalRef?: string
  errorReference?: string
  errorCode?: string
}>

type ConsentFormAction =
  | Readonly<{ kind: 'select_mode'; value: PublicAuthorityMode }>
  | Readonly<{ kind: 'select_connection'; value: 'new_agent' | 'replace_credential' }>
  | Readonly<{ kind: 'select_replacement_mode'; value: 'planned' | 'compromise' }>
  | Readonly<{ kind: 'select_replacement'; value: string }>
  | Readonly<{ kind: 'page_started' }>
  | Readonly<{ kind: 'page_loaded'; targets: readonly AgentConsentTarget[]; nextCursor?: string }>
  | Readonly<{ kind: 'page_failed' }>
  | Readonly<{ kind: 'decision_started' }>
  | Readonly<{
      kind: 'decision_finished'
      status: 'idle' | 'approved' | 'denied' | 'error' | 'outcome_unknown'
      errorReference?: string
      errorCode?: string
    }>

function initialConsentFormState(details: AgentConsentDetails): ConsentFormState {
  const suggestedReconnect = details.reconnectPrincipalRef === undefined
    ? undefined
    : details.agentTargets.find(({ principalRef }) => principalRef === details.reconnectPrincipalRef)
  return {
    status: 'idle',
    pending: false,
    selectedMode: details.mode === 'inspect_only'
      ? 'inspect_only'
      : details.mode === 'bounded_mandate'
        ? 'bounded_mandate'
        : 'approve_each',
    connectionTarget: suggestedReconnect !== undefined || details.reconnectAmbiguous ? 'replace_credential' : 'new_agent',
    replacementMode: 'planned',
    agentTargets: details.agentTargets,
    ...(details.agentTargetsNextCursor === undefined ? {} : { agentTargetsNextCursor: details.agentTargetsNextCursor }),
    agentTargetsLoading: false,
    ...(suggestedReconnect === undefined ? {} : { replacementPrincipalRef: suggestedReconnect.principalRef }),
    ...(details.agentTargetsUnavailable
      ? { agentTargetsError: 'Existing agents could not be loaded. Retry before replacing a credential.' }
      : {}),
  }
}

function consentFormReducer(state: ConsentFormState, action: ConsentFormAction): ConsentFormState {
  if (action.kind === 'select_mode') return { ...state, selectedMode: action.value }
  if (action.kind === 'select_connection') return { ...state, connectionTarget: action.value }
  if (action.kind === 'select_replacement_mode') return { ...state, replacementMode: action.value }
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
  if (action.kind === 'decision_started') {
    const { errorReference: _errorReference, ...retained } = state
    return { ...retained, pending: true }
  }
  const { errorReference: _errorReference, errorCode: _errorCode, ...retained } = state
  return {
    ...retained,
    pending: false,
    status: action.status,
    ...(action.errorReference === undefined ? {} : { errorReference: action.errorReference }),
    ...(action.errorCode === undefined ? {} : { errorCode: action.errorCode }),
  }
}

type ConsentActionResult =
  | Readonly<{ kind: 'approved'; grantRef: string; redirectTo?: string; readbackRef?: string }>
  | Readonly<{ kind: 'denied'; grantRef: string }>
  | Readonly<{ kind: 'outcome_unknown'; grantRef: string; readbackRef: string; correlationRef?: string }>
  | Readonly<{ kind: 'refused' | 'conflict'; code: string }>
  | Readonly<{ kind: 'rate_limited'; retryAfter: number }>
  | Readonly<{ kind: 'unavailable'; code: 'security_control_unavailable'; correlationRef: string }>

type AgentAccessAuthorizeFormProps = Readonly<{
  locator: Readonly<{ kind: 'user_code' | 'grant_ref'; value: string }>
  oauthState?: string
  details: AgentConsentDetails & Readonly<{
    grantRef: string
    grantRevision: number
    flow: 'device_code' | 'authorization_code'
    clientName: string
    mode: string
    environment: 'sandbox' | 'production'
    operationAccess: 'all_admitted' | 'selected_operations'
    operationRefs: readonly string[]
    expiresInSeconds: number
    accessSummary: string
  }>
}>

type SubmitApproval = (body: string) => Promise<ConsentActionResult>

const submitLocalApproval: SubmitApproval = async (body) => await fetch('/oauth/authorize', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
}).then(async (response) => await response.json() as ConsentActionResult)

export function AeAgentAccessAuthorizeForm(props: AgentAccessAuthorizeFormProps) {
  return isLocalE2EAuthBypassEnabled()
    ? <LocalAgentAccessAuthorizeForm {...props} />
    : <ClerkAgentAccessAuthorizeForm {...props} />
}

function ClerkAgentAccessAuthorizeForm(props: AgentAccessAuthorizeFormProps) {
  const submitApproval = useReverification(async (body: string) => await fetch('/oauth/authorize', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).then(async (response) => await response.json() as ConsentActionResult))
  return <AgentAccessAuthorizeForm {...props} submitApproval={submitApproval} />
}

function LocalAgentAccessAuthorizeForm(props: AgentAccessAuthorizeFormProps) {
  return <AgentAccessAuthorizeForm {...props} submitApproval={submitLocalApproval} />
}

function AgentAccessAuthorizeForm({ locator, oauthState, details, submitApproval }: AgentAccessAuthorizeFormProps & Readonly<{
  submitApproval: SubmitApproval
}>) {
  const { grantRef, grantRevision, clientName, mode, environment, operationAccess, operationRefs, expiresInSeconds, accessSummary } = details
  const [state, dispatch] = useReducer(consentFormReducer, details, initialConsentFormState)
  const [approvedOperationAccess, setApprovedOperationAccess] = useState(operationAccess)
  const [approvedOperationRefs, setApprovedOperationRefs] = useState<readonly string[]>(operationRefs)
  const [operationQuery, setOperationQuery] = useState('')
  const [operationSearch, setOperationSearch] = useState<Readonly<{
    pending: boolean
    result?: OperationChoiceSearchResult
    error?: string
  }>>({ pending: false })
  const approveButtonRef = useRef<HTMLButtonElement>(null)
  const approvalInFlightRef = useRef(false)
  const operationSelectionSummary = approvedOperationAccess === 'all_admitted'
    ? 'All admitted Operations, including future admitted Operations'
    : `${approvedOperationRefs.length} selected ${approvedOperationRefs.length === 1 ? 'Operation' : 'Operations'}`
  const approvedOperationRefSet = new Set(approvedOperationRefs)
  const accessProfile = details.accessProfile ?? 'market'
  const {
    status, pending, selectedMode, connectionTarget, agentTargets, agentTargetsNextCursor,
    agentTargetsLoading, agentTargetsError, replacementPrincipalRef, replacementMode,
  } = state
  const approvalLabel = connectionTarget === 'new_agent'
    ? 'Connect agent'
    : replacementMode === 'compromise'
      ? 'Revoke and replace credential'
      : 'Replace credential'
  const approvalPendingLabel = connectionTarget === 'new_agent' ? 'Connecting…' : 'Replacing…'

  async function findOperations() {
    const query = operationQuery.trim()
    if (query.length === 0 || operationSearch.pending) return
    setOperationSearch({ pending: true })
    try {
      setOperationSearch({ pending: false, result: await searchMarketOperations({ query, limit: 8 }) })
    } catch {
      setOperationSearch({ pending: false, error: 'Operation search is temporarily unavailable. Try again.' })
    }
  }

  function addApprovedOperation(operationRef: string) {
    setApprovedOperationAccess('selected_operations')
    setApprovedOperationRefs((current) => [...new Set([...current, operationRef])].sort())
  }

  function removeApprovedOperation(operationRef: string) {
    setApprovedOperationRefs((current) => current.filter((value) => value !== operationRef))
  }

  async function loadAgentTargets() {
    if (agentTargetsLoading) return
    dispatch({ kind: 'page_started' })
    try {
      const query = new URLSearchParams({ [locator.kind]: locator.value })
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

  function approvalBody(): string | undefined {
    const replacement = connectionTarget === 'replace_credential'
      ? agentTargets.find((target) => target.principalRef === replacementPrincipalRef)
      : undefined
    const expectedTargetRevision = connectionTarget === 'new_agent'
      ? grantRevision
      : replacement?.principalRevision
    if (expectedTargetRevision === undefined) return undefined
    if (approvedOperationAccess === 'selected_operations' && approvedOperationRefs.length === 0) return undefined
    const params = new URLSearchParams({
      grant_ref: grantRef,
      expected_grant_revision: String(grantRevision),
      expected_target_revision: String(expectedTargetRevision),
      decision: 'approve',
      authority_mode: selectedMode,
      approved_operation_access: approvedOperationAccess,
      connection_target: connectionTarget,
      ...(replacementPrincipalRef === undefined || connectionTarget !== 'replace_credential'
        ? {}
        : { principal_ref: replacementPrincipalRef }),
      ...(connectionTarget === 'replace_credential' ? { replacement_mode: replacementMode } : {}),
      ...(oauthState === undefined ? {} : { state: oauthState }),
    })
    for (const operationRef of approvedOperationRefs) params.append('approved_operation_ref', operationRef)
    return params.toString()
  }

  async function approve() {
    if (approvalInFlightRef.current) return
    const body = approvalBody()
    if (body === undefined) return
    approvalInFlightRef.current = true
    dispatch({ kind: 'decision_started' })
    try {
      const result = await submitApproval(body)
      if (result.kind === 'approved') {
        dispatch({ kind: 'decision_finished', status: 'approved' })
        if (result.redirectTo !== undefined) window.location.assign(result.redirectTo)
        return
      }
      dispatch({
        kind: 'decision_finished',
        status: result.kind === 'outcome_unknown' ? 'outcome_unknown' : 'error',
        ...(result.kind === 'unavailable' ? { errorReference: result.correlationRef } : {}),
        ...('code' in result ? { errorCode: result.code } : {}),
      })
    } catch (error) {
      if (isReverificationCancelledError(error)) {
        approvalInFlightRef.current = false
        dispatch({ kind: 'decision_finished', status: 'idle' })
        setTimeout(() => approveButtonRef.current?.focus(), 0)
        return
      }
      dispatch({ kind: 'decision_finished', status: 'error' })
    }
  }

  async function deny() {
    dispatch({ kind: 'decision_started' })
    try {
      const result = await fetch('/oauth/authorize', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_ref: grantRef, decision: 'deny' }).toString(),
      }).then(async (response) => {
        if (!response.ok) {
          const snapshot = await response.text().catch(() => '')
          throw new Error(`Deny decision refused with HTTP ${response.status}${snapshot.length === 0 ? '' : `: ${snapshot.slice(0, 120)}`}`)
        }
        return await response.json() as ConsentActionResult
      })
      dispatch({ kind: 'decision_finished', status: result.kind === 'denied' ? 'denied' : 'error' })
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
              {agentTargets.length === 0 && agentTargetsError === undefined && agentTargetsNextCursor === undefined ? null : <fieldset className="grid gap-3" disabled={pending}>
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
                    <fieldset className="grid gap-2">
                      <legend className="text-sm font-medium text-foreground">Replacement reason</legend>
                      <RadioGroup
                        value={replacementMode}
                        onValueChange={(value) => dispatch({ kind: 'select_replacement_mode', value: value as 'planned' | 'compromise' })}
                        className="grid gap-2 sm:grid-cols-2"
                      >
                        <Label htmlFor="replacement-planned" className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-foreground">
                          <RadioGroupItem id="replacement-planned" value="planned" className="mt-1" />
                          <span><span className="block font-medium">Planned rotation</span><span className="text-sm font-normal text-muted-foreground">Keep the current credential usable until the successor is delivered.</span></span>
                        </Label>
                        <Label htmlFor="replacement-compromise" className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-foreground">
                          <RadioGroupItem id="replacement-compromise" value="compromise" className="mt-1" />
                          <span><span className="block font-medium">Suspected compromise</span><span className="text-sm font-normal text-muted-foreground">Revoke the current credential before issuing its successor.</span></span>
                        </Label>
                      </RadioGroup>
                    </fieldset>
                    <p className="text-sm text-muted-foreground">The agent identity, activity, and credit history stay attached. {replacementMode === 'planned' ? 'Its current credential remains usable until the new one is delivered.' : 'Its current authority is revoked first and is never reactivated.'}</p>
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
              </fieldset>}
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
              {accessProfile === 'market' ? (
                <fieldset className="grid gap-3" disabled={pending}>
                  <legend className="text-sm font-medium text-foreground">Operations</legend>
                  {operationAccess === 'all_admitted' ? (
                    <RadioGroup
                      value={approvedOperationAccess}
                      onValueChange={(value) => setApprovedOperationAccess(value as 'all_admitted' | 'selected_operations')}
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      <Label htmlFor="operations-all" className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-foreground">
                        <RadioGroupItem id="operations-all" value="all_admitted" className="mt-1" />
                        <span><span className="block font-medium">All admitted Operations</span><span className="text-sm font-normal text-muted-foreground">Includes Operations admitted later.</span></span>
                      </Label>
                      <Label htmlFor="operations-selected" className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-foreground">
                        <RadioGroupItem id="operations-selected" value="selected_operations" className="mt-1" />
                        <span><span className="block font-medium">Selected Operations</span><span className="text-sm font-normal text-muted-foreground">Limit this Agent to exact current Operation references.</span></span>
                      </Label>
                    </RadioGroup>
                  ) : (
                    <p className="text-sm text-muted-foreground">The caller requested selected Operations. You may approve a non-empty subset, but cannot broaden it.</p>
                  )}
                  {approvedOperationAccess === 'selected_operations' ? (
                    <div className="grid gap-3">
                      {approvedOperationRefs.length === 0 ? (
                        <Alert variant="destructive"><AlertTitle>Select at least one Operation</AlertTitle><AlertDescription>Selected access cannot be empty.</AlertDescription></Alert>
                      ) : (
                        <ul className="grid gap-2" aria-label="Approved Operations">
                          {approvedOperationRefs.map((operationRef) => (
                            <li key={operationRef} className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2">
                              <Link
                                to="/operations/$operationRef"
                                params={{ operationRef }}
                                className="truncate font-mono text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {operationRef}
                              </Link>
                              <Button type="button" variant="secondary" onClick={() => removeApprovedOperation(operationRef)}>Remove</Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {operationAccess === 'all_admitted' ? (
                        <div className="grid gap-2">
                          <Label htmlFor="operation-search">Find an admitted Operation</Label>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input id="operation-search" value={operationQuery} onChange={(event) => setOperationQuery(event.target.value)} />
                            <Button type="button" variant="secondary" disabled={operationSearch.pending || operationQuery.trim().length === 0} onClick={() => void findOperations()}>
                              {operationSearch.pending ? 'Searching…' : 'Search Operations'}
                            </Button>
                          </div>
                          {operationSearch.error === undefined ? null : <p role="alert" className="text-sm text-destructive">{operationSearch.error}</p>}
                          {operationSearch.result?.kind === 'ok' ? (
                            <ul className="grid gap-2" aria-label="Operation search results">
                              {operationSearch.result.items.map((item) => (
                                <li key={item.operationRef} className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2">
                                  <span className="min-w-0"><span className="block truncate font-medium">{item.title}</span><span className="block truncate font-mono text-xs text-muted-foreground">{item.operationRef}</span></span>
                                  <Button type="button" variant="secondary" disabled={approvedOperationRefSet.has(item.operationRef)} onClick={() => addApprovedOperation(item.operationRef)}>
                                    {approvedOperationRefSet.has(item.operationRef) ? 'Added' : 'Add'}
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </fieldset>
              ) : null}
              <AeFactList facts={[
                { label: 'Application', value: `${clientName} · ${environment === 'sandbox' ? 'Sandbox' : 'Production'}` },
                { label: 'Operations', value: operationSelectionSummary },
                { label: 'Approved limits', value: accessSummary },
                { label: 'Connection', value: `Stays signed in until ${formatConsentDuration(expiresInSeconds)} after approval, unless you disconnect it first.` },
              ]} />
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="w-fit min-h-touch">Technical details</Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <AeFactList density="compact" facts={[
                    { label: 'Request revision', value: String(grantRevision), mono: true },
                    { label: 'Requested environment', value: environment === 'sandbox' ? 'Sandbox' : 'Production' },
                    { label: 'Operation references', value: operationRefs.length === 0 ? 'All admitted Operations' : operationRefs.join(', '), mono: true },
                    { label: 'Request reference', value: grantRef, mono: true },
                  ]} />
                </CollapsibleContent>
              </Collapsible>
              <p id="consent-expiry" className="sr-only">Access expires {formatConsentDuration(expiresInSeconds)} after issue. You can revoke it at any time from Agents.</p>
            </AeSection>
            <div className="flex flex-wrap gap-3">
              <Button
                ref={approveButtonRef}
                aria-describedby="consent-expiry"
                variant={connectionTarget === 'replace_credential' && replacementMode === 'compromise' ? 'destructive' : 'default'}
                onClick={() => void approve()}
                disabled={pending || (approvedOperationAccess === 'selected_operations' && approvedOperationRefs.length === 0) || (connectionTarget === 'replace_credential' && replacementPrincipalRef === undefined)}
              >
                {pending ? approvalPendingLabel : approvalLabel}
              </Button>
              <Button aria-describedby="consent-expiry" variant="secondary" onClick={() => void deny()} disabled={pending}>{pending ? 'Working…' : 'Decline'}</Button>
            </div>
          </>
        ) : status === 'approved' ? (
          <Alert><AlertTitle>Connected to {clientName}</AlertTitle><AlertDescription>Return there to continue. This connection remains signed in until it expires or you disconnect it.</AlertDescription></Alert>
        ) : status === 'denied' ? (
          <ConnectionProblemAlert code="access_denied" />
        ) : status === 'outcome_unknown' ? (
          <ConnectionProblemAlert code="outcome_unknown" technicalReference={grantRef} />
        ) : (
          <ConnectionProblemAlert code={state.errorCode ?? (state.errorReference === undefined ? 'expired_token' : 'source_unavailable')} {...(state.errorReference === undefined ? {} : { technicalReference: state.errorReference })} />
        )}
      </AeSettingsStack>
    </AeOperatorShell>
  )
}

function ConnectionProblemAlert({ code, technicalReference }: Readonly<{ code: string; technicalReference?: string }>) {
  const presentation = presentConnectionProblem({ code, ...(technicalReference === undefined ? {} : { instance: technicalReference }) })
  return (
    <Alert variant="destructive">
      <AlertTitle>{presentation.heading}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <p>{presentation.outcome}</p>
        <p>{presentation.nextAction}</p>
        {presentation.technicalReference === undefined ? null : (
          <p className="font-mono text-xs">Reference: {presentation.technicalReference}</p>
        )}
      </AlertDescription>
    </Alert>
  )
}

function formatConsentDuration(seconds: number): string {
  if (seconds % 86_400 === 0) return `in ${seconds / 86_400} ${seconds === 86_400 ? 'day' : 'days'}`
  if (seconds % 3_600 === 0) return `in ${seconds / 3_600} ${seconds === 3_600 ? 'hour' : 'hours'}`
  if (seconds % 60 === 0) return `in ${seconds / 60} ${seconds === 60 ? 'minute' : 'minutes'}`
  return `in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
}
