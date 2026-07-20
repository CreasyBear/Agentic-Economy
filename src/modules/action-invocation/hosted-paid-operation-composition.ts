import type { ActionResult } from '@/modules/common/action'

import type { InvocationActor } from './contracts'
import {
  createPaidOperationApplicationService,
  type PaidOperationApplicationResult,
  type PaidOperationCommand,
  type PaidOperationCommandPort,
  type PaidOperationProjection,
} from './paid-operation-application-service'
import type {
  HostedPaidOperationAggregate,
  HostedPaidOperationPort,
} from './hosted-paid-operation-port'

export type HostedPaidOperationCompositionResult =
  | PaidOperationApplicationResult<PaidOperationProjection>
  | Readonly<{ kind: 'refused'; code: 'aggregate_incomplete' }>

export type HostedPaidOperationComposition = Readonly<{
  inspect(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
  }>): Promise<HostedPaidOperationCompositionResult>
  command(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    command: PaidOperationCommand
  }>): Promise<HostedPaidOperationCompositionResult>
}>

/**
 * Request-scoped composition only: one bounded load feeds the unchanged
 * synchronous application service, and every mutation reloads committed state.
 */
export function createHostedPaidOperationComposition<Result extends ActionResult>(input: Readonly<{
  actor: InvocationActor
  persistence: HostedPaidOperationPort<Result>
  commands: PaidOperationCommandPort<Result>
}>): HostedPaidOperationComposition {
  const load = async (invocationRef: string) => input.persistence.loadComplete({
    owner: input.actor,
    invocationRef,
  })

  const withLoaded = async (
    invocationRef: string,
    run: (
      aggregate: HostedPaidOperationAggregate<Result>,
      reloadCommittedHostedAggregate: () => Promise<HostedPaidOperationAggregate<Result> | undefined>,
    ) => Promise<PaidOperationApplicationResult<PaidOperationProjection>> |
      PaidOperationApplicationResult<PaidOperationProjection>,
  ): Promise<HostedPaidOperationCompositionResult> => {
    const loaded = await load(invocationRef)
    if (loaded.kind === 'aggregate_incomplete') {
      return { kind: 'refused', code: 'aggregate_incomplete' }
    }
    if (loaded.kind === 'not_found') return { kind: 'refused', code: 'invocation_not_found' }
    let aggregate = loaded.aggregate
    const reloadCommittedHostedAggregate = async () => {
      const refreshed = await load(invocationRef)
      if (refreshed.kind !== 'loaded') return undefined
      aggregate = refreshed.aggregate
      return aggregate
    }
    return run(aggregate, reloadCommittedHostedAggregate)
  }

  return Object.freeze({
    inspect: ({ invocationRef, expectedInvocationVersion }) =>
      withLoaded(invocationRef, (initial) => serviceFor(initial).inspect({
        invocationRef,
        expectedInvocationVersion,
      })),
    command: ({ invocationRef, expectedInvocationVersion, command }) =>
      withLoaded(invocationRef, async (initial, reloadCommittedHostedAggregate) => {
        let current = initial
        const commands: PaidOperationCommandPort<Result> = {
          authorize: async (args) => {
            await input.commands.authorize(args)
            current = await reloadCommittedHostedAggregate() ?? current
            return current.invocation
          },
          execute: async (args) => {
            await input.commands.execute(args)
            current = await reloadCommittedHostedAggregate() ?? current
            return current.invocation
          },
          reconcile: async (args) => {
            await input.commands.reconcile(args)
            current = await reloadCommittedHostedAggregate() ?? current
            return current.invocation
          },
        }
        return serviceFor(initial, () => current, commands).command({
          invocationRef,
          expectedInvocationVersion,
          command,
        })
      }),
  })

  function serviceFor(
    initial: HostedPaidOperationAggregate<Result>,
    current: () => HostedPaidOperationAggregate<Result> = () => initial,
    commands: PaidOperationCommandPort<Result> = input.commands,
  ) {
    return createPaidOperationApplicationService({
      actor: input.actor,
      interpreter: { interpret: () => current().interpretation },
      reads: {
        loadInvocation: () => current().invocation,
        loadPaymentAttempt: () => current().paymentAttempt,
      },
      commands,
    })
  }
}
