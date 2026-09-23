import { useReducer, useRef, useState } from 'react'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { useReverification } from '@clerk/tanstack-react-start'

import { searchMarketTools } from '@/components/ae/command-panel/market-tools-client'
import { degrade } from '@/lib/observability/degrade'
import {
  readAgentConsentDetails,
  type AgentConsentTarget,
} from '@/modules/agent-access/consent-read-model'
import type {
  AgentAccessAuthorizeFormDetails,
  ConsentActionResult,
  ConsentDecisionPhase,
  ConsentLocator,
} from '@/modules/agent-access/consent.contracts'

import type { ConsentToolSearchView, PublicAuthorityMode } from './authorize-form.contracts'

type ConsentFormState = Readonly<{
  decision: ConsentDecisionPhase
  selectedMode: AgentAccessAuthorizeFormDetails['mode']
  connectionTarget: 'new_agent' | 'replace_credential'
  replacementMode: 'planned' | 'compromise'
  agentTargets: readonly AgentConsentTarget[]
  agentTargetsUnavailable: boolean
  agentTargetsNextCursor?: string
  agentTargetsLoading: boolean
  agentTargetsError?: string
  replacementPrincipalRef?: string
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
      decision: ConsentDecisionPhase
    }>

function initialConsentFormState(details: AgentAccessAuthorizeFormDetails): ConsentFormState {
  const suggestedReconnect = details.reconnectPrincipalRef === undefined
    ? undefined
    : details.agentTargets.find(({ principalRef }) => principalRef === details.reconnectPrincipalRef)
  return {
    decision: { phase: 'idle' },
    selectedMode: details.mode,
    connectionTarget: suggestedReconnect !== undefined || details.reconnectAmbiguous ? 'replace_credential' : 'new_agent',
    replacementMode: 'planned',
    agentTargets: details.agentTargets,
    agentTargetsUnavailable: details.agentTargetsUnavailable,
    ...(details.agentTargetsNextCursor === undefined ? {} : { agentTargetsNextCursor: details.agentTargetsNextCursor }),
    agentTargetsLoading: false,
    ...(suggestedReconnect === undefined ? {} : { replacementPrincipalRef: suggestedReconnect.principalRef }),
    ...(details.agentTargetsUnavailable
      ? { agentTargetsError: 'Existing agent choices could not be verified. Retry before approving this request.' }
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
      agentTargetsUnavailable: false,
      agentTargetsLoading: false,
      ...(action.nextCursor === undefined ? {} : { agentTargetsNextCursor: action.nextCursor }),
    }
  }
  if (action.kind === 'decision_started') {
    return { ...state, decision: { phase: 'submitting' } }
  }
  return { ...state, decision: action.decision }
}

export type BuildApprovalBodyInput = Readonly<{
  grantRef: string
  grantRevision: number
  oauthState?: string
  connectionTarget: 'new_agent' | 'replace_credential'
  replacementPrincipalRef?: string
  replacementMode: 'planned' | 'compromise'
  agentTargets: readonly AgentConsentTarget[]
  agentTargetsUnavailable: boolean
  selectedMode: AgentAccessAuthorizeFormDetails['mode']
  approvedToolAccess: 'all_admitted' | 'selected_tools'
  approvedToolRefs: readonly string[]
}>

export function buildApprovalBody(input: BuildApprovalBodyInput): string | undefined {
  const replacement = input.connectionTarget === 'replace_credential'
    ? input.agentTargets.find((target) => target.principalRef === input.replacementPrincipalRef)
    : undefined
  const expectedTargetRevision = input.connectionTarget === 'new_agent'
    ? input.grantRevision
    : replacement?.principalRevision
  if (expectedTargetRevision === undefined) return undefined
  if (input.agentTargetsUnavailable) return undefined
  if (input.approvedToolAccess === 'selected_tools' && input.approvedToolRefs.length === 0) return undefined
  const params = new URLSearchParams({
    grant_ref: input.grantRef,
    expected_grant_revision: String(input.grantRevision),
    expected_target_revision: String(expectedTargetRevision),
    decision: 'approve',
    authority_mode: input.selectedMode,
    approved_tool_access: input.approvedToolAccess,
    connection_target: input.connectionTarget,
    ...(input.replacementPrincipalRef === undefined || input.connectionTarget !== 'replace_credential'
      ? {}
      : { principal_ref: input.replacementPrincipalRef }),
    ...(input.connectionTarget === 'replace_credential' ? { replacement_mode: input.replacementMode } : {}),
    ...(input.oauthState === undefined ? {} : { state: input.oauthState }),
  })
  for (const toolRef of input.approvedToolRefs) params.append('approved_tool_ref', toolRef)
  return params.toString()
}

