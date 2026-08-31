import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Link, Outlet, createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
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
  const [error, setError] = useState<string>()
  const [lifecyclePending, setLifecyclePending] = useState<Readonly<{ kind: 'credential' | 'agent'; ref: string }>>()
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
      setError(undefined)
    } catch {
      setError('Agent access and balance are temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [readDirectory])
  const loadApprovals = useCallback(async () => {
    setApprovalsLoading(true)
    try {
      setApprovals(await readApprovals())
      setApprovalsError(undefined)
    } catch {
      setApprovalsError('Waiting approvals are temporarily unavailable.')
    } finally {
      setApprovalsLoading(false)
    }
  }, [readApprovals])

  useEffect(() => {
    if (localE2E) {
      setDirectory(emptyAgentDirectory)
      setError(undefined)
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

  async function finishLifecycle(result: AgentLifecycleResult) {
    if (result.kind === 'completed' || result.kind === 'replayed') {
      setError(undefined)
      await load()
      return
    }
    if (result.kind === 'partial') {
      await load()
      setError(`Access is blocked in Agentic Economy, but provider cleanup needs another attempt. Reference: ${result.correlationRef}`)
      return
    }
    setError(result.kind === 'conflict'
      ? `This lifecycle change conflicts with the current agent state. Reference: ${result.correlationRef}`
      : `This lifecycle change was refused. Reference: ${result.correlationRef}`)
  }

  async function revoke(credentialRef: string) {
    setLifecyclePending({ kind: 'credential', ref: credentialRef })
    try {
      await finishLifecycle(await revokeCredential({ data: { credentialRef } }))
    } catch {
      setError('Credential revocation is temporarily unavailable. Try again.')
    } finally {
      setLifecyclePending(undefined)
    }
  }

  async function disconnect(principalRef: string) {
    setLifecyclePending({ kind: 'agent', ref: principalRef })
    try {
      await finishLifecycle(await disconnectAgent({ data: { principalRef } }))
    } catch {
      setError('Agent disconnection is temporarily unavailable. Try again.')
    } finally {
      setLifecyclePending(undefined)
    }
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
    } catch {
      setApprovalsError('Your decision could not be saved. Try the action again.')
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
      {error === undefined ? null : (
        <Alert variant="destructive">
          <AlertTitle>Agent access unavailable</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>{loading ? 'Trying again…' : 'Try again'}</Button>
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
        accessUnavailable={error !== undefined}
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
