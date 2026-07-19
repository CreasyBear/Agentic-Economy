import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  ActionInvocationOrigin,
  InvocationActor,
} from './contracts'
import type {
  DynamicPublishedActionInvocationAdapter,
} from './dynamic-published-adapter'

export type DevelopmentInvocationHost = Readonly<{
  origin: ActionInvocationOrigin
  actor: InvocationActor
  prepare(value: StableHashValue, freshnessMs: number): ReturnType<DynamicPublishedActionInvocationAdapter['prepare']>
  decide(input: Omit<Parameters<DynamicPublishedActionInvocationAdapter['decide']>[0], 'actor' | 'origin'>):
    ReturnType<DynamicPublishedActionInvocationAdapter['decide']>
  acquire(input: Omit<Parameters<DynamicPublishedActionInvocationAdapter['acquire']>[0], 'actor' | 'origin'>):
    ReturnType<DynamicPublishedActionInvocationAdapter['acquire']>
  executeAcquired: DynamicPublishedActionInvocationAdapter['executeAcquired']
  reconcile(input: Omit<Parameters<DynamicPublishedActionInvocationAdapter['reconcile']>[0], 'actor' | 'origin'>):
    ReturnType<DynamicPublishedActionInvocationAdapter['reconcile']>
  cancel(input: Omit<Parameters<DynamicPublishedActionInvocationAdapter['cancel']>[0], 'actor' | 'origin'>):
    ReturnType<DynamicPublishedActionInvocationAdapter['cancel']>
  inspect: DynamicPublishedActionInvocationAdapter['inspect']
  exportSnapshot: DynamicPublishedActionInvocationAdapter['exportSnapshot']
}> 

function bindHost(
  adapter: DynamicPublishedActionInvocationAdapter,
  actor: InvocationActor,
  origin: ActionInvocationOrigin,
): DevelopmentInvocationHost {
  return Object.freeze({
    origin,
    actor,
    prepare: (value, freshnessMs) => adapter.prepare({ actor, origin, value, freshnessMs }),
    decide: (input) => adapter.decide({ ...input, actor, origin }),
    acquire: (input) => adapter.acquire({ ...input, actor, origin }),
    executeAcquired: adapter.executeAcquired,
    reconcile: (input) => adapter.reconcile({ ...input, actor, origin }),
    cancel: (input) => adapter.cancel({ ...input, actor, origin }),
    inspect: adapter.inspect,
    exportSnapshot: adapter.exportSnapshot,
  })
}

export function createRequestOwnedDevelopmentHost(input: Readonly<{
  adapter: DynamicPublishedActionInvocationAdapter
  actor: InvocationActor
  requestRef: string
  revision: number
}>): DevelopmentInvocationHost {
  if (input.requestRef.length === 0 || !Number.isInteger(input.revision) || input.revision < 0) {
    throw new Error('request_owned_lineage_invalid')
  }
  return bindHost(input.adapter, input.actor, {
    kind: 'request_owned',
    requestRef: input.requestRef,
    revision: input.revision,
  })
}

export function createStandaloneAgentDevelopmentHost(input: Readonly<{
  adapter: DynamicPublishedActionInvocationAdapter
  actor: InvocationActor
}>): DevelopmentInvocationHost {
  return bindHost(input.adapter, input.actor, {
    kind: 'standalone',
    callerRef: input.actor.callerRef,
    principalRef: input.actor.principalRef,
  })
}
