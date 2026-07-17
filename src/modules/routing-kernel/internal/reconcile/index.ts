import type { CapabilityBindingAdapter, KernelIdFactory } from '../model'
import type { IncidentEvaluator, IncidentScope } from '../../incident-control'
import type { KernelStore } from '../store'
import type {
  ReconcileProviderCancellationInput,
  ReconcileProviderCancellationResult,
  ReconcileProviderOutcomeInput,
  ReconcileProviderOutcomeResult,
} from '../kernel'
import { createReconcileProviderCancellation } from './provider-cancellation'
import { createReconcileProviderOutcome } from './provider-outcome'

export type CreateReconcileOperationsInput = Readonly<{
  store: KernelStore
  adapters: ReadonlyMap<string, CapabilityBindingAdapter>
  incidentControl: IncidentEvaluator
  ids: KernelIdFactory
  now: () => number
}>

export type ReconcileOperations = Readonly<{
  reconcileProviderOutcome: (request: ReconcileProviderOutcomeInput) => Promise<ReconcileProviderOutcomeResult>
  reconcileProviderCancellation: (request: ReconcileProviderCancellationInput) => Promise<ReconcileProviderCancellationResult>
}>

export function createReconcileOperations(input: CreateReconcileOperationsInput): ReconcileOperations {
  const { incidentControl, now } = input
  const claimRecovery = async (request: {
    recoveryGrantId: string | undefined
    scope: IncidentScope
    operationRef: string
  }): Promise<boolean> => {
    if (request.recoveryGrantId === undefined || incidentControl.claimRecovery === undefined) return false
    const result = await incidentControl.claimRecovery({
      recoveryGrantId: request.recoveryGrantId, lane: 'reconcile', scope: request.scope,
      operationRef: request.operationRef, usedAt: now(),
    })
    return result.kind === 'recovery_authorized'
  }
  return Object.freeze({
    reconcileProviderOutcome: createReconcileProviderOutcome({ ...input, claimRecovery }),
    reconcileProviderCancellation: createReconcileProviderCancellation({
      store: input.store,
      incidentControl: input.incidentControl,
      ids: input.ids,
      now: input.now,
      claimRecovery,
    }),
  })
}
