import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Outlet, createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { KeyRound } from 'lucide-react'

import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'
import { AeAgentSecurityHistory } from '@/components/ae/agent-access/AeAgentSecurityHistory'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readAgentDirectoryPageServer, readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import {
  disconnectAgentServer,
  renameAgentServer,
  revokeAgentCredentialServer,
  revokeOwnerConnectionServer,
} from '@/modules/agent-access/agent-access.functions'
import type { AgentLifecycleResult } from '@/modules/agent-access/agent-access'
import type { OwnerConnectionLifecycleResult } from '@/modules/agent-access/public'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import {
  decideCallApprovalServer,
  listPendingCallApprovalsServer,
  type PendingCallApproval,
} from '@/modules/capability-execution/call-approval.functions'

export type AgentAccessSearch = Readonly<{ caller?: string }>

type LifecycleCommand =
  | Readonly<{ kind: 'credential' | 'agent'; ref: string }>
  | Readonly<{ kind: 'connection'; ref: string; expectedRevision: number }>

type LifecycleIssue = Readonly<{
  title: string
  message: string
  correlationRef?: string
  retry?: LifecycleCommand
}>

const canonicalPrincipalIdPattern = /^prn_[0-9a-f]{32}$/u

export function validateAgentAccessSearch(search: Record<string, unknown>): AgentAccessSearch {
  if (typeof search.caller !== 'string') return {}
  const caller = search.caller.trim()
  return canonicalPrincipalIdPattern.test(caller) ? { caller } : {}
}

