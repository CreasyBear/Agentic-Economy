import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAgentAccessConsoleServer } from '@/lib/server/agent-access-console.functions'
import { revokeAgentAccessKeyServer } from '@/modules/agent-access/agent-access.functions'
import type { AgentAccessConsoleReadback } from '@/modules/agent-access/agent-access-console'
import {
  decideOperationApprovalServer,
  listPendingOperationApprovalsServer,
  type PendingOperationApproval,
} from '@/modules/capability-execution/operation-approval.functions'
import type { CreditTopupPort } from '@/components/ae/console/AeCreditTopUpPanel'
import { beginCreditTopupServer, readCreditPaymentServer } from '@/modules/money/server'

export const Route = createFileRoute('/_operator/agent-access')({
  ...operatorRouteOptions,
  loader: () => readCanonicalBaseUrlServer(),
  head: () => ({ meta: [
    { title: 'Agent access | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: AgentAccessRoute,
})

function AgentAccessRoute() {
  const location = useLocation()
  return location.pathname !== '/agent-access' ? <Outlet /> : <AgentAccessHome />
}

function AgentAccessHome() {
  const canonicalBaseUrl = Route.useLoaderData()
  const readConsole = useServerFn(readAgentAccessConsoleServer)
  const localE2E = isLocalE2EAuthBypassEnabled()
  const revokeKey = useServerFn(revokeAgentAccessKeyServer)
  const beginCreditTopup = useServerFn(beginCreditTopupServer)
  const readCreditPayment = useServerFn(readCreditPaymentServer)
  const creditTopupPort = useMemo<CreditTopupPort>(() => ({
    begin: (data) => beginCreditTopup({ data }),
    read: (data) => readCreditPayment({ data }),
  }), [beginCreditTopup, readCreditPayment])
  const [items, setItems] = useState<AgentAccessConsoleReadback>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [revoking, setRevoking] = useState<string>()
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
      setItems(await readConsole())
      setError(undefined)
    } catch {
      setError('Agent access and balance are temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [readConsole])
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
      setItems([])
      setError(undefined)
      setLoading(false)
      return
    }
    void load()
  }, [load, localE2E])

  useEffect(() => {
    if (localE2E) {
      setApprovals([])
      setApprovalsError(undefined)
      setApprovalsLoading(false)
      return
    }
    void loadApprovals()
  }, [loadApprovals, localE2E])

  async function revoke(keyId: string) {
    setRevoking(keyId)
    try {
      const result = await revokeKey({ data: { keyId } })
      if (result.kind === 'revoked' || result.kind === 'already_revoked') await load()
      else if (result.kind === 'error') setError(result.retryable ? 'Access could not be revoked. Try again.' : 'This access is no longer available to this account.')
    } finally {
      setRevoking(undefined)
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
      title="Agent access"
      description="Connect an agent, review its permissions, and manage keys, usage, and credit."
      currentPath="/agent-access"
      eyebrow="ACCESS"
    >
      {localE2E ? (
        <div className="grid gap-3">
          <Alert>
            <AlertTitle>Local preview — no agent is connected</AlertTitle>
            <AlertDescription>
              <p>This browser journey does not sign in, create access, or authorize work. Browse the public demo to explore the customer experience.</p>
              <Button asChild variant="secondary" className="mt-2 min-h-11"><Link to="/">Browse public demo</Link></Button>
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
        items={items}
        loading={loading}
        onRevoke={(keyId) => void revoke(keyId)}
        {...(revoking === undefined ? {} : { revokingKeyId: revoking })}
        accessUnavailable={error !== undefined}
        creditTopupPort={creditTopupPort}
        onCreditRefresh={load}
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

function operationApprovalErrorCopy(code: 'authentication_required' | 'invocation_not_found' | 'authority_not_pending' | 'grant_not_current' | 'invocation_invalid'): string {
  if (code === 'authentication_required') return 'Sign in as the access owner, then try again.'
  if (code === 'grant_not_current') return 'This agent grant changed. Review current access before trying again.'
  if (code === 'invocation_not_found') return 'This waiting operation is no longer available. Refresh the list.'
  if (code === 'authority_not_pending') return 'This operation no longer needs a decision. Refresh the list.'
  return 'This operation could not be verified. Refresh the list before deciding.'
}
