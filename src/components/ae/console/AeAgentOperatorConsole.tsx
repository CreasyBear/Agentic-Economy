'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeFactList, type AeFact } from '@/components/ae/data/AeFactList'
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

import type { AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'
import { formatTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import type { PendingOperationApproval } from '@/modules/capability-execution/operation-approval.functions'

export type { AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'

export type AeAgentOperatorConsoleProps = Readonly<{
  items: readonly AgentOperatorKeyReadback[]
  loading: boolean
  onRevoke: (keyId: string) => void
  revokingKeyId?: string
  approvals: readonly PendingOperationApproval[]
  approvalsLoading: boolean
  approvalsError?: string
  approvalDecision?: Readonly<{ invocationRef: string; decision: 'approve' | 'deny' }>
  approvalStatus?: string
  onRetryApprovals: () => void
  onDecideApproval: (invocationRef: string, operationRef: string, decision: 'approve' | 'deny') => void
  accessUnavailable?: boolean
}>

export function AeAgentOperatorConsole({
  items,
  loading,
  onRevoke,
  revokingKeyId,
  approvals,
  approvalsLoading,
  approvalsError,
  approvalDecision,
  approvalStatus,
  onRetryApprovals,
  onDecideApproval,
  accessUnavailable = false,
}: AeAgentOperatorConsoleProps) {
  const [selected, setSelected] = useState<AgentOperatorKeyReadback>()
  const firstLoadPending = useFirstLoadPending(loading)
  const columns = useMemo<ColumnDef<AgentOperatorKeyReadback, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (item) => item.key.name,
        header: ({ column }) => <AeOperatorSortableHeader label="Name" column={column} />,
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.key.name}</span>,
      },
      {
        id: 'status',
        accessorFn: (item) => keyStatus(item),
        header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
        cell: ({ row }) => {
          const status = keyStatus(row.original)
          return <Badge variant={status === 'Connected' ? 'default' : 'outline'}>{status}</Badge>
        },
      },
      {
        id: 'authority',
        accessorFn: (item) => scopeLabel(item.key.authorityMode),
        header: ({ column }) => <AeOperatorSortableHeader label="Authority" column={column} />,
        cell: ({ row }) => scopeLabel(row.original.key.authorityMode),
      },
      {
        id: 'calls',
        accessorFn: (item) => item.usage?.callCount ?? 0,
        header: ({ column }) => <AeOperatorSortableHeader label="Calls" column={column} />,
        cell: ({ row }) => String(row.original.usage?.callCount ?? 0),
      },
      {
        id: 'spend',
        accessorFn: (item) => formatAmount(item.usage?.grossSpend),
        header: ({ column }) => <AeOperatorSortableHeader label="Spend" column={column} />,
        cell: ({ row }) => formatAmount(row.original.usage?.grossSpend),
      },
      {
        id: 'balance',
        accessorFn: (item) => formatAmount(item.account?.balance),
        header: ({ column }) => <AeOperatorSortableHeader label="Balance" column={column} />,
        cell: ({ row }) => formatAmount(row.original.account?.balance),
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

  const revoking = selected !== undefined && revokingKeyId === selected.key.keyId
  const revokeDisabled =
    selected === undefined
    || revokingKeyId !== undefined
    || selected.key.revoked
    || selected.key.expired
  const keysPhase = stagedListPhase({ firstLoadPending, rows: items })

  return (
    <div className="grid gap-8">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{approvalStatus ?? ''}</p>
      <AeSection title="Credit" description="Paid calls use the credit assigned to each agent.">
        <Button asChild variant="secondary" className="w-fit min-h-touch">
          <a href="/owner/credit">Open Credit</a>
        </Button>
      </AeSection>

      {approvalsSection}

      <AeSection
        id="revoke"
        title="Connected keys"
        description="Review what each agent can do, its usage, and spend. Revoked or expired access stays visible. Caller keys identify agents. Supplier connections and credentials are managed separately and never appear here."
      >
        {keysPhase === 'unloaded' ? (
          <AeRecordTable
            columns={columns}
            data={[]}
            caption="Connected keys"
            countLabel="keys"
            loading
            hideFilter
          />
        ) : items.length === 0 ? (
          <AeEmptyState
            title="No agent is connected yet"
            description="Start setup from the agent and approve the request to create access you can revoke."
            action={
              <Button asChild className="min-h-touch">
                <a href="/for-agents">Connect agent</a>
              </Button>
            }
          />
        ) : (
          <AeRecordTable
            columns={columns}
            data={items}
            caption="Connected keys"
            countLabel="keys"
            filterPlaceholder="Filter keys…"
            hideFilter={items.length <= 1}
            onRowClick={setSelected}
          />
        )}
      </AeSection>

      <AeRecordSheet
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined)
        }}
        title={selected?.key.name ?? 'Key'}
        {...(selected === undefined ? {} : { description: keyStatus(selected), facts: keyFacts(selected) })}
        {...(selected === undefined
          ? {}
          : {
              action: (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={revokeDisabled}
                  onClick={() => onRevoke(selected.key.keyId)}
                  className="min-h-touch"
                >
                  {revoking ? 'Revoking access…' : 'Revoke access now'}
                </Button>
              ),
            })}
      >
        {selected === undefined ? null : (
          <p className="mt-4 text-sm text-muted-foreground">{recoveryCopy(selected)}</p>
        )}
      </AeRecordSheet>

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

function keyFacts(item: AgentOperatorKeyReadback): readonly AeFact[] {
  const usage = item.usage
  const accountBalance = item.account?.balance
  const zeroBalance = accountBalance === undefined ? undefined : { ...accountBalance, units: '0' }
  return [
    { label: 'Agent key', value: redactedKeyId(item.key.keyId) },
    { label: 'Application', value: item.key.applicationRef },
    { label: 'Environment', value: environmentLabel(item.key.environment) },
    { label: 'Per call', value: formatAmount(item.grant?.budget.maximumSpendPerInvocation) },
    { label: 'Daily budget', value: formatAmount(item.grant?.budget.maximumDailySpend) },
    { label: 'Monthly budget', value: formatAmount(item.grant?.budget.maximumMonthlySpend) },
    { label: 'Rate', value: item.grant === undefined ? 'Unavailable' : `${item.grant.rate.maximumCallsPerMinute}/min · ${item.grant.rate.maximumCallsPerHour}/hour` },
    { label: 'Concurrency', value: item.grant === undefined ? 'Unavailable' : String(item.grant.budget.maximumConcurrentInvocations) },
    { label: 'Authority', value: scopeLabel(item.key.authorityMode) },
    { label: 'Scopes', value: item.key.scopes.length === 0 ? 'None' : item.key.scopes.join(', ') },
    { label: 'Expires', value: item.key.expiresAt === undefined ? 'Not reported' : formatTimestamp(item.key.expiresAt) },
    { label: 'Balance', value: formatAmount(accountBalance) },
    { label: 'Calls', value: String(usage?.callCount ?? 0) },
    { label: 'Spend', value: formatAmount(usage?.grossSpend ?? zeroBalance) },
    { label: 'Unknown', value: usage?.states.includes('outcome_unknown') ? 'Needs review' : 'None' },
    { label: 'Usage and balance', value: dataLabel(item.dataState), muted: true },
  ]
}

function keyStatus(item: AgentOperatorKeyReadback): 'Revoked' | 'Expired' | 'Needs attention' | 'Connected' {
  if (item.key.revoked) return 'Revoked'
  if (item.key.expired) return 'Expired'
  if (item.grant === undefined) return 'Needs attention'
  return 'Connected'
}

function recoveryCopy(item: AgentOperatorKeyReadback): string {
  if (item.key.revoked || item.key.expired) {
    return 'To reconnect, start a new access request from the agent.'
  }
  if (item.grant === undefined) {
    return 'This key does not have a current grant. Revoke it, then approve a new access request.'
  }
  if (item.usage?.states.includes('outcome_unknown')) {
    return 'One or more calls needs checking. Reconcile the recorded outcome before retrying.'
  }
  return 'Revoking blocks new calls immediately; prior usage and evidence remain visible.'
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

function environmentLabel(environment: AgentOperatorKeyReadback['key']['environment']): string {
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

function scopeLabel(mode: AgentOperatorKeyReadback['key']['authorityMode']): string {
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

function dataLabel(state: AgentOperatorKeyReadback['dataState']): string {
  switch (state) {
    case 'source':
      return 'Usage details are available'
    case 'empty':
      return 'No usage yet'
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
