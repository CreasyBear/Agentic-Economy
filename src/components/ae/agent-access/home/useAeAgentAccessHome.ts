import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'

import { readAgentOnboardingRequestServer } from '@/lib/server/agent-access-consent.functions'
import type { AgentOnboardingRequest } from '@/modules/agent-access/public'
import { readAgentDirectoryPageServer, readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { AgentLifecycleResult } from '@/modules/agent-access/agent-access'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import type {
  DirectoryPaginationIssue,
  LifecycleCommand,
  LifecycleIssue,
} from '@/modules/agent-access/agent-lifecycle.view-model'
import type { OwnerConnectionLifecycleResult } from '@/modules/agent-access/public'
import type {
  AgentSpendingLimitsReadResult,
  AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'
import type { ExactAmount } from '@/modules/money/public'
import { createRuntimeId } from '@/modules/common/runtime-id'
import { projectAgentFirstUse } from '@/modules/agent-access/public'
import { useTypedReverification } from '@/lib/client/useTypedReverification'
import {
  decideCallApprovalServer,
  listPendingCallApprovalsServer,
  type CallApprovalDecisionResult,
  type PendingCallApproval,
} from '@/modules/capability-execution/call-approval.functions'
import {
  disconnectAgentServer,
  readAgentSpendingLimitsServer,
  renameAgentServer,
  revokeOwnerConnectionServer,
  updateAgentSpendingLimitsServer,
} from '@/modules/agent-access/agent-access.functions'

import type { AeAgentAccessHomeProps, AeAgentAccessHomeView, ApprovalDecision } from './agent-access-home.contracts'

export type AgentConnectionStep = 'closed' | 'choose' | 'oauth'

function operationApprovalErrorCopy(
  code: Extract<CallApprovalDecisionResult, { kind: 'refused' }>['code'],
): string {
  if (code === 'authentication_required') return 'Sign in as the access owner, then try again.'
  if (code === 'mfa_reverification_required') return 'Verify with two-factor authentication to continue.'
  if (code === 'grant_not_current') return 'This agent grant changed. Review current access before trying again.'
  if (code === 'invocation_not_found') return 'This waiting operation is no longer available. Refresh the list.'
  if (code === 'authority_not_pending') return 'This operation no longer needs a decision. Refresh the list.'
  return 'This operation could not be verified. Refresh the list before deciding.'
}

function projectHomeFirstUse({ search, onboarding, directory, tracked, accessUnconfirmed }: {
  search: AeAgentAccessHomeProps['search']
  onboarding: AgentOnboardingRequest | undefined
  directory: AgentDirectoryProjection
  tracked: Readonly<{ caller: string; callRef: string }> | undefined
  accessUnconfirmed: boolean
}) {
  const hasRequest = search.grantRef !== undefined || search.userCode !== undefined || search.requestInvalid === true
  const caller = onboarding?.kind === 'request' ? onboarding.principalRef : search.caller
  const blocked = search.callInvalid === true || search.requestInvalid === true || onboarding?.kind === 'refused' && onboarding.reason !== 'not_found'
  const selectedCallRef = search.callRef ?? (tracked !== undefined && tracked.caller === caller ? tracked.callRef : undefined)
  const firstUse = projectAgentFirstUse({ directory: blocked ? { items: [], details: [] } : directory, unavailable: accessUnconfirmed || search.callInvalid === true,
    ...(caller === undefined ? {} : { caller }),
    ...(selectedCallRef === undefined ? {} : { callRef: selectedCallRef }),
    ...(search.resumeTool === undefined ? {} : { toolRef: search.resumeTool }),
  })
  return { hasRequest, caller, blocked, firstUse }
}

export function useAeAgentAccessHome({
  canonicalBaseUrl,
  initialDirectory,
  initialDirectoryUnavailable = false,
  initialOnboarding,
  search,
}: AeAgentAccessHomeProps): AeAgentAccessHomeView {
  const location = useLocation()
  const navigate = useNavigate()
  const readRequest = useServerFn(readAgentOnboardingRequestServer)
  const readDirectory = useServerFn(readAgentDirectoryServer)
  const readDirectoryPage = useServerFn(readAgentDirectoryPageServer)
  const disconnectAgent = useServerFn(disconnectAgentServer)
  const disconnectConnection = useServerFn(revokeOwnerConnectionServer)
  const renameAgent = useServerFn(renameAgentServer)
  const updateSpendingLimits = useServerFn(updateAgentSpendingLimitsServer)
  const verifiedSpendingUpdate = useTypedReverification(updateSpendingLimits,
    result => result.kind === 'refused' && result.code === 'mfa_reverification_required' ? 'strict_mfa' : null)
  const spendingCommand = useRef<{ material: string; idempotencyKey: string } | undefined>(undefined)
  const readSpendingLimits = useServerFn(readAgentSpendingLimitsServer)
  const readApprovals = useServerFn(listPendingCallApprovalsServer)
  const decideApproval = useServerFn(decideCallApprovalServer)
  const verifiedApproval = useTypedReverification(decideApproval,
    result => result.kind === 'refused' && result.code === 'mfa_reverification_required' ? 'strict_mfa' : null)

  const [directory, setDirectory] = useState<AgentDirectoryProjection>(initialDirectory)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const requestLocator = JSON.stringify([search.grantRef, search.userCode])
  const [requestState, setRequestState] = useState({ locator: requestLocator, result: initialOnboarding })
  // Coupling evidence to its locator prevents even a render of another request.
  // A new bootstrap outage retains confirmed facts for the same request only.
  const onboarding = requestState.locator === requestLocator ? requestState.result : undefined
  const setOnboarding = useCallback((result: AgentOnboardingRequest | undefined) => {
    setRequestState({ locator: requestLocator, result })
  }, [requestLocator])
  useEffect(() => {
    setRequestState(previous => ({ locator: requestLocator, result: previous.locator !== requestLocator ? undefined
      : initialOnboarding?.kind === 'unavailable' || initialOnboarding === undefined ? previous.result : initialOnboarding }))
  }, [requestLocator, initialOnboarding])
  const [accessUnconfirmed, setAccessUnconfirmed] = useState(initialDirectoryUnavailable)
  const target = JSON.stringify([search.caller, search.callRef, search.grantRef, search.userCode, search.requestInvalid, search.callInvalid])
  const targetRef = useRef(target)
  useEffect(() => { targetRef.current = target }, [target])
  const requestRef = useRef(onboarding)
  useEffect(() => { requestRef.current = onboarding }, [onboarding])
  const [tracked, setTracked] = useState<Readonly<{ caller: string; callRef: string }> | undefined>()
  const { hasRequest, caller, blocked, firstUse } = projectHomeFirstUse({ search, onboarding, directory, tracked, accessUnconfirmed })
  const trackedCall = useRef(tracked)
  useEffect(() => { trackedCall.current = tracked }, [tracked])
  useEffect(() => { setTracked(undefined) }, [requestLocator])
  const directoryReadInFlight = useRef(false)
  const directoryPageInFlight = useRef(false)
  const [liveUpdates, setLiveUpdates] = useState<'current' | 'delayed'>(initialDirectoryUnavailable ? 'delayed' : 'current')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [directoryError, setDirectoryError] = useState<string | undefined>(initialDirectoryUnavailable ? 'Agent progress is temporarily unavailable. Check the same request or Call again.' : undefined)
  const [directoryPaginationIssue, setDirectoryPaginationIssue] = useState<DirectoryPaginationIssue>()
  const [lifecycleIssue, setLifecycleIssue] = useState<LifecycleIssue>()
  const [lifecyclePending, setLifecyclePending] = useState<LifecycleCommand>()
  const [approvals, setApprovals] = useState<readonly PendingCallApproval[]>([])
  const approvalsReadInFlight = useRef(false)
  const [approvalsLoading, setApprovalsLoading] = useState(true)
  const [approvalsError, setApprovalsError] = useState<string>()
  const [approvalDecision, setApprovalDecision] = useState<ApprovalDecision>()
  const [approvalStatus, setApprovalStatus] = useState<string>()
  const showSetup = search.setup === 'oauth'

  // Requires an owner read and the exact intended Agent when selected.
  // Ensures observations only; refresh never issues access, buys or retries.
  // Invariant: one read in flight, loaded Agents retained, no stale-target apply.
  // On failure retain evidence, mark updates delayed, and back off in the poll.
  // Reuses directory/status ownership instead of a persisted onboarding engine.
  const load = useCallback(async (background = false): Promise<boolean> => {
    if (directoryReadInFlight.current || directoryPageInFlight.current) return false
    directoryReadInFlight.current = true
    const startedTarget = target
    const anchor = trackedCall.current
    const selectedCall = search.callRef ?? (anchor !== undefined && anchor.caller === caller ? anchor.callRef : undefined)
    if (!background) setLoading(true)
    try {
      let observed = requestRef.current
      let requestDelayed = false
      const locator = search.grantRef !== undefined ? { grantRef: search.grantRef } : search.userCode !== undefined ? { userCode: search.userCode } : undefined
      if (locator !== undefined) {
        const result = await readRequest({ data: locator })
        if (!mounted.current || startedTarget !== targetRef.current) return false
        if (result.kind === 'unavailable') requestDelayed = true
        else { observed = result; setOnboarding(result) }
        if (observed?.kind === 'refused' && observed.reason !== 'not_found') {
          setDirectory({ items: [], details: [] }); setTracked(undefined)
          setLiveUpdates('current'); setDirectoryError(undefined)
          return true
        }
      }
      const selected = observed?.kind === 'request' ? observed.principalRef : search.caller
      if (search.callInvalid || search.requestInvalid || hasRequest && selected === undefined) {
        setLiveUpdates(requestDelayed ? 'delayed' : 'current')
        return !requestDelayed
      }
      const current = await readDirectory({ data: { ...(selected === undefined ? {} : { principalRef: selected }), ...(selectedCall === undefined ? {} : { callRef: selectedCall }) } })
      if (!mounted.current || startedTarget !== targetRef.current) return false
      const incomplete = current.details.some(detail => detail.dataState === 'unavailable' || detail.dataState === 'partial')
      setDirectory(previous => {
        const details = current.details.map(updated => {
          const known = previous.details.find(detail => detail.agent.principalRef === updated.agent.principalRef)
          return known !== undefined && (updated.dataState === 'unavailable' || updated.dataState === 'partial')
            ? { ...updated, activity: known.activity, ...(known.liveCalls === undefined ? {} : { liveCalls: known.liveCalls }),
              ...(known.watchedCall === undefined || updated.watchedCall !== undefined ? {} : { watchedCall: known.watchedCall }) } : updated
        })
        return selected === undefined && (current.nextCursor === undefined || previous.items.length <= current.items.length) ? { ...current, details } : {
          ...previous,
          items: [...previous.items.filter(agent => selected === undefined ? !current.items.some(updated => updated.principalRef === agent.principalRef) : agent.principalRef !== selected), ...current.items],
          details: [...previous.details.filter(detail => selected === undefined ? !current.details.some(updated => updated.agent.principalRef === detail.agent.principalRef) : detail.agent.principalRef !== selected), ...details],
        }
      })
      setDirectoryError(undefined); setAccessUnconfirmed(false)
      setLiveUpdates(incomplete || requestDelayed ? 'delayed' : 'current')
      return !incomplete && !requestDelayed
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      if (mounted.current && startedTarget === targetRef.current) {
        setLiveUpdates('delayed'); setAccessUnconfirmed(true)
        if (!background) setDirectoryError('Agent progress is temporarily unavailable. Last confirmed Call records are retained.')
      }
      return false
    } finally {
      directoryReadInFlight.current = false
      if (mounted.current && !background) setLoading(false)
    }
  }, [readDirectory, readRequest, setOnboarding, target, caller, hasRequest, search.caller, search.callRef, search.grantRef, search.userCode, search.requestInvalid, search.callInvalid])

  // Pin the first unambiguous active Call. Renewal, completion and a page reload
  // must keep following this attempt rather than selecting another purchase.
  useEffect(() => {
    if (!('call' in firstUse) || search.callRef !== undefined || blocked) return
    const principalRef = firstUse.agent.principalRef
    if (trackedCall.current?.caller === principalRef && trackedCall.current.callRef === firstUse.call.callRef) return
    const anchor = { caller: principalRef, callRef: firstUse.call.callRef }
    trackedCall.current = anchor; setTracked(anchor)
    void navigate({ to: '/agent-access', search: { ...search, caller: principalRef, callRef: firstUse.call.callRef }, replace: true })
  }, [firstUse, search, navigate, blocked])

  const loadMore = useCallback(async () => {
    const cursor = directory.nextCursor
    if (cursor === undefined || loadingMore || directoryPageInFlight.current || directoryReadInFlight.current) return
    const source = directory
    directoryPageInFlight.current = true
    setLoadingMore(true)
    try {
      const next = await readDirectoryPage({ data: { cursor } })
      setDirectory((current) => current === source && current.nextCursor === cursor
        ? {
            items: [...current.items, ...next.items],
            details: [...current.details, ...next.details],
            activityCoverage: current.activityCoverage === 'recent' || next.activityCoverage === 'recent'
              ? 'recent'
              : 'complete',
            ...(next.nextCursor === undefined ? {} : { nextCursor: next.nextCursor }),
          }
        : current)
      setDirectoryPaginationIssue((current) => current?.source === source && current.cursor === cursor ? undefined : current)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setDirectoryPaginationIssue({ source, cursor })
    } finally {
      directoryPageInFlight.current = false
      setLoadingMore(false)
    }
  }, [directory, loadingMore, readDirectoryPage])

  const loadApprovals = useCallback(async (background = false) => {
    if (approvalsReadInFlight.current) return true
    approvalsReadInFlight.current = true
    if (!background) setApprovalsLoading(true)
    try {
      const current = await readApprovals()
      if (!mounted.current) return false
      setApprovals(current)
      setApprovalsError(undefined)
      return true
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      if (mounted.current) setApprovalsError('Waiting approvals are temporarily unavailable.')
      return false
    } finally {
      approvalsReadInFlight.current = false
      if (mounted.current && !background) setApprovalsLoading(false)
    }
  }, [readApprovals])

  useEffect(() => {
    let disposed = false
    let failures = 0
    let nextReadAt = Date.now() + 5_000
    const poll = async () => {
      if (disposed || document.visibilityState === 'hidden' || Date.now() < nextReadAt
        || directoryReadInFlight.current || directoryPageInFlight.current) return
      const [directorySuccess, approvalsSuccess] = await Promise.all([load(true), loadApprovals(true)])
      const success = directorySuccess && approvalsSuccess
      if (disposed) return
      failures = success ? 0 : failures + 1
      nextReadAt = Date.now() + Math.min(30_000, 5_000 * 2 ** failures)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') { nextReadAt = 0; void poll() }
    }
    const timer = setInterval(() => { void poll() }, 5_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible) }
  }, [load, loadApprovals, target])

  useEffect(() => { if (hasRequest || search.callRef !== undefined) void load(true) }, [target, load, hasRequest, search.callRef])

  useEffect(() => {
    void loadApprovals()
  }, [loadApprovals])


  useEffect(() => {
    const hash = location.hash.replace(/^#/, '')
    if (hash === 'fund') {
      void navigate({ to: '/owner/credit', hash: 'fund', replace: true })
    }
  }, [location.hash, navigate])

  const finishLifecycle = useCallback(async (
    result: AgentLifecycleResult | OwnerConnectionLifecycleResult,
    command: LifecycleCommand,
  ) => {
    if (result.kind === 'completed' || result.kind === 'replayed') {
      await load()
      if ('providerCleanupPending' in result && result.providerCleanupPending) {
        setLifecycleIssue({
          title: 'Provider cleanup incomplete',
          message: 'Access is blocked in Agentic Economy, but the external provider still needs cleanup.',
          correlationRef: result.correlationRef,
        })
      } else setLifecycleIssue(undefined)
      return
    }
    if (result.kind === 'partial') {
      await load()
      setLifecycleIssue({
        title: result.code === 'work_remaining' ? 'Disconnection still in progress' : 'Provider cleanup incomplete',
        message: result.code === 'work_remaining'
          ? 'One bounded batch is complete. Continue to revoke the remaining credentials for this agent.'
          : 'Access is blocked in Agentic Economy, but the external provider still needs another cleanup attempt.',
        correlationRef: result.correlationRef,
        retry: command,
      })
      return
    }
    if (result.kind === 'conflict') {
      setLifecycleIssue({
        title: 'Agent access changed elsewhere',
        message: 'The saved agent state no longer matches this request. Refresh the directory before deciding what to do next.',
        correlationRef: result.correlationRef,
      })
      return
    }
    if (result.kind === 'refused') {
      setLifecycleIssue({
        title: 'Agent access change refused',
        message: result.code === 'authentication_required'
          ? 'Your owner session no longer authorizes this change. Sign in again before retrying.'
          : 'The access service is temporarily unavailable. The requested change was not reported as complete.',
        correlationRef: result.correlationRef,
        ...(result.code === 'source_unavailable' ? { retry: command } : {}),
      })
    }
  }, [load])

  const runLifecycle = useCallback(async (command: LifecycleCommand) => {
    setLifecyclePending(command)
    try {
      const result = command.kind === 'connection'
        ? await disconnectConnection({ data: { connectionRef: command.ref, expectedRevision: command.expectedRevision } })
        : await disconnectAgent({ data: { principalRef: command.ref } })
      await finishLifecycle(result, command)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setLifecycleIssue({
        title: 'Agent disconnection unavailable',
        message: 'The access service did not confirm the change. Retry the same request before taking another action.',
        retry: command,
      })
    } finally {
      setLifecyclePending(undefined)
    }
  }, [disconnectAgent, disconnectConnection, finishLifecycle])


  const disconnect = useCallback((principalRef: string) => {
    return runLifecycle({ kind: 'agent', ref: principalRef })
  }, [runLifecycle])

  const disconnectOneConnection = useCallback((connectionRef: string, expectedRevision: number) => {
    return runLifecycle({ kind: 'connection', ref: connectionRef, expectedRevision })
  }, [runLifecycle])

  const rename = useCallback(async (principalRef: string, expectedRevision: number, displayName: string): Promise<boolean> => {
    try {
      const result = await renameAgent({ data: { principalRef, expectedRevision, displayName } })
      await load()
      return result.kind === 'completed' || result.kind === 'replayed'
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      await load().catch(() => undefined)
      return false
    }
  }, [load, renameAgent])

  const updateSpendingLimitsHandler = useCallback(async (params: {
    principalRef: string
    expectedGeneration: number
    maximumSpendPerCall: ExactAmount
    maximumDailySpend: ExactAmount
    maximumMonthlySpend: ExactAmount
  }): Promise<AgentSpendingLimitsResult> => {
    const material = JSON.stringify(params)
    if (spendingCommand.current?.material !== material) {
      spendingCommand.current = { material, idempotencyKey: createRuntimeId('limit') }
    }
    const idempotencyKey = spendingCommand.current.idempotencyKey
    try {
      // The key is allocated outside the reverification callback: Clerk retries
      // this same command rather than issuing another monetary policy update.
      const result = await verifiedSpendingUpdate({
        data: {
          ...params,
          idempotencyKey,
        },
      })
      if (result == null) return { kind: 'refused', code: 'mfa_reverification_required', correlationRef: idempotencyKey }
      if (result.kind === 'completed' || result.kind === 'replayed') {
        spendingCommand.current = undefined
        await load()
      }
      return result
    } catch (cause) {
      if (isReverificationCancelledError(cause)) {
        return { kind: 'refused', code: 'mfa_reverification_required', correlationRef: idempotencyKey }
      }
      captureClientExceptionOnClient(cause)
      return { kind: 'refused', code: 'source_unavailable', correlationRef: 'error' }
    }
  }, [load, verifiedSpendingUpdate])

  const readSpendingLimitsHandler = useCallback(async (principalRef: string): Promise<AgentSpendingLimitsReadResult> => {
    try {
      return await readSpendingLimits({ data: { principalRef } })
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      return { kind: 'refused', code: 'source_unavailable' }
    }
  }, [readSpendingLimits])

  const decidePendingApproval = useCallback(async (callRef: string, toolRef: string, decision: 'approve' | 'deny') => {
    if (approvalDecision !== undefined) return
    setApprovalDecision({ callRef, decision })
    setApprovalsError(undefined)
    setApprovalStatus(undefined)
    try {
      const result = await verifiedApproval({ data: { callRef, decision } })
      if (result == null) return
      if (result.kind === 'refused') {
        setApprovalsError(operationApprovalErrorCopy(result.code))
        return
      }
      setApprovalStatus(result.kind === 'replayed'
        ? `${toolRef} already had a recorded decision.`
        : result.kind === 'approved'
          ? `${toolRef} approved once.`
          : `${toolRef} declined.`)
      await loadApprovals()
    } catch (cause) {
      if (isReverificationCancelledError(cause)) return
      captureClientExceptionOnClient(cause)
      setApprovalsError('Your decision could not be confirmed. Refresh the waiting approvals before deciding again.')
    } finally {
      setApprovalDecision(undefined)
    }
  }, [approvalDecision, verifiedApproval, loadApprovals])

  const currentPaginationIssue = directoryPaginationIssue?.source === directory
    && directoryPaginationIssue.cursor === directory.nextCursor

  const directoryAlertTitle = directory.items.length === 0
    ? 'Agent access unavailable'
    : 'Agents could not be refreshed'

  const getAgentHref = useCallback((principalId: string) => {
    return `/agent-access?caller=${encodeURIComponent(principalId)}${search.resumeTool === undefined ? '' : `&resumeTool=${encodeURIComponent(search.resumeTool)}`}`
  }, [search.resumeTool])

  const clearSelectedPrincipal = useCallback(() => {
    void navigate({
      to: '/agent-access',
      search: {
        ...(search.resumeTool === undefined ? {} : { resumeTool: search.resumeTool }),
        ...(search.setup === undefined ? {} : { setup: search.setup }),
      },
      replace: true,
    })
  }, [navigate, search.resumeTool, search.setup])

  const paginationButtonLabel = loadingMore
    ? 'Loading more Agents…'
    : currentPaginationIssue
      ? 'Try loading more Agents again'
      : 'Load more Agents'

  const onSetupStep = useCallback((step: 'closed' | 'choose' | 'oauth') => {
    const { setup: _setup, ...continuation } = search
    void navigate({
      to: '/agent-access',
      search: {
        ...continuation,
        ...(search.resumeTool === undefined ? {} : { resumeTool: search.resumeTool }),
        ...(step === 'closed' ? {} : { setup: step }),
      },
      replace: step === 'closed',
    })
  }, [navigate, search])

  const addAnotherToggleLabel = showSetup ? 'Hide setup' : 'Connect an Agent'

  const directoryRetryLabel = loading ? 'Trying again…' : 'Try again'

  const lifecycleRetryLabel = lifecyclePending === undefined ? 'Retry cleanup' : 'Retrying cleanup…'

  const onLifecycleRetry = useCallback(() => {
    const retry = lifecycleIssue?.retry
    if (retry !== undefined) void runLifecycle(retry)
  }, [lifecycleIssue?.retry, runLifecycle])


  const agentHistoryPrincipalRef = useMemo(() => {
    if (caller === undefined) return undefined
    return directory.details.some(({ agent }) => agent.principalRef === caller)
      ? caller
      : undefined
  }, [directory.details, caller])

  return {
    canonicalBaseUrl,
    search,
    directory,
    loading,
    loadingMore,
    directoryError,
    directoryAlertTitle,
    onDirectoryRetry: () => void load(),
    directoryRetryLabel,
    lifecycleIssue,
    lifecyclePending,
    onLifecycleRetry,
    lifecycleRetryLabel,
    load: async () => { await load() },
    loadMore: () => void loadMore(),
    firstUse,
    onboarding,
    liveUpdates,
    getAgentHref,
    clearSelectedPrincipal,
    onDisconnectAgent: disconnect,
    onDisconnectConnection: disconnectOneConnection,
    onRenameAgent: rename,
    onUpdateSpendingLimits: updateSpendingLimitsHandler,
    onReadSpendingLimits: readSpendingLimitsHandler,
    onConnectNewAgent: () => onSetupStep('choose'),
    onSetupStep,
    accessUnavailable: directoryError !== undefined && directory.items.length === 0,
    approvals,
    approvalsLoading,
    approvalsError,
    approvalDecision,
    approvalStatus,
    onRetryApprovals: () => void loadApprovals(),
    onDecideApproval: (callRef, toolRef, decision) => {
      void decidePendingApproval(callRef, toolRef, decision)
    },
    currentPaginationIssue: Boolean(currentPaginationIssue),
    paginationButtonLabel,
    showSetup,
    onToggleShowSetup: () => onSetupStep(showSetup ? 'closed' : 'oauth'),
    addAnotherToggleLabel,
    agentHistoryPrincipalRef,
  }
}
