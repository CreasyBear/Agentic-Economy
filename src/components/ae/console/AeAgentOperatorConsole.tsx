'use client'

import { useMemo, useRef, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeFactList, type AeFact } from '@/components/ae/data/AeFactList'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { stagedListPhase, useFirstLoadPending } from '@/components/ui/data-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type {
  AgentDetail,
  AgentDirectoryItem,
  AgentDirectoryProjection,
} from '@/modules/agent-access/agent-operator-view-model'
import { formatTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import type { PendingOperationApproval } from '@/modules/capability-execution/operation-approval.functions'
import { suggestContinuation } from '@/modules/market/suggested-continuation'

export type AeAgentOperatorConsoleProps = Readonly<{
  directory: AgentDirectoryProjection
  loading: boolean
  onRevokeCredential: (credentialRef: string) => void | Promise<void>
  onDisconnectAgent: (principalRef: string) => void | Promise<void>
  lifecyclePending?: Readonly<{ kind: 'credential' | 'agent'; ref: string }>
  approvals: readonly PendingOperationApproval[]
  approvalsLoading: boolean
  approvalsError?: string
  approvalDecision?: Readonly<{ invocationRef: string; decision: 'approve' | 'deny' }>
  approvalStatus?: string
  onRetryApprovals: () => void
  onDecideApproval: (invocationRef: string, operationRef: string, decision: 'approve' | 'deny') => void
  accessUnavailable?: boolean
  selectedPrincipalId?: string
  getAgentHref?: (principalId: string) => string
  onClearSelectedPrincipal?: () => void
}>

export function AeAgentOperatorConsole({
  directory,
  loading,
  onRevokeCredential,
  onDisconnectAgent,
  lifecyclePending,
  approvals,
  approvalsLoading,
  approvalsError,
  approvalDecision,
  approvalStatus,
  onRetryApprovals,
  onDecideApproval,
  accessUnavailable = false,
  selectedPrincipalId,
  getAgentHref,
  onClearSelectedPrincipal,
}: AeAgentOperatorConsoleProps) {
  const directoryItems = directory.items
  const [localSelected, setLocalSelected] = useState<AgentDirectoryItem>()
  const [lifecycleTarget, setLifecycleTarget] = useState<
    | Readonly<{ kind: 'credential'; credentialRef: string; generation: number; name: string }>
    | Readonly<{ kind: 'agent'; principalRef: string; name: string }>
  >()
  const [revokePending, setRevokePending] = useState(false)
  const revokeTriggerRef = useRef<HTMLButtonElement>(null)
  const revokeInFlightRef = useRef(false)
  const routeControlled = getAgentHref !== undefined
  const selectedItem = routeControlled
    ? directoryItems.find((item) => item.principalRef === selectedPrincipalId)
    : localSelected
  const selected = selectedItem === undefined
    ? undefined
    : directory.details.find(({ agent }) => agent.principalRef === selectedItem.principalRef)
  const firstLoadPending = useFirstLoadPending(loading)
  const columns = useMemo<ColumnDef<AgentDirectoryItem, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (item) => item.displayName,
        header: ({ column }) => <AeOperatorSortableHeader label="Name" column={column} />,
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.displayName}</span>,
      },
      {
        id: 'status',
        accessorFn: (item) => agentStatusLabel(item.status),
        header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
        cell: ({ row }) => {
          const status = agentStatusLabel(row.original.status)
          return <Badge variant={status === 'Connected' ? 'default' : 'outline'}>{status}</Badge>
        },
      },
      {
        id: 'environment',
        accessorFn: (item) => environmentLabel(item.environment),
        header: ({ column }) => <AeOperatorSortableHeader label="Environment" column={column} />,
        cell: ({ row }) => environmentLabel(row.original.environment),
      },
      {
        id: 'credentials',
        accessorFn: (item) => item.currentCredentialGeneration ?? 0,
        header: ({ column }) => <AeOperatorSortableHeader label="Generation" column={column} />,
        cell: ({ row }) => row.original.currentCredentialGeneration === undefined
          ? '—'
          : String(row.original.currentCredentialGeneration),
      },
      {
        id: 'lastSeen',
        accessorFn: (item) => item.lastSeenAt ?? 0,
        header: ({ column }) => <AeOperatorSortableHeader label="Last seen" column={column} />,
        cell: ({ row }) => row.original.lastSeenAt === undefined
          ? 'No activity'
          : formatTimestamp(row.original.lastSeenAt),
      },
    ],
    [],
  )

  const approvalsSection = (
    <WaitingApprovalsSection
      approvals={approvals}
      loading={approvalsLoading}
      {...(approvalsError === undefined ? {} : { error: approvalsError })}
      {...(approvalDecision === undefined ? {} : { decision: approvalDecision })}
      onRetry={onRetryApprovals}
      onDecide={onDecideApproval}
    />
  )

  if (accessUnavailable) {
    return (
      <div className="grid gap-8">
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{approvalStatus ?? ''}</p>
        {approvalsSection}
      </div>
    )
  }

  const disconnecting = selected !== undefined
    && lifecyclePending?.kind === 'agent'
    && lifecyclePending.ref === selected.agent.principalRef
  const disconnectDisabled = selected === undefined
    || lifecyclePending !== undefined
    || selected.agent.status === 'disconnected'
  const agentsPhase = stagedListPhase({ firstLoadPending, rows: directoryItems })
  const missingAgentContinuation = suggestContinuation({
    subject: 'connection',
    state: 'missing',
    actor: 'buyer',
  })

  function requestCredentialRevoke(item: AgentDetail, credentialRef: string, generation: number, trigger: HTMLButtonElement) {
    revokeTriggerRef.current = trigger
    setLifecycleTarget({ kind: 'credential', credentialRef, generation, name: item.agent.displayName })
  }

  function requestDisconnect(item: AgentDetail, trigger: HTMLButtonElement) {
    revokeTriggerRef.current = trigger
    setLifecycleTarget({ kind: 'agent', principalRef: item.agent.principalRef, name: item.agent.displayName })
  }

  async function confirmLifecycle() {
    if (lifecycleTarget === undefined || revokeInFlightRef.current) return
    revokeInFlightRef.current = true
    setRevokePending(true)
    try {
      if (lifecycleTarget.kind === 'credential') await onRevokeCredential(lifecycleTarget.credentialRef)
      else await onDisconnectAgent(lifecycleTarget.principalRef)
      setLifecycleTarget(undefined)
    } finally {
      revokeInFlightRef.current = false
      setRevokePending(false)
    }
  }

  return (
    <div className="grid gap-8">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{approvalStatus ?? ''}</p>
      <AeSection title="Credit" description="Paid calls use the credit assigned to each agent.">
        <Button asChild variant="secondary" className="w-fit min-h-touch">
          <a href="/owner/credit">Open Credit</a>
        </Button>
      </AeSection>

      {approvalsSection}

      {selectedPrincipalId === undefined || selected !== undefined ? null : (
        <Alert>
          <AlertTitle>Agent not found</AlertTitle>
          <AlertDescription>
            <p>This agent is no longer in the directory or the link is stale.</p>
            <Button type="button" variant="secondary" onClick={onClearSelectedPrincipal}>
              Return to Agents
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <AeSection
        id="revoke"
        title="Agents"
        description="Review each independent agent, its current credential generation, activity, and connection state. Historical credentials stay attached to the same durable agent."
      >
        {agentsPhase === 'unloaded' ? (
          <AeRecordTable
            columns={columns}
            data={[]}
            caption="Agents"
            countLabel="agents"
            loading
            hideFilter
          />
        ) : directoryItems.length === 0 ? (
          <AeEmptyState
            title="No agent is connected yet"
            description="Start setup from the agent and approve the request to create access you can revoke."
            action={
              <Button asChild className="min-h-touch">
                <a href={missingAgentContinuation.href}>{missingAgentContinuation.label}</a>
              </Button>
            }
          />
        ) : (
          <AeRecordTable
            columns={columns}
            data={directoryItems}
            caption="Agents"
            countLabel="agents"
            filterPlaceholder="Filter agents…"
            hideFilter={directoryItems.length <= 1}
            getRowId={(item) => item.principalRef}
            {...(getAgentHref === undefined
              ? {
                  rowAction: {
                    kind: 'button' as const,
                    label: 'View',
                    onOpen: setLocalSelected,
                    getAccessibleLabel: (item: AgentDirectoryItem) =>
                      `View ${item.displayName}`,
                  },
                }
              : {
                  rowAction: {
                    kind: 'link' as const,
                    label: 'Open',
                    getHref: (item: AgentDirectoryItem) =>
                      getAgentHref(item.principalRef),
                    getAccessibleLabel: (item: AgentDirectoryItem) =>
                      `Open ${item.displayName}`,
                  },
                })}
          />
        )}
      </AeSection>

      <AeRecordSheet
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (open) return
          if (routeControlled) onClearSelectedPrincipal?.()
          else setLocalSelected(undefined)
        }}
        title={selected?.agent.displayName ?? 'Agent'}
        {...(selected === undefined ? {} : { description: agentStatusLabel(selected.agent.status), facts: agentFacts(selected) })}
        {...(selected === undefined
          ? {}
          : {
              action: (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disconnectDisabled}
                  onClick={(event) => requestDisconnect(selected, event.currentTarget)}
                  className="min-h-touch"
                >
                  {disconnecting ? 'Disconnecting agent…' : 'Disconnect agent'}
                </Button>
              ),
            })}
      >
        {selected === undefined ? null : (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-muted-foreground">{agentRecoveryCopy(selected)}</p>
            <CredentialHistory
              detail={selected}
              {...(lifecyclePending === undefined ? {} : { lifecyclePending })}
              onRequestRevoke={(credentialRef, generation, trigger) => requestCredentialRevoke(selected, credentialRef, generation, trigger)}
            />
          </div>
        )}
      </AeRecordSheet>

      <AeConfirmDialog
        open={lifecycleTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) setLifecycleTarget(undefined)
        }}
        title={lifecycleTarget === undefined
          ? 'Change agent access?'
          : lifecycleTarget.kind === 'credential'
            ? `Revoke generation ${lifecycleTarget.generation} for ${lifecycleTarget.name}?`
            : `Disconnect ${lifecycleTarget.name}?`}
        description={lifecycleTarget === undefined
          ? ''
          : lifecycleTarget.kind === 'credential'
            ? `Only this credential stops. Any other active credential for ${lifecycleTarget.name} remains usable, and history stays attached to the agent.`
            : `Every active credential, grant, delegation, and provider key for ${lifecycleTarget.name} will be revoked. Historical activity remains readable.`}
        confirmLabel={lifecycleTarget?.kind === 'credential' ? 'Revoke credential' : 'Disconnect agent'}
        confirmVariant="destructive"
        pending={revokePending}
        onConfirm={confirmLifecycle}
        returnFocusRef={revokeTriggerRef}
      />

      <AeSection title="Recovery" description="The next step depends on what stopped the call.">
        <ul className="m-0 grid list-none divide-y divide-border p-0">
          <RecoveryItem title="Lost, expired, or revoked agent key">
            Start a new access request from the agent. AE delivers the replacement caller key to that agent once; supplier credentials stay server-side.
          </RecoveryItem>
          <RecoveryItem title="Stale access grant">
            Revoke the affected access, then approve a new request so the key and current grant are issued together.
          </RecoveryItem>
          <RecoveryItem title="Provider reauthorization required">
            The supplier connection owner must reauthorize that connection. Do not put a supplier credential into the agent key or request payload.
          </RecoveryItem>
          <RecoveryItem title="Outcome uncertain">
            Reconcile the recorded invocation before retrying. A retry could repeat work that the supplier already received.
          </RecoveryItem>
        </ul>
      </AeSection>
    </div>
  )
}

