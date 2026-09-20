import { useRef, useState } from 'react'

import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { toast } from '@/lib/ui/toast'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'

import {
  lifecycleFailureTriplet,
  lifecycleSuccessToast,
} from './agent-lifecycle-copy'
import type {
  LifecycleTarget,
  RevocationMode,
  UseAgentLifecycleDialogParams,
  UseAgentLifecycleDialogResult,
} from './agent-operator-console.contracts'

export function useAgentLifecycleDialog({
  onRevokeCredential,
  onDisconnectAgent,
  onDisconnectConnection,
}: UseAgentLifecycleDialogParams): UseAgentLifecycleDialogResult {
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleTarget>()
  const [revokePending, setRevokePending] = useState(false)
  const [revocationMode, setRevocationMode] = useState<RevocationMode>('drain')
  const [revokeDiagnostic, setRevokeDiagnostic] = useState<Rule4Diagnostic | null>(null)
  const revokeTriggerRef = useRef<HTMLButtonElement>(null)
  const revokeInFlightRef = useRef(false)

  function resetRevocationDialogState() {
    setRevocationMode('drain')
    setRevokeDiagnostic(null)
  }

  function requestCredentialRevoke(
    item: AgentDetail,
    credentialRef: string,
    generation: number,
    trigger: HTMLButtonElement,
  ) {
    revokeTriggerRef.current = trigger
    resetRevocationDialogState()
    setLifecycleTarget({ kind: 'credential', credentialRef, generation, name: item.agent.displayName })
  }

  function requestDisconnect(item: AgentDetail, trigger: HTMLButtonElement) {
    revokeTriggerRef.current = trigger
    resetRevocationDialogState()
    setLifecycleTarget({ kind: 'agent', principalRef: item.agent.principalRef, name: item.agent.displayName })
  }

  function requestConnectionDisconnect(
    item: AgentDetail,
    connection: AgentConnectionReadback,
    trigger: HTMLButtonElement,
  ) {
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

  function handleLifecycleDialogOpenChange(open: boolean) {
    if (!open) {
      setLifecycleTarget(undefined)
      resetRevocationDialogState()
    }
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

      toast.success(lifecycleSuccessToast(lifecycleTarget.kind))

      setLifecycleTarget(undefined)
      resetRevocationDialogState()
    } catch (cause) {
      void cause
      const triplet = lifecycleFailureTriplet(lifecycleTarget.kind)
      setRevokeDiagnostic(triplet)
      toast.error(triplet.whatHappened)
    } finally {
      revokeInFlightRef.current = false
      setRevokePending(false)
    }
  }

  return {
    lifecycleTarget,
    revocationMode,
    revokePending,
    revokeDiagnostic,
    revokeTriggerRef,
    requestCredentialRevoke,
    requestDisconnect,
    requestConnectionDisconnect,
    confirmLifecycle,
    handleLifecycleDialogOpenChange,
    setRevocationMode,
  }
}
