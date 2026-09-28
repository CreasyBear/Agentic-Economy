import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

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
  if (code === 'grant_not_current') return 'This agent grant changed. Review current access before trying again.'
  if (code === 'invocation_not_found') return 'This waiting operation is no longer available. Refresh the list.'
  if (code === 'authority_not_pending') return 'This operation no longer needs a decision. Refresh the list.'
  return 'This operation could not be verified. Refresh the list before deciding.'
}

export function useAeAgentAccessHome({
  canonicalBaseUrl,
  initialDirectory,
  search,
}: AeAgentAccessHomeProps): AeAgentAccessHomeView {
  const location = useLocation()
  const navigate = useNavigate()
  const readDirectory = useServerFn(readAgentDirectoryServer)
  const readDirectoryPage = useServerFn(readAgentDirectoryPageServer)
  const disconnectAgent = useServerFn(disconnectAgentServer)
  const disconnectConnection = useServerFn(revokeOwnerConnectionServer)
  const renameAgent = useServerFn(renameAgentServer)
  const updateSpendingLimits = useServerFn(updateAgentSpendingLimitsServer)
  const readSpendingLimits = useServerFn(readAgentSpendingLimitsServer)
  const readApprovals = useServerFn(listPendingCallApprovalsServer)
  const decideApproval = useServerFn(decideCallApprovalServer)

  const [directory, setDirectory] = useState<AgentDirectoryProjection>(initialDirectory)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [directoryError, setDirectoryError] = useState<string>()
  const [directoryPaginationIssue, setDirectoryPaginationIssue] = useState<DirectoryPaginationIssue>()
  const [lifecycleIssue, setLifecycleIssue] = useState<LifecycleIssue>()
  const [lifecyclePending, setLifecyclePending] = useState<LifecycleCommand>()
  const [approvals, setApprovals] = useState<readonly PendingCallApproval[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(true)
  const [approvalsError, setApprovalsError] = useState<string>()
  const [approvalDecision, setApprovalDecision] = useState<ApprovalDecision>()
  const [approvalStatus, setApprovalStatus] = useState<string>()
  const [showSetup, setShowSetup] = useState(false)

  const hasConnectedAgent = directory.items.some(({ status }) => status === 'connected')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDirectory(await readDirectory())
      setDirectoryError(undefined)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setDirectoryError('The Agent directory is temporarily unavailable. Known Balance information is unaffected.')
    } finally {
      setLoading(false)
    }
  }, [readDirectory])

  const loadMore = useCallback(async () => {
    const cursor = directory.nextCursor
    if (cursor === undefined || loadingMore) return
    const source = directory
    setLoadingMore(true)
    try {
      const next = await readDirectoryPage({ data: { cursor } })
      setDirectory((current) => current === source && current.nextCursor === cursor
        ? {
            items: [...current.items, ...next.items],
            details: [...current.details, ...next.details],
            ...(next.accountBalance === undefined && current.accountBalance === undefined
              ? {}
              : { accountBalance: next.accountBalance ?? current.accountBalance }),
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
      setLoadingMore(false)
    }
  }, [directory, loadingMore, readDirectoryPage])

  const loadApprovals = useCallback(async () => {
    setApprovalsLoading(true)
    try {
      setApprovals(await readApprovals())
      setApprovalsError(undefined)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setApprovalsError('Waiting approvals are temporarily unavailable.')
    } finally {
      setApprovalsLoading(false)
    }
  }, [readApprovals])

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
    const idempotencyKey = createRuntimeId('limit')
    try {
      const result = await updateSpendingLimits({
        data: {
          ...params,
          idempotencyKey,
        },
      })
      if (result.kind === 'completed' || result.kind === 'replayed') {
        await load()
      }
      return result
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      return { kind: 'refused', code: 'source_unavailable', correlationRef: 'error' }
    }
  }, [load, updateSpendingLimits])

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
      const result = await decideApproval({ data: { callRef, decision } })
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
      captureClientExceptionOnClient(cause)
      setApprovalsError('Your decision could not be confirmed. Refresh the waiting approvals before deciding again.')
    } finally {
      setApprovalDecision(undefined)
    }
  }, [approvalDecision, decideApproval, loadApprovals])

  const currentPaginationIssue = directoryPaginationIssue?.source === directory
    && directoryPaginationIssue.cursor === directory.nextCursor

  const directoryAlertTitle = directory.items.length === 0
    ? 'Agent access unavailable'
    : 'Agents could not be refreshed'

  const resumeSectionTitle = hasConnectedAgent
    ? 'Continue with the selected Tool'
    : 'Finish the Agent connection'

  const resumeSectionDescription = hasConnectedAgent
    ? 'Return to the Tool, then continue in your agent client. Browser access does not create a Call.'
    : 'The selected Tool remains saved while you finish connecting an Agent.'

  const getAgentHref = useCallback((principalId: string) => {
    return `/agent-access?caller=${encodeURIComponent(principalId)}${search.resumeTool === undefined ? '' : `&resumeTool=${encodeURIComponent(search.resumeTool)}`}`
  }, [search.resumeTool])

  const clearSelectedPrincipal = useCallback(() => {
    void navigate({
      to: '/agent-access',
      search: search.resumeTool === undefined ? {} : { resumeTool: search.resumeTool },
      replace: true,
    })
  }, [navigate, search.resumeTool])

  const paginationButtonLabel = loadingMore
    ? 'Loading more Agents…'
    : currentPaginationIssue
      ? 'Try loading more Agents again'
      : 'Load more Agents'

  const addAnotherToggleLabel = showSetup ? 'Hide setup' : 'Connect an Agent'

  const directoryRetryLabel = loading ? 'Trying again…' : 'Try again'

  const lifecycleRetryLabel = lifecyclePending === undefined ? 'Retry cleanup' : 'Retrying cleanup…'

  const onLifecycleRetry = useCallback(() => {
    const retry = lifecycleIssue?.retry
    if (retry !== undefined) void runLifecycle(retry)
  }, [lifecycleIssue?.retry, runLifecycle])


  const agentHistoryPrincipalRef = useMemo(() => {
    if (search.caller === undefined) return undefined
    return directory.details.some(({ agent }) => agent.principalRef === search.caller)
      ? search.caller
      : undefined
  }, [directory.details, search.caller])

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
    load,
    loadMore: () => void loadMore(),
    hasConnectedAgent,
    resumeSectionTitle,
    resumeSectionDescription,
    getAgentHref,
    clearSelectedPrincipal,
    onDisconnectAgent: disconnect,
    onDisconnectConnection: disconnectOneConnection,
    onRenameAgent: rename,
    onUpdateSpendingLimits: updateSpendingLimitsHandler,
    onReadSpendingLimits: readSpendingLimitsHandler,
    onConnectNewAgent: () => setShowSetup(true),
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
    onToggleShowSetup: () => setShowSetup((value) => !value),
    addAnotherToggleLabel,
    agentHistoryPrincipalRef,
  }
}