function WaitingApprovalsSection({
  approvals,
  loading,
  error,
  decision,
  onRetry,
  onDecide,
}: Readonly<{
  approvals: readonly PendingOperationApproval[]
  loading: boolean
  error?: string
  decision?: Readonly<{ invocationRef: string; decision: 'approve' | 'deny' }>
  onRetry: () => void
  onDecide: (invocationRef: string, operationRef: string, decision: 'approve' | 'deny') => void
}>) {
  if (!loading && error === undefined && approvals.length === 0) return null

  return (
    <AeSection title="Waiting for approval" description="Review the exact operation before allowing it to run once.">
      {loading && approvals.length === 0 ? (
        <div className="grid gap-intra" aria-busy="true" aria-label="Loading waiting approvals">
          <Skeleton className="h-touch w-full" />
          <Skeleton className="h-touch w-full" />
        </div>
      ) : null}
      {error === undefined ? null : (
        <Alert variant="destructive">
          <AlertTitle>Waiting approvals unavailable</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button type="button" variant="secondary" disabled={loading} onClick={onRetry}>
              {loading ? 'Refreshing approvals…' : 'Refresh approvals'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {approvals.length === 0 ? null : (
        <ol className="m-0 list-none divide-y divide-border border-y border-border p-0">
          {approvals.map((approval) => {
            const deciding = decision?.invocationRef === approval.invocationRef
            const controlsDisabled = decision !== undefined
            return (
              <li key={approval.invocationRef} className="grid min-w-0 gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="grid min-w-0 gap-3">
                  <div className="grid gap-1">
                    <p className="text-sm font-medium text-muted-foreground">Operation</p>
                    <p className="break-all font-medium text-foreground">{approval.operationRef}</p>
                  </div>
                  <AeFactList
                    density="compact"
                    facts={approvalFacts(approval)}
                  />
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                  <Button
                    type="button"
                    className="min-h-touch w-full sm:w-auto"
                    disabled={controlsDisabled}
                    onClick={() => onDecide(approval.invocationRef, approval.operationRef, 'approve')}
                  >
                    {deciding && decision?.decision === 'approve' ? 'Approving once…' : 'Approve once'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-touch w-full sm:w-auto"
                    disabled={controlsDisabled}
                    onClick={() => onDecide(approval.invocationRef, approval.operationRef, 'deny')}
                  >
                    {deciding && decision?.decision === 'deny' ? 'Declining…' : 'Decline'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </AeSection>
  )
}

function approvalFacts(approval: PendingOperationApproval): readonly AeFact[] {
  const facts: AeFact[] = [
    { label: 'Consequence', value: consequenceLabel(approval.authorityRequest.consequence) },
  ]
  if (approval.authorityRequest.maximumSpend !== undefined) {
    facts.push({ label: 'Maximum spend', value: formatCurrencyAmount(approval.authorityRequest.maximumSpend) })
  }
  facts.push({
    label: 'Data fields',
    value: approval.authorityRequest.dataFields.length === 0
      ? 'None'
      : approval.authorityRequest.dataFields.join(', '),
  })
  return facts
}

function agentFacts(detail: AgentDetail): readonly AeFact[] {
  const accountBalance = detail.account?.balance
  const zeroBalance = accountBalance === undefined ? undefined : { ...accountBalance, units: '0' }
  return [
    { label: 'Application', value: detail.agent.applicationRef },
    { label: 'Environment', value: environmentLabel(detail.agent.environment) },
    { label: 'Credentials', value: String(detail.credentials.length) },
    { label: 'Current generation', value: detail.agent.currentCredentialGeneration === undefined
      ? 'None'
      : String(detail.agent.currentCredentialGeneration) },
    { label: 'Last seen', value: detail.agent.lastSeenAt === undefined
      ? 'No activity recorded'
      : formatTimestamp(detail.agent.lastSeenAt) },
    { label: 'Current credential', value: detail.currentCredentialRef === undefined
      ? 'None'
      : redactedKeyId(detail.currentCredentialRef) },
    { label: 'Per call', value: formatAmount(detail.grant?.budget.maximumSpendPerInvocation) },
    { label: 'Daily budget', value: formatAmount(detail.grant?.budget.maximumDailySpend) },
    { label: 'Monthly budget', value: formatAmount(detail.grant?.budget.maximumMonthlySpend) },
    { label: 'Rate', value: detail.grant === undefined ? 'Unavailable' : `${detail.grant.rate.maximumCallsPerMinute}/min · ${detail.grant.rate.maximumCallsPerHour}/hour` },
    { label: 'Concurrency', value: detail.grant === undefined ? 'Unavailable' : String(detail.grant.budget.maximumConcurrentInvocations) },
    { label: 'Authority', value: scopeLabel(detail.authorityMode) },
    { label: 'Scopes', value: detail.scopes.length === 0 ? 'None' : detail.scopes.join(', ') },
    { label: 'Balance', value: formatAmount(accountBalance) },
    { label: 'Calls', value: String(detail.usage?.callCount ?? 0) },
    { label: 'Spend', value: formatAmount(detail.usage?.grossSpend ?? zeroBalance) },
    { label: 'Unknown', value: detail.usage?.states.includes('outcome_unknown') ? 'Needs review' : 'None' },
    { label: 'Usage and balance', value: dataLabel(detail.dataState), muted: true },
  ]
}

function CredentialHistory({
  detail,
  lifecyclePending,
  onRequestRevoke,
}: Readonly<{
  detail: AgentDetail
  lifecyclePending?: Readonly<{ kind: 'credential' | 'agent'; ref: string }>
  onRequestRevoke: (credentialRef: string, generation: number, trigger: HTMLButtonElement) => void
}>) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-foreground">Credential history</p>
      <ul className="m-0 grid list-none gap-2 p-0">
        {detail.credentials.toReversed().map((credential) => (
          <li
            key={credential.credentialRef}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
          >
            <span>Generation {credential.generation}</span>
            <span className="flex items-center gap-2">
              <Badge variant={credential.lifecycle === 'active' ? 'default' : 'outline'}>
                {credential.lifecycle === 'active'
                  ? credential.credentialRef === detail.currentCredentialRef ? 'Current' : 'Active'
                  : credential.lifecycle === 'stale'
                    ? 'Expired'
                    : 'Revoked'}
              </Badge>
              {credential.lifecycle === 'active' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={lifecyclePending !== undefined}
                  onClick={(event) => onRequestRevoke(credential.credentialRef, credential.generation, event.currentTarget)}
                >
                  {lifecyclePending?.kind === 'credential' && lifecyclePending.ref === credential.credentialRef
                    ? 'Revoking…'
                    : 'Revoke'}
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function agentStatusLabel(status: AgentDirectoryItem['status']): 'Connected' | 'Needs attention' | 'Expired' | 'Disconnected' {
  if (status === 'connected') return 'Connected'
  if (status === 'attention') return 'Needs attention'
  if (status === 'expired') return 'Expired'
  return 'Disconnected'
}

function agentRecoveryCopy(detail: AgentDetail): string {
  if (detail.agent.status === 'disconnected' || detail.agent.status === 'expired') {
    return 'To reconnect, start a new access request from the agent.'
  }
  if (detail.agent.status === 'attention' || detail.grant === undefined) {
    return 'This agent needs attention. Review its current credential before allowing new work.'
  }
  if (detail.usage?.states.includes('outcome_unknown')) {
    return 'One or more calls needs checking. Reconcile the recorded outcome before retrying.'
  }
  return 'Revoking the current credential blocks new calls; prior usage and evidence remain visible.'
}

function RecoveryItem({ title, children }: Readonly<{ title: string; children: string }>) {
  return (
    <li className="grid gap-1 py-3 first:pt-0 last:pb-0">
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-3xl text-sm text-muted-foreground">{children}</p>
    </li>
  )
}

function consequenceLabel(consequence: PendingOperationApproval['authorityRequest']['consequence']): string {
  switch (consequence) {
    case 'read_only':
      return 'Read only'
    case 'communication':
      return 'Sends a communication'
    case 'external_effect':
      return 'Creates an external effect'
    default: {
      const exhaustive: never = consequence
      return exhaustive
    }
  }
}

function environmentLabel(environment: AgentDirectoryItem['environment']): string {
  switch (environment) {
    case 'sandbox':
      return 'Development'
    case 'production':
      return 'Production'
    default: {
      const exhaustive: never = environment
      return exhaustive
    }
  }
}

function scopeLabel(mode: AgentDetail['authorityMode']): string {
  switch (mode) {
    case 'inspect_only':
      return 'Browse only'
    case 'approve_each':
      return 'Ask each time'
    case 'bounded_mandate':
      return 'Work within limits'
    case 'full_yolo':
      return 'Custom authority'
    default: {
      const exhaustive: never = mode
      return exhaustive
    }
  }
}

function redactedKeyId(keyId: string): string {
  return keyId.length <= 8 ? '••••' : `•••• ${keyId.slice(-8)}`
}

function dataLabel(state: AgentDetail['dataState']): string {
  switch (state) {
    case 'source':
      return 'Usage details are available'
    case 'empty':
      return 'No usage yet'
    case 'partial':
      return 'Some usage details are temporarily unavailable'
    case 'unavailable':
      return 'Usage details are temporarily unavailable'
    default: {
      const exhaustive: never = state
      return exhaustive
    }
  }
}

function formatAmount(amount: ExactAmount | undefined): string {
  return amount === undefined ? '—' : formatCurrencyAmount(amount)
}
