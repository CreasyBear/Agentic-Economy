'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'

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
import { InlineEditField } from '@/components/ui/inline-edit-field'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type {
  AgentDetail,
  AgentDirectoryItem,
  AgentDirectoryProjection,
} from '@/modules/agent-access/agent-operator-view-model'
import { formatTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import type { PendingCallApproval } from '@/modules/capability-execution/call-approval.functions'
import { suggestNextAction } from '@/modules/market/suggested-next-action'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'
import { NATIVE_MCP_CLIENTS } from '@/lib/cli-distribution'

export type AeAgentOperatorConsoleProps = Readonly<{
  directory: AgentDirectoryProjection
  loading: boolean
  onRevokeCredential: (credentialRef: string) => void | Promise<void>
  onDisconnectAgent: (principalRef: string) => void | Promise<void>
  onDisconnectConnection?: (connectionRef: string, expectedRevision: number) => void | Promise<void>
  onRenameAgent?: (principalRef: string, expectedRevision: number, displayName: string) => Promise<boolean>
  agentHistory?: ReactNode
  lifecyclePending?: Readonly<{ kind: 'credential' | 'connection' | 'agent'; ref: string }>
  approvals: readonly PendingCallApproval[]
  approvalsLoading: boolean
  approvalsError?: string
  approvalDecision?: Readonly<{ callRef: string; decision: 'approve' | 'deny' }>
  approvalStatus?: string
  onRetryApprovals: () => void
  onDecideApproval: (callRef: string, toolRef: string, decision: 'approve' | 'deny') => void
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
  onDisconnectConnection,
  onRenameAgent,
  agentHistory,
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
    | Readonly<{ kind: 'connection'; connectionRef: string; revision: number; connectorName: string; name: string }>
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
        id: 'agent',
        accessorFn: (item) => item.displayName,
        header: ({ column }) => <AeOperatorSortableHeader label="Agent" column={column} />,
        cell: ({ row }) => (
          <div className="grid gap-1">
            <InlineEditField
              value={row.original.displayName}
              label={`Rename ${row.original.displayName}`}
              readOnly={onRenameAgent === undefined}
              errorMessage="Could not rename this Agent. Current saved name has been restored."
              onSave={async (displayName) => onRenameAgent?.(
                row.original.principalRef,
                row.original.principalRevision,
                displayName,
              ) ?? false}
            />
            <Badge variant="outline" className="w-fit">{environmentLabel(row.original.environment)}</Badge>
          </div>
        ),
      },
      {
        id: 'connection',
        accessorFn: (item) => item.connectorDisplayNames.join(', '),
        header: ({ column }) => <AeOperatorSortableHeader label="Connection" column={column} />,
        cell: ({ row }) => row.original.connectionCount === 0
          ? 'Legacy credential'
          : row.original.connectorDisplayNames.join(', '),
      },
      {
        id: 'authority',
        accessorFn: (item) => scopeLabel(item.authorityMode),
        header: ({ column }) => <AeOperatorSortableHeader label="Authority" column={column} />,
        cell: ({ row }) => scopeLabel(row.original.authorityMode),
      },
      {
        id: 'lastUsed',
        accessorFn: (item) => item.lastSeenAt ?? 0,
        header: ({ column }) => <AeOperatorSortableHeader label="Last used" column={column} />,
        cell: ({ row }) => row.original.lastSeenAt === undefined
          ? 'No activity'
          : <span className="font-mono tabular-nums">{formatTimestamp(row.original.lastSeenAt)}</span>,
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
    ],
    [onRenameAgent],
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

  const agentsPhase = stagedListPhase({ firstLoadPending, rows: directoryItems })
  const missingAgentNextAction = suggestNextAction({
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

  function requestConnectionDisconnect(item: AgentDetail, connection: AgentConnectionReadback, trigger: HTMLButtonElement) {
    revokeTriggerRef.current = trigger
    setLifecycleTarget({
      kind: 'connection',
      connectionRef: connection.connectionRef,
      revision: connection.revision,
      connectorName: connection.connectorDisplayName,
      name: item.agent.displayName,
    })
  }

  async function confirmLifecycle() {
    if (lifecycleTarget === undefined || revokeInFlightRef.current) return
    revokeInFlightRef.current = true
    setRevokePending(true)
    try {
      if (lifecycleTarget.kind === 'credential') await onRevokeCredential(lifecycleTarget.credentialRef)
      else if (lifecycleTarget.kind === 'connection') {
        await onDisconnectConnection?.(lifecycleTarget.connectionRef, lifecycleTarget.revision)
      } else await onDisconnectAgent(lifecycleTarget.principalRef)
      setLifecycleTarget(undefined)
    } finally {
      revokeInFlightRef.current = false
      setRevokePending(false)
    }
  }

  return (
    <div className="grid gap-8">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{approvalStatus ?? ''}</p>
      <AeSection title="Credit" description="Paid Calls use shared Account credit within each Agent’s spending policy.">
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
        description="Review each independent agent, its current credential generation, activity, and connection state. Historical credentials stay attached to the same Agent."
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
                <a href={missingAgentNextAction.href}>{missingAgentNextAction.label}</a>
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
      >
        {selected === undefined ? null : (
          <div className="mt-4 grid gap-3">
            {agentRecoveryCopy(selected) === undefined ? null : (
              <p className="text-sm text-muted-foreground">{agentRecoveryCopy(selected)}</p>
            )}
            <p className="text-sm text-muted-foreground">Counts and settled charges cover Calls created in the current UTC calendar month. Released or refunded payments are excluded. This is not a net-spend statement.</p>
            {selected.activityTruncated ? <p className="text-sm text-muted-foreground">Recent activity shows only the latest 50 Calls by creation time; monthly counts cover the full period when available.</p> : null}
            <AuthorizedTools detail={selected} />
            <ConnectionReceipts
              detail={selected}
              {...(lifecyclePending === undefined ? {} : { lifecyclePending })}
              onDisconnect={(connection, trigger) => requestConnectionDisconnect(selected, connection, trigger)}
            />
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="w-fit min-h-touch">Technical details</Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-3 pt-2">
                <AeFactList density="compact" facts={technicalAgentFacts(selected)} />
                <CredentialHistory
                  detail={selected}
                  {...(lifecyclePending === undefined ? {} : { lifecyclePending })}
                  onRequestRevoke={(credentialRef, generation, trigger) => requestCredentialRevoke(selected, credentialRef, generation, trigger)}
                />
                {agentHistory}
                <Button
                  type="button"
                  variant="destructive"
                  disabled={lifecyclePending !== undefined || selected.agent.status === 'disconnected'}
                  onClick={(event) => requestDisconnect(selected, event.currentTarget)}
                  className="w-fit min-h-touch"
                >
                  Remove agent everywhere
                </Button>
              </CollapsibleContent>
            </Collapsible>
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
            : lifecycleTarget.kind === 'connection'
              ? `Disconnect ${lifecycleTarget.connectorName} from ${lifecycleTarget.name}?`
              : `Remove ${lifecycleTarget.name} everywhere?`}
        description={lifecycleTarget === undefined
          ? ''
          : lifecycleTarget.kind === 'credential'
            ? `Only this credential stops. Any other active credential for ${lifecycleTarget.name} remains usable, and history stays attached to the agent.`
            : lifecycleTarget.kind === 'connection'
              ? `Only this ${lifecycleTarget.connectorName} connection stops. Other connections for ${lifecycleTarget.name} remain usable.`
              : `Every active credential, grant, delegation, and provider key for ${lifecycleTarget.name} will be revoked. Historical activity remains readable.`}
        confirmLabel={lifecycleTarget?.kind === 'credential'
          ? 'Revoke credential'
          : lifecycleTarget?.kind === 'connection'
            ? 'Disconnect'
            : 'Remove agent everywhere'}
        confirmVariant="destructive"
        pending={revokePending}
        onConfirm={confirmLifecycle}
        returnFocusRef={revokeTriggerRef}
      />

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
  approvals: readonly PendingCallApproval[]
  loading: boolean
  error?: string
  decision?: Readonly<{ callRef: string; decision: 'approve' | 'deny' }>
  onRetry: () => void
  onDecide: (callRef: string, toolRef: string, decision: 'approve' | 'deny') => void
}>) {
  if (!loading && error === undefined && approvals.length === 0) return null

  return (
    <AeSection title="Waiting for approval" description="Review the exact Tool before allowing it to run once.">
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
            const deciding = decision?.callRef === approval.callRef
            const controlsDisabled = decision !== undefined
            return (
              <li key={approval.callRef} className="grid min-w-0 gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="grid min-w-0 gap-3">
                  <div className="grid gap-1">
                    <p className="text-sm font-medium text-muted-foreground">Tool</p>
                    <Link
                      to="/tools/$toolRef"
                      params={{ toolRef: approval.toolRef }}
                      className="break-all font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {approval.toolRef}
                    </Link>
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
                    onClick={() => onDecide(approval.callRef, approval.toolRef, 'approve')}
                  >
                    {deciding && decision?.decision === 'approve' ? 'Approving once…' : 'Approve once'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-touch w-full sm:w-auto"
                    disabled={controlsDisabled}
                    onClick={() => onDecide(approval.callRef, approval.toolRef, 'deny')}
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

function approvalFacts(approval: PendingCallApproval): readonly AeFact[] {
  const facts: AeFact[] = [
    { label: 'Consequence', value: consequenceLabel(approval.authorityRequest.consequence) },
  ]
  if (approval.authorityRequest.maximumSpend !== undefined) {
    facts.push({ label: 'Maximum spend', value: formatCurrencyAmount(approval.authorityRequest.maximumSpend), mono: true})
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
  const usage = detail.usage
  const settledCharges = usage === undefined
    ? 'Unavailable'
    : usage.amountCoverage === 'complete' && usage.settledSpend !== undefined
      ? formatAmount(usage.settledSpend)
      : 'Amount coverage incomplete'
  return [
    { label: 'Environment', value: environmentLabel(detail.agent.environment) },
    { label: 'Last used', value: detail.agent.lastSeenAt === undefined
      ? 'No activity recorded'
      : formatTimestamp(detail.agent.lastSeenAt),
      mono: true },
    { label: 'Per call', value: formatAmount(detail.grant?.budget.maximumSpendPerCall), mono: true},
    { label: 'Daily budget', value: formatAmount(detail.grant?.budget.maximumDailySpend), mono: true},
    { label: 'Monthly budget', value: formatAmount(detail.grant?.budget.maximumMonthlySpend), mono: true},
    { label: 'Rate', value: detail.grant === undefined ? 'Unavailable' : `${detail.grant.rate.maximumCallsPerMinute}/min · ${detail.grant.rate.maximumCallsPerHour}/hour`, mono: true},
    { label: 'Concurrency', value: detail.grant === undefined ? 'Unavailable' : String(detail.grant.budget.maximumConcurrentCalls), mono: true},
    { label: 'Authority', value: scopeLabel(detail.authorityMode) },
    { label: 'Tools', value: toolAccessLabel(detail) },
    { label: 'Calls this month', value: usage === undefined ? 'Unavailable' : String(usage.callCount), mono: true },
    { label: 'Completed', value: usage === undefined ? 'Unavailable' : String(usage.completedCallCount), mono: true },
    { label: 'Needs checking', value: usage === undefined ? 'Unavailable' : String(usage.outcomeUnknownCallCount) },
    { label: 'Settled charges', value: settledCharges, mono: true },
    { label: 'Amount coverage', value: usage === undefined ? 'Unavailable' : usage.amountCoverage === 'complete' ? 'Complete' : 'Incomplete' },
    { label: 'Usage data', value: dataLabel(detail.dataState), muted: true },
  ]
}

function technicalAgentFacts(detail: AgentDetail): readonly AeFact[] {
  return [
    { label: 'Application', value: detail.agent.applicationRef, mono: true },
    { label: 'Credentials', value: String(detail.credentials.length), mono: true },
    { label: 'Current generation', value: detail.agent.currentCredentialGeneration === undefined ? 'None' : String(detail.agent.currentCredentialGeneration), mono: true },
    {
      label: 'Last authenticated',
      value: detail.agent.lastAuthenticatedAt === undefined ? 'Not recorded' : formatTimestamp(detail.agent.lastAuthenticatedAt),
      definition: 'Recorded at most once every 15 minutes for the current credential.',
      mono: true,
    },
    { label: 'Current credential', value: detail.currentCredentialRef === undefined ? 'None' : redactedKeyId(detail.currentCredentialRef), mono: true },
    { label: 'Scopes', value: detail.scopes.length === 0 ? 'None' : detail.scopes.join(', '), mono: true },
  ]
}

function ConnectionReceipts({
  detail,
  lifecyclePending,
  onDisconnect,
}: Readonly<{
  detail: AgentDetail
  lifecyclePending?: Readonly<{ kind: 'credential' | 'connection' | 'agent'; ref: string }>
  onDisconnect: (connection: AgentConnectionReadback, trigger: HTMLButtonElement) => void
}>) {
  if (detail.connections.length === 0) {
    return (
      <div className="grid gap-1 rounded-md border border-border p-3">
        <p className="font-medium text-foreground">Legacy credential</p>
        <p className="text-sm text-muted-foreground">This access predates durable client connections. No client identity is inferred.</p>
      </div>
    )
  }
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-foreground">Connections</h3>
      <ul className="m-0 grid list-none gap-2 p-0">
        {detail.connections.map((connection) => (
          <li key={connection.connectionRef} className="grid gap-3 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground">{connection.connectorDisplayName}</p>
              <Badge variant={connection.state === 'active' ? 'default' : 'outline'}>{connectionStateLabel(connection.state)}</Badge>
            </div>
            <AeFactList density="compact" facts={[
              { label: 'Environment', value: environmentLabel(connection.environment) },
              { label: 'Authority', value: scopeLabel(connection.authorityMode) },
              { label: 'Budget', value: formatCurrencyAmount(connection.spendingPolicy.budget.maximumMonthlySpend), mono: true },
              { label: 'Connected', value: formatTimestamp(connection.connectedAt), mono: true },
              { label: 'Last refresh', value: formatTimestamp(connection.lastRotatedAt), mono: true },
              { label: 'Connection expires', value: formatTimestamp(connection.connectionExpiresAt), mono: true },
              { label: 'Last agent use', value: detail.agent.lastSeenAt === undefined ? 'No activity' : formatTimestamp(detail.agent.lastSeenAt), mono: true },
            ]} />
            {connection.state === 'active' ? (
              <Button
                type="button"
                variant="secondary"
                className="w-fit min-h-touch"
                disabled={lifecyclePending !== undefined}
                onClick={(event) => onDisconnect(connection, event.currentTarget)}
              >
                {lifecyclePending?.kind === 'connection' && lifecyclePending.ref === connection.connectionRef ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{reconnectInstructionFor(connection.connectorDisplayName)}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CredentialHistory({
  detail,
  lifecyclePending,
  onRequestRevoke,
}: Readonly<{
  detail: AgentDetail
  lifecyclePending?: Readonly<{ kind: 'credential' | 'connection' | 'agent'; ref: string }>
  onRequestRevoke: (credentialRef: string, generation: number, trigger: HTMLButtonElement) => void
}>) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-foreground">Credential history</p>
      <ul className="m-0 list-none divide-y divide-border border-y border-border p-0">
        {detail.credentials.toReversed().map((credential) => (
          <li
            key={credential.credentialRef}
            className="flex flex-wrap items-center justify-between gap-intra py-intra text-sm"
          >
            <span className="grid gap-1">
              <span>Generation {credential.generation}</span>
              <span className="text-xs text-muted-foreground">
                Issued {formatTimestamp(credential.issuedAt)} · expires {formatTimestamp(credential.expiresAt)}
              </span>
              <span className="text-xs text-muted-foreground">
                Last authenticated {credential.lastAuthenticatedAt === undefined
                  ? 'not recorded'
                  : formatTimestamp(credential.lastAuthenticatedAt)}
              </span>
            </span>
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

function agentRecoveryCopy(detail: AgentDetail): string | undefined {
  if (detail.agent.status === 'disconnected' || detail.agent.status === 'expired') {
    return 'To reconnect, start a new access request from the agent.'
  }
  if (detail.agent.status === 'attention' || detail.grant === undefined) {
    return 'This agent needs attention. Review its current credential before allowing new work.'
  }
  if (detail.usage !== undefined && detail.usage.outcomeUnknownCallCount > 0) {
    return 'One or more calls needs checking. Reconcile the recorded outcome before retrying.'
  }
  return undefined
}

function connectionStateLabel(state: AgentConnectionReadback['state']): string {
  if (state === 'active') return 'Connected'
  if (state === 'expired') return 'Expired'
  return 'Revoked'
}

function reconnectInstructionFor(connectorDisplayName: string): string {
  return NATIVE_MCP_CLIENTS.find(({ displayName }) => displayName === connectorDisplayName)?.reconnectInstruction
    ?? 'Reconnect from the original agent client.'
}

function consequenceLabel(consequence: PendingCallApproval['authorityRequest']['consequence']): string {
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
      return 'Sandbox'
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
    case 'read_only':
      return 'Browse only'
    case 'approval_required':
      return 'Ask each time'
    case 'spending_policy':
      return 'Work within limits'
    case 'unrestricted_test_only':
      return 'Custom authority'
    default: {
      const exhaustive: never = mode
      return exhaustive
    }
  }
}

function toolAccessLabel(detail: AgentDetail): string {
  if (detail.grant === undefined) return 'Unavailable'
  if (detail.grant.toolAccess === 'all_admitted') return 'All admitted Tools'
  return detail.grant.toolRefs.length === 0
    ? 'None'
    : `${detail.grant.toolRefs.length} selected ${detail.grant.toolRefs.length === 1 ? 'Tool' : 'Tools'}`
}

function AuthorizedTools({ detail }: Readonly<{ detail: AgentDetail }>) {
  if (detail.grant?.toolAccess !== 'selected_tools' || detail.grant.toolRefs.length === 0) {
    return null
  }
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-foreground">Authorized Tools</h3>
      <ul className="m-0 grid list-none gap-2 p-0">
        {detail.grant.toolRefs.map((toolRef) => (
          <li key={toolRef} className="min-w-0 rounded-md border px-3 py-2">
            <Link
              to="/tools/$toolRef"
              params={{ toolRef }}
              className="block truncate font-mono text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {toolRef}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
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