export function buildDenyBody(grantRef: string, oauthState?: string): string {
  return new URLSearchParams({
    grant_ref: grantRef,
    decision: 'deny',
    ...(oauthState === undefined ? {} : { state: oauthState }),
  }).toString()
}

export function buildAgentTargetsPageUrl(locator: ConsentLocator, agentTargetsNextCursor?: string): string {
  const query = new URLSearchParams({ [locator.kind]: locator.value })
  if (agentTargetsNextCursor !== undefined) query.set('agent_cursor', agentTargetsNextCursor)
  return `/oauth/authorize?${query.toString()}`
}

export function mapConsentActionResultToDecision(result: ConsentActionResult): ConsentDecisionPhase {
  if (result.kind === 'outcome_unknown') return { phase: 'outcome_unknown' }
  return {
    phase: 'error',
    errorCode: 'code' in result ? result.code : 'source_unavailable',
    ...(result.kind === 'unavailable' ? { errorReference: result.correlationRef } : {}),
  }
}

type SubmitApproval = (body: string) => Promise<ConsentActionResult>

export type UseAgentConsentDecisionParams = Readonly<{
  locator: ConsentLocator
  oauthState?: string
  details: AgentAccessAuthorizeFormDetails
  submitApproval?: SubmitApproval
}>