export const Route = createFileRoute('/_operator/agent-access')({
  staticData: {
    nav: {
      label: 'Agents',
      operator: {
        roles: ['owner'],
        group: 'Buy',
        groupOrder: 0,
        order: 1,
        icon: KeyRound,
        tier: 'core',
        mobilePrimary: true,
        mobileOrder: 20,
      },
    },
  },
  ...operatorRouteOptions,
  validateSearch: validateAgentAccessSearch,
  loader: async () => {
    const canonicalBaseUrl = await readCanonicalBaseUrlServer()
    const directory = await readAgentDirectoryServer()
    return { canonicalBaseUrl, directory }
  },
  head: () => ({ meta: [
    { title: 'Agents | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: AgentAccessRoute,
})

function AgentAccessRoute() {
  const location = useLocation()
  return location.pathname !== '/agent-access' ? <Outlet /> : <AgentAccessHome />
}

function AgentAccessHome() {
  const { canonicalBaseUrl, directory: initialDirectory } = Route.useLoaderData()
  const search = Route.useSearch()
  const location = useLocation()
  const navigate = useNavigate()
  const readDirectory = useServerFn(readAgentDirectoryServer)
  const readDirectoryPage = useServerFn(readAgentDirectoryPageServer)
  const revokeCredential = useServerFn(revokeAgentCredentialServer)
  const disconnectAgent = useServerFn(disconnectAgentServer)
  const disconnectConnection = useServerFn(revokeOwnerConnectionServer)
  const renameAgent = useServerFn(renameAgentServer)
  const [directory, setDirectory] = useState<AgentDirectoryProjection>(initialDirectory)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [directoryError, setDirectoryError] = useState<string>()
  const [lifecycleIssue, setLifecycleIssue] = useState<LifecycleIssue>()
  const [lifecyclePending, setLifecyclePending] = useState<LifecycleCommand>()
  const readApprovals = useServerFn(listPendingCallApprovalsServer)
  const decideApproval = useServerFn(decideCallApprovalServer)
  const [approvals, setApprovals] = useState<readonly PendingCallApproval[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(true)
  const [approvalsError, setApprovalsError] = useState<string>()
  const [approvalDecision, setApprovalDecision] = useState<Readonly<{ callRef: string; decision: 'approve' | 'deny' }>>()
  const [approvalStatus, setApprovalStatus] = useState<string>()
  const [showSetup, setShowSetup] = useState(false)

  const load = useCallback(async () => {
      setLoading(true)
    try {
      setDirectory(await readDirectory())
      setDirectoryError(undefined)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setDirectoryError('Agent access and balance are temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [readDirectory])
  const loadMore = useCallback(async () => {
    const cursor = directory.nextCursor
    if (cursor === undefined || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await readDirectoryPage({ data: { cursor } })
      setDirectory((current) => ({
        items: [...current.items, ...next.items],
        details: [...current.details, ...next.details],
        ...(next.accountBalance === undefined && current.accountBalance === undefined
          ? {}
          : { accountBalance: next.accountBalance ?? current.accountBalance }),
        activityCoverage: current.activityCoverage === 'recent' || next.activityCoverage === 'recent'
          ? 'recent'
          : 'complete',
        ...(next.nextCursor === undefined ? {} : { nextCursor: next.nextCursor }),
      }))
      setDirectoryError(undefined)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setDirectoryError('More agents could not be loaded. The agents already shown are still current.')
    } finally {
      setLoadingMore(false)
    }
  }, [directory.nextCursor, loadingMore, readDirectoryPage])
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

  async function finishLifecycle(result: AgentLifecycleResult | OwnerConnectionLifecycleResult, command: LifecycleCommand) {
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
  }

  async function runLifecycle(command: LifecycleCommand) {
    setLifecyclePending(command)
    try {
      const result = command.kind === 'credential'
        ? await revokeCredential({ data: { credentialRef: command.ref } })
        : command.kind === 'connection'
          ? await disconnectConnection({ data: { connectionRef: command.ref, expectedRevision: command.expectedRevision } })
          : await disconnectAgent({ data: { principalRef: command.ref } })
      await finishLifecycle(result, command)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setLifecycleIssue({
        title: command.kind === 'credential' ? 'Credential revocation unavailable' : 'Agent disconnection unavailable',
        message: 'The access service did not confirm the change. Retry the same request before taking another action.',
        retry: command,
      })
    } finally {
      setLifecyclePending(undefined)
    }
  }

  function revoke(credentialRef: string) {
    return runLifecycle({ kind: 'credential', ref: credentialRef })
  }

  function disconnect(principalRef: string) {
    return runLifecycle({ kind: 'agent', ref: principalRef })
  }

  function disconnectOneConnection(connectionRef: string, expectedRevision: number) {
    return runLifecycle({ kind: 'connection', ref: connectionRef, expectedRevision })
  }

  async function rename(principalRef: string, expectedRevision: number, displayName: string): Promise<boolean> {
    try {
      const result = await renameAgent({ data: { principalRef, expectedRevision, displayName } })
      await load()
      return result.kind === 'completed' || result.kind === 'replayed'
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      await load().catch(() => undefined)
      return false
    }
  }

  async function decidePendingApproval(callRef: string, toolRef: string, decision: 'approve' | 'deny') {
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
  }
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Agents"
      description="Connect independent agents, review their access, and manage credential history."
      currentPath="/agent-access"
    >
      {directoryError === undefined ? null : (
        <Alert variant="destructive">
          <AlertTitle>Agent access unavailable</AlertTitle>
          <AlertDescription>
            <p>{directoryError}</p>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>{loading ? 'Trying again…' : 'Try again'}</Button>
          </AlertDescription>
        </Alert>
      )}
      {lifecycleIssue === undefined ? null : (
        <Alert variant="destructive">
          <AlertTitle>{lifecycleIssue.title}</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>{lifecycleIssue.message}</p>
            {lifecycleIssue.correlationRef === undefined
              ? null
              : <AeCopyReference label="support reference" value={lifecycleIssue.correlationRef} />}
            {lifecycleIssue.retry === undefined ? null : (
              <Button
                type="button"
                variant="secondary"
                className="w-fit"
                disabled={lifecyclePending !== undefined}
                onClick={() => {
                  const retry = lifecycleIssue.retry
                  if (retry !== undefined) void runLifecycle(retry)
                }}
              >
                {lifecyclePending === undefined ? 'Retry cleanup' : 'Retrying cleanup…'}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {directory.items.length === 0 ? (
        <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} />
      ) : (
        <AeSection title="Connections" description="Your agents stay connected until expiry or until you disconnect them.">
          <Button type="button" variant="secondary" className="w-fit min-h-touch" onClick={() => setShowSetup((value) => !value)}>
            {showSetup ? 'Hide setup' : 'Add another agent'}
          </Button>
          {showSetup ? <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} /> : null}
        </AeSection>
      )}
      {directory.items.length === 0 && search.caller === undefined ? null : <AeAgentOperatorConsole
        directory={directory}
        loading={loading}
        {...(search.caller === undefined ? {} : { selectedPrincipalId: search.caller })}
        getAgentHref={(principalId) => `/agent-access?caller=${encodeURIComponent(principalId)}`}
        onClearSelectedPrincipal={() => {
          void navigate({ to: '/agent-access', search: {}, replace: true })
        }}
        onRevokeCredential={(credentialRef) => revoke(credentialRef)}
        onDisconnectAgent={(principalRef) => disconnect(principalRef)}
        onDisconnectConnection={(connectionRef, expectedRevision) => disconnectOneConnection(connectionRef, expectedRevision)}
        onRenameAgent={(principalRef, expectedRevision, displayName) => rename(principalRef, expectedRevision, displayName)}
        {...(search.caller !== undefined
          && directory.details.some(({ agent }) => agent.principalRef === search.caller)
          ? { agentHistory: <AeAgentSecurityHistory key={search.caller} principalRef={search.caller} /> }
          : {})}
        {...(lifecyclePending === undefined ? {} : { lifecyclePending })}
        accessUnavailable={directoryError !== undefined}
        approvals={approvals}
        approvalsLoading={approvalsLoading}
        {...(approvalsError === undefined ? {} : { approvalsError })}
        {...(approvalDecision === undefined ? {} : { approvalDecision })}
        {...(approvalStatus === undefined ? {} : { approvalStatus })}
        onRetryApprovals={() => void loadApprovals()}
        onDecideApproval={(callRef, toolRef, decision) => {
          void decidePendingApproval(callRef, toolRef, decision)
        }}
      />}
      {directory.nextCursor === undefined ? null : (
        <Button
          type="button"
          variant="secondary"
          className="mt-4 w-fit"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Loading more agents…' : 'Load more agents'}
        </Button>
      )}
    </AeOperatorPage>
  )
}

function operationApprovalErrorCopy(code: 'authentication_required' | 'invocation_not_found' | 'authority_not_pending' | 'grant_not_current' | 'invocation_invalid'): string {
  if (code === 'authentication_required') return 'Sign in as the access owner, then try again.'
  if (code === 'grant_not_current') return 'This agent grant changed. Review current access before trying again.'
  if (code === 'invocation_not_found') return 'This waiting operation is no longer available. Refresh the list.'
  if (code === 'authority_not_pending') return 'This operation no longer needs a decision. Refresh the list.'
  return 'This operation could not be verified. Refresh the list before deciding.'
}
