import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  ActionInvocationOrigin,
  ActionInvocationView,
  InvocationActor,
  InvocationDecision,
} from './contracts'
import type { ActionInvocationHostSeam } from './host-seam'
import type { DynamicPublishedInvocationResult } from './dynamic-published-contract'
import type { ReconciliationEvidence } from './reconciliation-evidence'

export type DevelopmentHostContinuation =
  | Readonly<{ kind: 'completed'; view: ActionInvocationView<DynamicPublishedInvocationResult> }>
  | Readonly<{ kind: 'reconciled'; view: ActionInvocationView<DynamicPublishedInvocationResult> }>
  | Readonly<{ kind: 'refused'; code: string; view?: ActionInvocationView<DynamicPublishedInvocationResult> }>

export type DevelopmentInvocationHost = Readonly<{
  origin: ActionInvocationOrigin
  actor: InvocationActor
  prepare(value: StableHashValue, freshnessMs: number): ActionInvocationView<DynamicPublishedInvocationResult>
  decide(invocationRef: string, accept: boolean): InvocationDecision<DynamicPublishedInvocationResult>
  continue(invocationRef: string): Promise<DevelopmentHostContinuation>
  recover(invocationRef: string): DevelopmentHostContinuation
  requestCancellation(invocationRef: string): InvocationDecision<DynamicPublishedInvocationResult>
  inspect(invocationRef: string): ActionInvocationView<DynamicPublishedInvocationResult> | undefined
  exportSnapshot: ActionInvocationHostSeam['exportSnapshot']
}>

export type DevelopmentHostSourceCommands = Readonly<{
  leaseOwner(host: 'request_owned_human' | 'standalone_external_agent', invocationRef: string): string
  reconciliationEvidence(
    view: ActionInvocationView<DynamicPublishedInvocationResult>,
  ): ReconciliationEvidence | undefined
  beforeExecute?(
    view: ActionInvocationView<DynamicPublishedInvocationResult>,
  ): void | Promise<void>
}>

function bindHost(
  host: 'request_owned_human' | 'standalone_external_agent',
  adapter: ActionInvocationHostSeam,
  actor: InvocationActor,
  origin: ActionInvocationOrigin,
  sourceCommands: DevelopmentHostSourceCommands,
): DevelopmentInvocationHost {
  const current = (invocationRef: string) => {
    const view = adapter.inspect(invocationRef)
    if (view === undefined) return { kind: 'refused', code: 'invocation_not_found' } as const
    if (view.owner.callerRef !== actor.callerRef || view.owner.principalRef !== actor.principalRef) {
      return { kind: 'refused', code: 'cross_principal_refused', view } as const
    }
    return { kind: 'current', view } as const
  }
  return Object.freeze({
    origin,
    actor,
    prepare: (value, freshnessMs) => adapter.prepare({ actor, origin, value, freshnessMs }),
    decide: (invocationRef, accept) => {
      const found = current(invocationRef)
      if (found.kind === 'refused') return found
      if (found.view.authority === undefined) {
        return { kind: 'refused', code: 'invalid_control_state', view: found.view }
      }
      return adapter.decide({
        invocationRef,
        expectedInvocationVersion: found.view.invocationVersion,
        authorityRef: found.view.authority.reference,
        actor,
        origin,
        accept,
      })
    },
    continue: async (invocationRef) => {
      const found = current(invocationRef)
      if (found.kind === 'refused') return found
      let view = found.view
      if (view.control.state === 'reconciliation_required') {
        return { kind: 'refused', code: 'reconcile_before_retry', view }
      }
      if (view.control.state === 'authorized') {
        const acquired = adapter.acquire({
          invocationRef,
          expectedInvocationVersion: view.invocationVersion,
          authorityRef: view.authority!.reference,
          actor,
          origin,
          leaseOwner: sourceCommands.leaseOwner(host, invocationRef),
          leaseMs: 30_000,
        })
        if (acquired.kind === 'refused') return acquired
        view = acquired.view
      }
      if (view.control.state !== 'leased') {
        return { kind: 'refused', code: 'invalid_control_state', view }
      }
      await sourceCommands.beforeExecute?.(view)
      const executed = await adapter.executeAcquired({
        invocationRef,
        expectedInvocationVersion: view.invocationVersion,
        attemptRef: view.control.attemptRef,
        leaseOwner: view.control.leaseOwner,
        effectGeneration: view.control.effectGeneration,
      })
      return executed.kind === 'accepted'
        ? { kind: 'completed', view: executed.view }
        : executed
    },
    recover: (invocationRef) => {
      const found = current(invocationRef)
      if (found.kind === 'refused') return found
      const view = found.view
      if (view.control.state !== 'reconciliation_required') {
        return { kind: 'refused', code: 'invalid_control_state', view }
      }
      const attemptRef = view.control.attemptRef
      const evidence = sourceCommands.reconciliationEvidence(view)
      const attempt = view.attempts.find(
        (entry) => entry.attemptRef === attemptRef,
      )
      if (evidence === undefined || attempt === undefined) {
        return { kind: 'refused', code: 'reconciliation_evidence_unavailable', view }
      }
      const reconciled = adapter.reconcile({
        invocationRef,
        expectedInvocationVersion: view.invocationVersion,
        attemptRef: attempt.attemptRef,
        actor,
        origin,
        evidence,
      })
      return reconciled.kind === 'accepted'
        ? { kind: 'reconciled', view: reconciled.view }
        : reconciled
    },
    requestCancellation: (invocationRef) => {
      const found = current(invocationRef)
      if (found.kind === 'refused') return found
      return adapter.cancel({
        invocationRef,
        expectedInvocationVersion: found.view.invocationVersion,
        actor,
        origin,
      })
    },
    inspect: adapter.inspect,
    exportSnapshot: adapter.exportSnapshot,
  })
}

export function createRequestOwnedDevelopmentHost(input: Readonly<{
  adapter: ActionInvocationHostSeam
  actor: InvocationActor
  requestRef: string
  revision: number
  sourceCommands: DevelopmentHostSourceCommands
}>): DevelopmentInvocationHost {
  if (input.requestRef.length === 0 || !Number.isInteger(input.revision) || input.revision < 0) {
    throw new Error('request_owned_lineage_invalid')
  }
  return bindHost('request_owned_human', input.adapter, input.actor, {
    kind: 'request_owned',
    requestRef: input.requestRef,
    revision: input.revision,
  }, input.sourceCommands)
}

export function createStandaloneAgentDevelopmentHost(input: Readonly<{
  adapter: ActionInvocationHostSeam
  actor: InvocationActor
  sourceCommands: DevelopmentHostSourceCommands
}>): DevelopmentInvocationHost {
  return bindHost('standalone_external_agent', input.adapter, input.actor, {
    kind: 'standalone',
    callerRef: input.actor.callerRef,
    principalRef: input.actor.principalRef,
  }, input.sourceCommands)
}
