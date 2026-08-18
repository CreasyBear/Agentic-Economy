"use node";

import { v, type Infer } from 'convex/values'

import {
  reconcileEgress as reconcileEgressMachine,
  resumeEgress as resumeEgressMachine,
  resumeRequestEgress as resumeRequestEgressMachine,
  runEgress as runEgressMachine,
} from '@/modules/customer-request/v2-preparation-egress'

import { internalAction } from './_generated/server'
import { customerRequestV2PreparationEgressActionPorts } from './customerRequestV2PreparationEgressActionPorts'

const completedStates = v.array(v.object({
  operationRef: v.string(), state: v.union(
    v.literal('released'), v.literal('not_released'), v.literal('uncertain'), v.literal('in_flight'),
  ),
}))
const runResultValue = v.union(
  v.object({ kind: v.literal('completed'), states: completedStates }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('needs_attention') }),
)
const resumeResultValue = v.union(
  v.object({ kind: v.literal('completed'), states: completedStates }),
  v.object({ kind: v.literal('needs_attention') }),
)
const resumeRequestResultValue = v.union(
  v.object({
    kind: v.literal('completed'), states: v.array(v.object({
      operationRef: v.string(), requestRevision: v.number(), state: v.union(
        v.literal('released'), v.literal('not_released'), v.literal('uncertain'), v.literal('in_flight'),
      ),
    })),
  }),
  v.object({ kind: v.literal('needs_attention'), operations: v.array(v.object({
    operationRef: v.string(), requestRevision: v.number(),
  })) }),
)
const reconcileResultValue = v.union(
  v.object({ kind: v.literal('reconciled'), state: v.union(
    v.literal('released'), v.literal('not_released'), v.literal('uncertain'),
  ) }),
  v.object({ kind: v.literal('unavailable') }),
)

export const run = internalAction({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    preparationRef: v.string(), now: v.number(),
  },
  returns: runResultValue,
  handler: async (ctx, args): Promise<Infer<typeof runResultValue>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await runEgressMachine(
      args,
      customerRequestV2PreparationEgressActionPorts(ctx),
    ) as Infer<typeof runResultValue>
  )
  },
})

export const resume = internalAction({
  args: { preparationRef: v.string(), principalId: v.string() },
  returns: resumeResultValue,
  handler: async (ctx, args): Promise<Infer<typeof resumeResultValue>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await resumeEgressMachine(
      args,
      customerRequestV2PreparationEgressActionPorts(ctx),
    ) as Infer<typeof resumeResultValue>
  )
  },
})

export const resumeRequest = internalAction({
  args: { requestId: v.string(), principalId: v.string() },
  returns: resumeRequestResultValue,
  handler: async (ctx, args): Promise<Infer<typeof resumeRequestResultValue>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await resumeRequestEgressMachine(
      args,
      customerRequestV2PreparationEgressActionPorts(ctx),
    ) as Infer<typeof resumeRequestResultValue>
  )
  },
})

export const reconcile = internalAction({
  args: { operationRef: v.string(), principalId: v.string() },
  returns: reconcileResultValue,
  handler: async (ctx, args): Promise<Infer<typeof reconcileResultValue>> => {
    throw new Error('customer_request_tables_unlisted')
    return (
    await reconcileEgressMachine(
      args,
      customerRequestV2PreparationEgressActionPorts(ctx),
    ) as Infer<typeof reconcileResultValue>
  )
  },
})
