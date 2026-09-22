'use client'

import type { ReactNode } from 'react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import type { PendingCallApproval } from '@/modules/capability-execution/call-approval.functions'
import type { AgentSpendingLimitsReadResult, AgentSpendingLimitsResult } from '@/modules/agent-access/spending-policy-update'
import type { ExactAmount } from '@/modules/money/public'

import { AeAgentApprovalsSection } from '../AeAgentApprovalsSection'
import { AeAgentDirectoryTable } from '../AeAgentDirectoryTable'
import { buildAgentRecordSheetProps } from './build-agent-record-sheet-props'
import { AgentLifecycleConfirmDialog } from './components/AgentLifecycleConfirmDialog'
import { AgentRecordSheet } from './components/AgentRecordSheet'
import { useAgentLifecycleDialog } from './useAgentLifecycleDialog'
import { useAgentSelection } from './useAgentSelection'

export type AeAgentOperatorConsoleProps = Readonly<{
  directory: AgentDirectoryProjection
  loading: boolean
  onRevokeCredential: (credentialRef: string) => void | Promise<void>
  onDisconnectAgent: (principalRef: string) => void | Promise<void>
  onDisconnectConnection?: (connectionRef: string, expectedRevision: number) => void | Promise<void>
  onRenameAgent?: (principalRef: string, expectedRevision: number, displayName: string) => Promise<boolean>
  onUpdateSpendingLimits?: (params: {
    principalRef: string
    expectedGeneration: number
    maximumSpendPerCall: ExactAmount
    maximumDailySpend: ExactAmount
    maximumMonthlySpend: ExactAmount
  }) => Promise<AgentSpendingLimitsResult>
  onReadSpendingLimits?: (principalRef: string) => Promise<AgentSpendingLimitsReadResult>
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
  onConnectNewAgent?: () => void
}>

export function AeAgentOperatorConsole({
  directory,
  loading,
  onRevokeCredential,
  onDisconnectAgent,
  onDisconnectConnection,
  onRenameAgent,
  onUpdateSpendingLimits,
  onReadSpendingLimits,
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
  onConnectNewAgent,
}: AeAgentOperatorConsoleProps) {
  const selection = useAgentSelection({
    directoryItems: directory.items,
    directoryDetails: directory.details,
    ...(selectedPrincipalId === undefined ? {} : { selectedPrincipalId }),
    ...(getAgentHref === undefined ? {} : { getAgentHref }),
    ...(onClearSelectedPrincipal === undefined ? {} : { onClearSelectedPrincipal }),
  })
  const lifecycle = useAgentLifecycleDialog({
    onRevokeCredential,
    onDisconnectAgent,
    ...(onDisconnectConnection === undefined ? {} : { onDisconnectConnection }),
  })
  const { selected, setLocalSelected, handleSheetOpenChange } = selection

  const approvalsSection = (
    <AeAgentApprovalsSection
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

  return (
    <div className="grid gap-8">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{approvalStatus ?? ''}</p>
      {approvalsSection}
      {selectedPrincipalId === undefined || selected !== undefined ? null : (
        <Alert>
          <AlertTitle>Agent not found</AlertTitle>
          <AlertDescription>
            <p>This agent is no longer in the directory or the link is stale.</p>
            <Button type="button" variant="secondary" onClick={onClearSelectedPrincipal}>Return to Agents</Button>
          </AlertDescription>
        </Alert>
      )}
      <AeSection
        id="revoke"
        title="Agents"
        description="Review each independent agent, its current credential generation, activity, and connection state. Historical credentials stay attached to the same Agent."
      >
        {onConnectNewAgent !== undefined && (
          <div className="flex justify-end">
            <Button type="button" onClick={onConnectNewAgent} className="w-fit min-h-touch">Connect an Agent</Button>
          </div>
        )}
        <AeAgentDirectoryTable
          directoryItems={directory.items}
          loading={loading}
          {...(onRenameAgent === undefined ? {} : { onRenameAgent })}
          {...(getAgentHref === undefined ? {} : { getAgentHref })}
          onOpenAgent={setLocalSelected}
        />
      </AeSection>
      <AgentRecordSheet {...buildAgentRecordSheetProps({
        selected,
        open: selected !== undefined,
        onOpenChange: handleSheetOpenChange,
        lifecycle,
        ...(lifecyclePending === undefined ? {} : { lifecyclePending }),
        ...(agentHistory === undefined ? {} : { agentHistory }),
        removeAgentDisabled: lifecyclePending !== undefined || selected?.agent.status === 'disconnected',
        ...(onUpdateSpendingLimits === undefined ? {} : { onUpdateSpendingLimits }),
        ...(onReadSpendingLimits === undefined ? {} : { onReadSpendingLimits }),
      })} />
      <AgentLifecycleConfirmDialog
        lifecycleTarget={lifecycle.lifecycleTarget}
        revocationMode={lifecycle.revocationMode}
        revokePending={lifecycle.revokePending}
        revokeDiagnostic={lifecycle.revokeDiagnostic}
        revokeTriggerRef={lifecycle.revokeTriggerRef}
        onOpenChange={lifecycle.handleLifecycleDialogOpenChange}
        onConfirm={lifecycle.confirmLifecycle}
        onRevocationModeChange={lifecycle.setRevocationMode}
      />
    </div>
  )
}
