'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { AeConfirmDialog, TACTILE } from '@/components/ae/feedback/AeConfirmDialog'
import { toast } from '@/lib/ui/toast'
import { cn } from '@/lib/utils'
import { AeFactList, type AeFact } from '@/components/ae/data/AeFactList'
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
import { AeAgentCallHistoryTable } from './AeAgentCallHistoryTable'
import { AeAgentConnectionReceipts } from './AeAgentConnectionReceipts'
import { AeAgentCredentialHistory } from './AeAgentCredentialHistory'
import { AeAgentDirectoryTable } from './AeAgentDirectoryTable'
import { AeAgentSpendingLimitsForm } from './AeAgentSpendingLimitsForm'
import type { ExactAmount } from '@/modules/money/public'
import type {
  AgentSpendingLimitsReadResult,
  AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'
import {
  agentAccessFacts,
  agentActivityFacts,
  agentFacts,
  agentRecoveryCopy,
  agentSpendingPolicyFacts,
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
  const directoryItems = directory.items
  const [localSelected, setLocalSelected] = useState<AgentDirectoryItem>()
  const [lifecycleTarget, setLifecycleTarget] = useState<
    | Readonly<{ kind: 'credential'; credentialRef: string; generation: number; name: string }>
    | Readonly<{ kind: 'connection'; connectionRef: string; revision: number; connectorName: string; name: string }>
    | Readonly<{ kind: 'agent'; principalRef: string; name: string }>
  >()
  const [revokePending, setRevokePending] = useState(false)
  const [revocationMode, setRevocationMode] = useState<'drain' | 'freeze'>('drain')
  const [revokeDiagnostic, setRevokeDiagnostic] = useState<{
    whatHappened: string
    financialImpact: string
    nextStep: string
  } | null>(null)
  const revokeTriggerRef = useRef<HTMLButtonElement>(null)
  const revokeInFlightRef = useRef(false)
  const sheetDismissHandledRef = useRef(false)
  const routeControlled = getAgentHref !== undefined
  const selectedItem = routeControlled
    ? directoryItems.find((item) => item.principalRef === selectedPrincipalId)
    : localSelected
  const selected = selectedItem === undefined
    ? undefined
    : directory.details.find(({ agent }) => agent.principalRef === selectedItem.principalRef)

  useEffect(() => {
    if (selected !== undefined) {
      sheetDismissHandledRef.current = false
    }
  }, [selected])

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

  function resetRevocationDialogState() {
    setRevocationMode('drain')
    setRevokeDiagnostic(null)
  }

  function requestCredentialRevoke(item: AgentDetail, credentialRef: string, generation: number, trigger: HTMLButtonElement) {
    revokeTriggerRef.current = trigger
    resetRevocationDialogState()
    setLifecycleTarget({ kind: 'credential', credentialRef, generation, name: item.agent.displayName })
  }

  function requestDisconnect(item: AgentDetail, trigger: HTMLButtonElement) {
    revokeTriggerRef.current = trigger
    resetRevocationDialogState()
    setLifecycleTarget({ kind: 'agent', principalRef: item.agent.principalRef, name: item.agent.displayName })
  }

  function requestConnectionDisconnect(item: AgentDetail, connection: AgentConnectionReadback, trigger: HTMLButtonElement) {
    revokeTriggerRef.current = trigger
    resetRevocationDialogState()
    setLifecycleTarget({
      kind: 'connection',
      connectionRef: connection.connectionRef,
      revision: connection.revision,
      connectorName: connection.connectorDisplayName,
      name: item.agent.displayName,
    })
  }

  function lifecycleConfirmLabel(
    kind: 'credential' | 'connection' | 'agent',
    mode: 'drain' | 'freeze',
  ): string {
    if (kind === 'agent') {
      return mode === 'drain' ? 'Drain then remove' : 'Remove immediately'
    }
    if (kind === 'credential') {
      return mode === 'drain' ? 'Drain then revoke' : 'Revoke immediately'
    }
    return mode === 'drain' ? 'Drain then disconnect' : 'Disconnect immediately'
  }

  async function confirmLifecycle() {
    if (lifecycleTarget === undefined || revokeInFlightRef.current) return
    revokeInFlightRef.current = true
    setRevokePending(true)
    setRevokeDiagnostic(null)
    try {
      if (lifecycleTarget.kind === 'credential') await onRevokeCredential(lifecycleTarget.credentialRef)
      else if (lifecycleTarget.kind === 'connection') {
        await onDisconnectConnection?.(lifecycleTarget.connectionRef, lifecycleTarget.revision)
      } else await onDisconnectAgent(lifecycleTarget.principalRef)

      if (lifecycleTarget.kind === 'credential') toast.success('Credential revoked')
      else if (lifecycleTarget.kind === 'connection') toast.success('Connection disconnected')
      else toast.success('Agent access revoked')

      setLifecycleTarget(undefined)
      resetRevocationDialogState()
    } catch {
      const triplet = lifecycleTarget.kind === 'credential'
        ? {
            whatHappened: 'Could not revoke this credential.',
            financialImpact: 'A$0.00 affected — agent remains active',
            nextStep: 'Try again. If this persists, refresh the directory and retry.',
          }
        : lifecycleTarget.kind === 'connection'
          ? {
              whatHappened: 'Could not disconnect this connection.',
              financialImpact: 'A$0.00 affected — agent remains active',
              nextStep: 'Try again. If this persists, refresh the directory and retry.',
            }
          : {
              whatHappened: 'Could not revoke agent access.',
              financialImpact: 'A$0.00 affected — agent remains active',
              nextStep: 'Try again. If this persists, refresh the directory and retry.',
            }
      setRevokeDiagnostic(triplet)
      toast.error(triplet.whatHappened)
    } finally {
      revokeInFlightRef.current = false
      setRevokePending(false)
    }
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
        {onConnectNewAgent !== undefined && (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={onConnectNewAgent}
              className="w-fit min-h-touch"
            >
              + Connect New Agent
            </Button>
          </div>
        )}
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
          if (open || selected === undefined) return
          if (sheetDismissHandledRef.current) return
          sheetDismissHandledRef.current = true
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
            <AgentFactsDisclosure label="Spending policy" facts={agentSpendingPolicyFacts(selected)}>
              <AeAgentSpendingLimitsForm
                detail={selected}
                {...(onUpdateSpendingLimits === undefined ? {} : { onUpdateSpendingLimits })}
                {...(onReadSpendingLimits === undefined ? {} : { onReadSpendingLimits })}
              />
            </AgentFactsDisclosure>
            <AgentFactsDisclosure label="Activity" facts={agentActivityFacts(selected)}>
              <AeAgentCallHistoryTable activity={selected.activity} />
            </AgentFactsDisclosure>
            <AgentFactsDisclosure label="Tool access" facts={agentAccessFacts(selected)}>
              <AeAgentAuthorizedTools detail={selected} />
            </AgentFactsDisclosure>
            <AeAgentConnectionReceipts
              detail={selected}
              {...(lifecyclePending === undefined ? {} : { lifecyclePending })}
              onDisconnect={(connection, trigger) => requestConnectionDisconnect(selected, connection, trigger)}
            />
            <Collapsible>
              <CollapsibleTrigger
                render={
                  <Button type="button" variant="ghost" className="w-fit min-h-touch">
                    Technical details
                  </Button>
                }
              />
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
                  className={cn('w-fit min-h-touch', TACTILE)}
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
          if (!open) {
            setLifecycleTarget(undefined)
            resetRevocationDialogState()
          }
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
        confirmLabel={lifecycleTarget === undefined
          ? 'Confirm'
          : lifecycleConfirmLabel(lifecycleTarget.kind, revocationMode)}
        confirmVariant="destructive"
        pending={revokePending}
        onConfirm={confirmLifecycle}
        returnFocusRef={revokeTriggerRef}
        {...(lifecycleTarget === undefined
          ? {}
          : {
              financialImpact: (
                <>
                  <span className="font-mono tabular-nums">A$0.00</span>
                  {' unreleased holds remain protected — in-flight calls finish or release immediately'}
                </>
              ),
              diagnostic: revokeDiagnostic,
              children: (
                <div className="grid gap-2" role="group" aria-label="Revocation mode">
                  {([
                    {
                      id: 'drain' as const,
                      title: 'Graceful Drain',
                      detail: 'New admissions stop now. In-flight Calls may finish within 30s.',
                    },
                    {
                      id: 'freeze' as const,
                      title: 'Immediate Freeze',
                      detail: 'Halts immediately. New Calls are refused now.',
                    },
                  ]).map((option) => {
                    const selected = revocationMode === option.id
                    return (
                      <div
                        key={option.id}
                        role="button"
                        tabIndex={-1}
                        aria-pressed={selected}
                        className={cn(
                          'cursor-pointer rounded-md border p-3 text-left text-sm',
                          selected ? 'border-foreground bg-muted' : 'border-border bg-background',
                          TACTILE,
                        )}
                        onClick={() => setRevocationMode(option.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setRevocationMode(option.id)
                          }
                        }}
                      >
                        <p className="font-medium text-foreground">{option.title}</p>
                        <p className="text-xs text-muted-foreground">{option.detail}</p>
                      </div>
                    )
                  })}
                </div>
              ),
            })}
      />

    </div>
  )
}

function AgentFactsDisclosure({
  label,
  facts,
  children,
}: Readonly<{
  label: string
  facts: readonly AeFact[]
  children?: ReactNode
}>) {
  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button type="button" variant="ghost" className="w-fit min-h-touch">
            {label}
          </Button>
        }
      />
      <CollapsibleContent className="grid gap-3 pt-2">
        <AeFactList density="compact" facts={facts} />
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
