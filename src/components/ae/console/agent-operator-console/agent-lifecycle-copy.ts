import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

import type { LifecycleTarget, RevocationMode } from './agent-operator-console.contracts'

export function lifecycleConfirmLabel(
  kind: 'credential' | 'connection' | 'agent',
  mode: RevocationMode,
): string {
  if (kind === 'agent') {
    return mode === 'drain' ? 'Drain then remove' : 'Remove immediately'
  }
  if (kind === 'credential') {
    return mode === 'drain' ? 'Drain then revoke' : 'Revoke immediately'
  }
  return mode === 'drain' ? 'Drain then disconnect' : 'Disconnect immediately'
}

export function lifecycleDialogTitle(target: LifecycleTarget | undefined): string {
  if (target === undefined) return 'Change agent access?'
  if (target.kind === 'credential') {
    return `Revoke generation ${target.generation} for ${target.name}?`
  }
  if (target.kind === 'connection') {
    return `Disconnect ${target.connectorName} from ${target.name}?`
  }
  return `Remove ${target.name} everywhere?`
}

export function lifecycleDialogDescription(target: LifecycleTarget | undefined): string {
  if (target === undefined) return ''
  if (target.kind === 'credential') {
    return `Only this credential stops. Any other active credential for ${target.name} remains usable, and history stays attached to the agent.`
  }
  if (target.kind === 'connection') {
    return `Only this ${target.connectorName} connection stops. Other connections for ${target.name} remain usable.`
  }
  return `Every active credential, grant, delegation, and provider key for ${target.name} will be revoked. Historical activity remains readable.`
}

export function lifecycleSuccessToast(kind: LifecycleTarget['kind']): string {
  if (kind === 'credential') return 'Credential revoked'
  if (kind === 'connection') return 'Connection disconnected'
  return 'Agent access revoked'
}

export function lifecycleFailureTriplet(kind: LifecycleTarget['kind']): Rule4Diagnostic {
  if (kind === 'credential') {
    return {
      whatHappened: 'Could not revoke this credential.',
      financialImpact: 'A$0.00 affected — agent remains active',
      nextStep: 'Try again. If this persists, refresh the directory and retry.',
    }
  }
  if (kind === 'connection') {
    return {
      whatHappened: 'Could not disconnect this connection.',
      financialImpact: 'A$0.00 affected — agent remains active',
      nextStep: 'Try again. If this persists, refresh the directory and retry.',
    }
  }
  return {
    whatHappened: 'Could not revoke agent access.',
    financialImpact: 'A$0.00 affected — agent remains active',
    nextStep: 'Try again. If this persists, refresh the directory and retry.',
  }
}

export const revocationModeOptions: readonly Readonly<{
  id: RevocationMode
  title: string
  detail: string
}>[] = [
  {
    id: 'drain',
    title: 'Graceful Drain',
    detail: 'New admissions stop now. In-flight Calls may finish within 30s.',
  },
  {
    id: 'freeze',
    title: 'Immediate Freeze',
    detail: 'Halts immediately. New Calls are refused now.',
  },
]
