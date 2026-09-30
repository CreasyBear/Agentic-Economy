import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

import type { LifecycleTarget } from './agent-operator-console.contracts'

export function lifecycleConfirmLabel(kind: LifecycleTarget['kind']): string {
  return kind === 'agent' ? 'Remove agent' : 'Disconnect connection'
}

export function lifecycleDialogTitle(target: LifecycleTarget | undefined): string {
  if (target === undefined) return 'Change agent access?'
  if (target.kind === 'connection') {
    return `Disconnect ${target.connectorName} from ${target.name}?`
  }
  return `Remove ${target.name} everywhere?`
}

export function lifecycleDialogDescription(target: LifecycleTarget | undefined): string {
  if (target === undefined) return ''
  if (target.kind === 'connection') {
    return `Only this ${target.connectorName} connection stops. Other connections for ${target.name} remain usable.`
  }
  return `Every active credential, grant, delegation, and provider key for ${target.name} will be revoked. Historical activity remains readable.`
}

export function lifecycleSuccessToast(kind: LifecycleTarget['kind']): string {
  if (kind === 'connection') return 'Connection disconnected'
  return 'Agent access revoked'
}

export function lifecycleFailureTriplet(kind: LifecycleTarget['kind']): Rule4Diagnostic {
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