export function useAgentConsentDecision({
  locator,
  oauthState,
  details,
  submitApproval: submitApprovalOverride,
}: UseAgentConsentDecisionParams) {
  const { grantRef, grantRevision, clientName, mode, environment, toolAccess, toolRefs, expiresInSeconds, accessSummary } = details
  const [state, dispatch] = useReducer(consentFormReducer, details, initialConsentFormState)
  const [approvedToolAccess, setApprovedToolAccess] = useState(toolAccess)
  const [approvedToolRefs, setApprovedToolRefs] = useState<readonly string[]>(toolRefs)
  const [toolQuery, setToolQuery] = useState('')
  const [toolSearch, setToolSearch] = useState<ConsentToolSearchView>({ pending: false })
  const approveButtonRef = useRef<HTMLButtonElement>(null)
  const approvalInFlightRef = useRef(false)

  const defaultSubmitApproval = useReverification(async (body: string) => await fetch('/oauth/authorize', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).then(async (response) => await response.json() as ConsentActionResult))
  const submitApproval = submitApprovalOverride ?? defaultSubmitApproval

  const toolSelectionSummary = approvedToolAccess === 'all_admitted'
    ? 'All admitted Tools, including future admitted Tools'
    : `${approvedToolRefs.length} selected ${approvedToolRefs.length === 1 ? 'Tool' : 'Tools'}`
  const approvedToolRefSet = new Set(approvedToolRefs)
  const accessProfile = details.accessProfile ?? 'market'
  const {
    decision,
    selectedMode,
    connectionTarget,
    agentTargets,
    agentTargetsUnavailable,
    agentTargetsNextCursor,
    agentTargetsLoading,
    agentTargetsError,
    replacementPrincipalRef,
    replacementMode,
  } = state
  const pending = decision.phase === 'submitting'
  const approvalLabel = connectionTarget === 'new_agent'
    ? 'Connect agent'
    : replacementMode === 'compromise'
      ? 'Revoke and replace credential'
      : 'Replace credential'

  const showConnectionFieldset = !(agentTargets.length === 0 && agentTargetsError === undefined && agentTargetsNextCursor === undefined)

  async function findTools() {
    const query = toolQuery.trim()
    if (query.length === 0 || toolSearch.pending) return
    setToolSearch({ pending: true })
    try {
      const result = await searchMarketTools({ query, limit: 8 })
      if (result.kind === 'matched' || result.kind === 'degraded') {
        setToolSearch({ pending: false, results: result.results.map(({ toolRef, title }) => ({ toolRef, title })) })
      } else if (result.kind === 'noMatch') {
        const nearMisses = result.nearMisses.map(({ title }) => title).join(', ')
        setToolSearch({ pending: false, noMatchMessage: `No suitable Tools found.${nearMisses.length === 0 ? '' : ` Near misses (not matches): ${nearMisses}.`}` })
      } else {
        setToolSearch({ pending: false, error: 'Tool search is temporarily unavailable. Try again.' })
      }
    } catch (cause) {
      setToolSearch(degrade(cause, { pending: false, error: 'Tool search is temporarily unavailable. Try again.' }, { site: 'findTools', reason: 'source_unavailable' }))
    }
  }

  function addApprovedTool(toolRef: string) {
    setApprovedToolAccess('selected_tools')
    setApprovedToolRefs((current) => [...new Set([...current, toolRef])].sort())
  }

  function removeApprovedTool(toolRef: string) {
    setApprovedToolRefs((current) => current.filter((value) => value !== toolRef))
  }

  async function loadAgentTargets() {
    if (agentTargetsLoading) return
    dispatch({ kind: 'page_started' })
    try {
      const response = await fetch(buildAgentTargetsPageUrl(locator, agentTargetsNextCursor), { credentials: 'same-origin' })
      if (!response.ok) throw new Error('agent_targets_unavailable')
      const next = readAgentConsentDetails(await response.text())
      if (next.grantRef !== grantRef || next.agentTargetsUnavailable) throw new Error('agent_targets_unavailable')
      dispatch({
        kind: 'page_loaded',
        targets: next.agentTargets,
        ...(next.agentTargetsNextCursor === undefined ? {} : { nextCursor: next.agentTargetsNextCursor }),
      })
    } catch (cause) {
      dispatch(degrade(cause, { kind: 'page_failed' }, { site: 'loadAgentTargets', reason: 'source_unavailable' }))
    }
  }

  function approvalBody(): string | undefined {
    return buildApprovalBody({
      grantRef,
      grantRevision,
      ...(oauthState === undefined ? {} : { oauthState }),
      connectionTarget,
      ...(replacementPrincipalRef === undefined ? {} : { replacementPrincipalRef }),
      replacementMode,
      agentTargets,
      agentTargetsUnavailable,
      selectedMode,
      approvedToolAccess,
      approvedToolRefs,
    })
  }

  async function approve() {
    if (approvalInFlightRef.current || agentTargetsUnavailable) return
    if (approvedToolAccess === 'selected_tools' && approvedToolRefs.length === 0) {
      const emptyField = document.getElementById('tool-search') ?? document.getElementById('tool-selection-empty')
      emptyField?.focus()
      return
    }
    if (connectionTarget === 'replace_credential' && replacementPrincipalRef === undefined) {
      document.getElementById('replacement-agent')?.focus()
      return
    }
    const body = approvalBody()
    if (body === undefined) return
    approvalInFlightRef.current = true
    dispatch({ kind: 'decision_started' })
    try {
      const result = await submitApproval(body)
      if (result.kind === 'approved') {
        dispatch({ kind: 'decision_finished', decision: { phase: 'approved' } })
        if (result.redirectTo !== undefined) window.location.assign(result.redirectTo)
        return
      }
      dispatch({ kind: 'decision_finished', decision: mapConsentActionResultToDecision(result) })
    } catch (error) {
      if (isReverificationCancelledError(error)) {
        approvalInFlightRef.current = false
        dispatch({ kind: 'decision_finished', decision: { phase: 'idle' } })
        setTimeout(() => approveButtonRef.current?.focus(), 0)
        return
      }
      dispatch({ kind: 'decision_finished', decision: { phase: 'outcome_unknown' } })
    }
  }

  async function deny() {
    dispatch({ kind: 'decision_started' })
    try {
      const result = await fetch('/oauth/authorize', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildDenyBody(grantRef, oauthState),
      }).then(async (response) => {
        if (!response.ok) {
          const snapshot = await response.text().catch(() => '')
          throw new Error(`Deny decision refused with HTTP ${response.status}${snapshot.length === 0 ? '' : `: ${snapshot.slice(0, 120)}`}`)
        }
        return await response.json() as ConsentActionResult
      })
      dispatch({
        kind: 'decision_finished',
        decision: result.kind === 'denied' ? { phase: 'denied' } : { phase: 'outcome_unknown' },
      })
      if (result.kind === 'denied' && result.redirectTo !== undefined) window.location.assign(result.redirectTo)
    } catch (cause) {
      dispatch(degrade(cause, { kind: 'decision_finished', decision: { phase: 'outcome_unknown' } }, { site: 'deny', reason: 'source_unavailable' }))
    }
  }

  return {
    clientName,
    environment,
    expiresInSeconds,
    accessSummary,
    grantRef,
    grantRevision,
    toolRefs,
    toolAccess,
    accessProfile,
    mode,
    oauthState,
    decision,
    pending,
    selectedMode,
    connectionTarget,
    replacementMode,
    replacementPrincipalRef,
    agentTargets,
    agentTargetsUnavailable,
    agentTargetsNextCursor,
    agentTargetsLoading,
    agentTargetsError,
    showConnectionFieldset,
    approvedToolAccess,
    approvedToolRefs,
    approvedToolRefSet,
    toolQuery,
    toolSearch,
    toolSelectionSummary,
    approvalLabel,
    approveButtonRef,
    dispatch,
    findTools,
    addApprovedTool,
    removeApprovedTool,
    loadAgentTargets,
    approve,
    deny,
    setApprovedToolAccess,
    setToolQuery,
  }
}
