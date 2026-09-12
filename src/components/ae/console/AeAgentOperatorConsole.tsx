'use client'

import { useRef, useState, type ReactNode } from 'react'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type {
  AgentDetail,
  AgentDirectoryItem,
  AgentDirectoryProjection,
} from '@/modules/agent-access/agent-operator-view-model'
import type { PendingCallApproval } from '@/modules/capability-execution/call-approval.functions'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'
import { AeAgentApprovalsSection } from './AeAgentApprovalsSection'
import { AeAgentAuthorizedTools } from './AeAgentAuthorizedTools'
import { AeAgentConnectionReceipts } from './AeAgentConnectionReceipts'
import { AeAgentCredentialHistory } from './AeAgentCredentialHistory'
import { AeAgentDirectoryTable } from './AeAgentDirectoryTable'
import {
  agentFacts,
  agentRecoveryCopy,
  agentStatusLabel,
  technicalAgentFacts,
} from './agent-operator-console-model'

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
        <AeAgentDirectoryTable
          directoryItems={directoryItems}
          loading={loading}
          {...(onRenameAgent === undefined ? {} : { onRenameAgent })}
          {...(getAgentHref === undefined ? {} : { getAgentHref })}
          onOpenAgent={setLocalSelected}
        />
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
            <AeAgentAuthorizedTools detail={selected} />
            <AeAgentConnectionReceipts
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
                <AeAgentCredentialHistory
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
