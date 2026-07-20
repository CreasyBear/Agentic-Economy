import type { FunctionReference } from 'convex/server'

import {
  createAuthenticatedConvexClient,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import type {
  HostedPaidOperationCreationGateway,
  HostedPaidOperationTransportGateway,
} from '@/lib/server/hosted-paid-operation-human-api'
import { createHostedPaidOperationComposition } from '@/modules/action-invocation/hosted-paid-operation-composition'
import type {
  HostedPaidOperationAggregate,
  HostedPaidOperationLoadResult,
} from '@/modules/action-invocation/hosted-paid-operation-port'
import type { ActionResult } from '@/modules/common/action'

const loadComplete = sourceQuery<
  { invocationRef: string; paginationOpts: { numItems: number; cursor: string | null } },
  HostedPaidOperationLoadResult<ActionResult> | { kind: 'refused'; code: 'authentication_required' }
>('hostedPaidOperation:authenticatedLoadComplete')

type RuntimeClient = Readonly<{
  query(reference: FunctionReference<'query'>, args: Record<string, unknown>): Promise<unknown>
  mutation(reference: FunctionReference<'mutation'>, args: Record<string, unknown>): Promise<unknown>
}>

export type HostedPaidOperationRuntime = Readonly<{
  gateway: HostedPaidOperationTransportGateway
  creation: HostedPaidOperationCreationGateway
  provenance: string
  currentVersion(invocationRef: string): Promise<number | undefined>
}>

/**
 * Sole request-scoped server composition root. The authenticated Convex client
 * supplies token ownership; route-provided actor fields are never forwarded as
 * authorization inputs.
 */
export function createHostedPaidOperationRuntime(input: Readonly<{
  client: RuntimeClient
  provenance?: string
}>): HostedPaidOperationRuntime {
  const read = async (invocationRef: string) => await input.client.query(loadComplete, {
    invocationRef,
    paginationOpts: { numItems: 20, cursor: null },
  }) as HostedPaidOperationLoadResult<ActionResult>

  const compose = async (invocationRef: string) => {
    const loaded = await read(invocationRef)
    if (loaded.kind !== 'loaded') return loaded
    const aggregate = loaded.aggregate
    const composition = createHostedPaidOperationComposition({
      actor: aggregate.invocation.owner,
      persistence: {
        createInitial: async () => ({ kind: 'refused', code: 'aggregate_incomplete' }),
        loadComplete: async () => read(invocationRef),
        transact: async () => ({ kind: 'refused', code: 'aggregate_incomplete' }),
        reserveAdmission: async () => ({ kind: 'refused', code: 'trial_disabled' }),
      },
      commands: {
        authorize: async () => undefined,
        execute: async () => undefined,
        reconcile: async () => undefined,
      },
    })
    return { kind: 'loaded' as const, aggregate, composition }
  }

  return {
    provenance: input.provenance ?? 'Labelled hosted sandbox source',
    gateway: {
      inspect: async ({ invocationRef, expectedInvocationVersion }) => {
        const loaded = await compose(invocationRef)
        if (loaded.kind === 'not_found') return { kind: 'refused', code: 'invocation_not_found' }
        if (loaded.kind !== 'loaded') return { kind: 'refused', code: 'aggregate_incomplete' }
        return loaded.composition.inspect({ invocationRef, expectedInvocationVersion })
      },
      command: async ({ invocationRef, expectedInvocationVersion, command }) => {
        const loaded = await compose(invocationRef)
        if (loaded.kind === 'not_found') return { kind: 'refused', code: 'invocation_not_found' }
        if (loaded.kind !== 'loaded') return { kind: 'refused', code: 'aggregate_incomplete' }
        if (command.kind === 'reconcile') {
          return loaded.composition.inspect({ invocationRef, expectedInvocationVersion })
        }
        return loaded.composition.command({ invocationRef, expectedInvocationVersion, command })
      },
    },
    creation: {
      create: async () => ({ kind: 'refused', code: 'trial_disabled' }),
    },
    currentVersion: async (invocationRef) => {
      const loaded = await read(invocationRef)
      return loaded.kind === 'loaded' ? loaded.aggregate.invocation.invocationVersion : undefined
    },
  }
}

export async function getHostedPaidOperationRuntime(): Promise<HostedPaidOperationRuntime> {
  const client = await createAuthenticatedConvexClient()
  return createHostedPaidOperationRuntime({ client })
}

// Keep the authenticated mutation references source-visible and typed at this
// composition boundary; command/creation wiring consumes these exact seams.
export const hostedPaidOperationAuthenticatedFunctions = {
  createInitial: sourceMutation('hostedPaidOperation:authenticatedCreateInitial'),
  transact: sourceMutation('hostedPaidOperation:authenticatedTransact'),
} as const
