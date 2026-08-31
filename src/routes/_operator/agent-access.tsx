import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Link, Outlet, createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import { disconnectAgentServer, revokeAgentCredentialServer } from '@/modules/agent-access/agent-access.functions'
import type { AgentLifecycleResult } from '@/modules/agent-access/agent-access'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import {
  decideOperationApprovalServer,
  listPendingOperationApprovalsServer,
  type PendingOperationApproval,
} from '@/modules/capability-execution/operation-approval.functions'

export type AgentAccessSearch = Readonly<{ caller?: string }>

type LifecycleCommand = Readonly<{ kind: 'credential' | 'agent'; ref: string }>

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
  ...operatorRouteOptions,
  validateSearch: validateAgentAccessSearch,
  loader: async () => {
    const canonicalBaseUrl = await readCanonicalBaseUrlServer()
    const directory = isLocalE2EAuthBypassEnabled()
      ? emptyAgentDirectory
      : await readAgentDirectoryServer()
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
  const localE2E = isLocalE2EAuthBypassEnabled()
  const revokeCredential = useServerFn(revokeAgentCredentialServer)
  const disconnectAgent = useServerFn(disconnectAgentServer)
  const [directory, setDirectory] = useState<AgentDirectoryProjection>(initialDirectory)
  const [loading, setLoading] = useState(false)
  const [directoryError, setDirectoryError] = useState<string>()
  const [lifecycleIssue, setLifecycleIssue] = useState<LifecycleIssue>()
  const [lifecyclePending, setLifecyclePending] = useState<LifecycleCommand>()
  const readApprovals = useServerFn(listPendingOperationApprovalsServer)
  const decideApproval = useServerFn(decideOperationApprovalServer)
  const [approvals, setApprovals] = useState<readonly PendingOperationApproval[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(true)
  const [approvalsError, setApprovalsError] = useState<string>()
  const [approvalDecision, setApprovalDecision] = useState<Readonly<{ invocationRef: string; decision: 'approve' | 'deny' }>>()
  const [approvalStatus, setApprovalStatus] = useState<string>()

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
    if (localE2E) {
      setDirectory(emptyAgentDirectory)
      setDirectoryError(undefined)
      setLoading(false)
    }
  }, [localE2E])

  useEffect(() => {
    if (localE2E) {
      setApprovals([])
      setApprovalsError(undefined)
      setApprovalsLoading(false)
      return
    }
    void loadApprovals()
  }, [loadApprovals, localE2E])

  useEffect(() => {
    const hash = location.hash.replace(/^#/, '')
    if (hash === 'fund') {
      void navigate({ to: '/owner/credit', hash: 'fund', replace: true })
    }
  }, [location.hash, navigate])

  async function finishLifecycle(result: AgentLifecycleResult, command: LifecycleCommand) {
    if (result.kind === 'completed' || result.kind === 'replayed') {
      setLifecycleIssue(undefined)
      await load()
      return
    }
    if (result.kind === 'partial') {
      await load()
      setLifecycleIssue({
        title: 'Provider cleanup incomplete',
        message: 'Access is blocked in Agentic Economy, but the external provider still needs another cleanup attempt.',
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

  async function decidePendingApproval(invocationRef: string, operationRef: string, decision: 'approve' | 'deny') {
    if (localE2E || approvalDecision !== undefined) return
    setApprovalDecision({ invocationRef, decision })
    setApprovalsError(undefined)
    setApprovalStatus(undefined)
    try {
      const result = await decideApproval({ data: { invocationRef, decision } })
      if (result.kind === 'refused') {
        setApprovalsError(operationApprovalErrorCopy(result.code))
        return
      }
      setApprovalStatus(result.kind === 'replayed'
        ? `${operationRef} already had a recorded decision.`
        : result.kind === 'approved'
          ? `${operationRef} approved once.`
          : `${operationRef} declined.`)
      await loadApprovals()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setApprovalsError('Your decision could not be confirmed. Refresh the waiting approvals before deciding again.')
    } finally {
      setApprovalDecision(undefined)
    }
  }
  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Agents"
      description="Connect independent agents, review their access, and manage credential history."
      currentPath="/agent-access"
    >
      {localE2E ? (
        <div className="grid gap-3">
          <Alert>
            <AlertTitle>Local preview — no agent is connected</AlertTitle>
            <AlertDescription>
              <p>This browser journey does not sign in, create access, or authorize work. Browse the public demo to explore the customer experience.</p>
              <Button asChild variant="secondary" className="mt-2 min-h-touch"><Link to="/">Browse public demo</Link></Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
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
      <AeAgentOperatorConsole
        directory={directory}
        loading={loading}
        {...(search.caller === undefined ? {} : { selectedPrincipalId: search.caller })}
        getAgentHref={(principalId) => `/agent-access?caller=${encodeURIComponent(principalId)}`}
        onClearSelectedPrincipal={() => {
          void navigate({ to: '/agent-access', search: {}, replace: true })
        }}
        onRevokeCredential={(credentialRef) => revoke(credentialRef)}
        onDisconnectAgent={(principalRef) => disconnect(principalRef)}
        {...(lifecyclePending === undefined ? {} : { lifecyclePending })}
        accessUnavailable={directoryError !== undefined}
        approvals={approvals}
        approvalsLoading={approvalsLoading}
        {...(approvalsError === undefined ? {} : { approvalsError })}
        {...(approvalDecision === undefined ? {} : { approvalDecision })}
        {...(approvalStatus === undefined ? {} : { approvalStatus })}
        onRetryApprovals={() => void loadApprovals()}
        onDecideApproval={(invocationRef, operationRef, decision) => {
          void decidePendingApproval(invocationRef, operationRef, decision)
        }}
      />
      <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} />
    </AeOperatorShell>
  )
}

const emptyAgentDirectory: AgentDirectoryProjection = Object.freeze({
  items: Object.freeze([]),
  details: Object.freeze([]),
})

function operationApprovalErrorCopy(code: 'authentication_required' | 'invocation_not_found' | 'authority_not_pending' | 'grant_not_current' | 'invocation_invalid'): string {
  if (code === 'authentication_required') return 'Sign in as the access owner, then try again.'
  if (code === 'grant_not_current') return 'This agent grant changed. Review current access before trying again.'
  if (code === 'invocation_not_found') return 'This waiting operation is no longer available. Refresh the list.'
  if (code === 'authority_not_pending') return 'This operation no longer needs a decision. Refresh the list.'
  return 'This operation could not be verified. Refresh the list before deciding.'
}
