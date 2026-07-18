import { v } from 'convex/values'

import {
  allocateEgress as allocateEgressMachine,
  beginDispatch as beginDispatchMachine,
  egressStatus as egressStatusMachine,
  openReconciliation as openReconciliationMachine,
  reconcileUncertain as reconcileUncertainMachine,
  resolveDispatch as resolveDispatchMachine,
  unresolvedForRequest as unresolvedForRequestMachine,
} from '@/modules/customer-request/v2-preparation-egress'

import { internalMutation, internalQuery } from './_generated/server'
import { customerRequestV2PreparationEgressPorts } from './customerRequestV2PreparationEgressPorts'

const terminalState = v.union(v.literal('released'), v.literal('not_released'), v.literal('uncertain'))

export const allocate = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    preparationRef: v.string(), now: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal('allocated'), operationRefs: v.array(v.string()) }),
    v.object({ kind: v.literal('replayed'), operationRefs: v.array(v.string()) }),
    v.object({ kind: v.literal('conflict'), reason: v.literal('idempotency_key_reused') }),
    v.object({ kind: v.literal('needs_attention'), reason: v.union(
      v.literal('preparation_not_ready'), v.literal('capability_graph_changed'), v.literal('authority_changed'),
      v.literal('capacity_exceeded'), v.literal('allocation_limit_exceeded'),
      v.literal('unsupported_recipient'), v.literal('no_eligible_bindings'),
    ) }),
  ),
  handler: async (ctx, args) => (
    await allocateEgressMachine(args, customerRequestV2PreparationEgressPorts(ctx))
  ),
})

export const beginDispatch = internalMutation({
  args: { operationRef: v.string(), principalId: v.string(), now: v.number() },
  returns: v.union(
    v.object({ kind: v.literal('dispatch'), endpointUrl: v.string(), credentialRef: v.string(),
      adapterId: v.string(), configJson: v.string(), bodyText: v.string(), dispatchAttemptRef: v.string() }),
    v.object({ kind: v.literal('in_flight') }),
    v.object({ kind: v.literal('terminal'), state: terminalState }),
    v.object({ kind: v.literal('needs_attention') }),
  ),
  handler: async (ctx, args) => (
    await beginDispatchMachine(args, customerRequestV2PreparationEgressPorts(ctx))
  ),
})

export const resolveDispatch = internalMutation({
  args: {
    operationRef: v.string(), state: terminalState, evidenceRef: v.string(), now: v.number(),
    dispatchAttemptRef: v.string(),
    responseStatus: v.optional(v.number()), responseContentType: v.optional(v.string()),
    responseBodyDigest: v.optional(v.string()), responseBodyText: v.optional(v.string()),
    failureCode: v.optional(v.string()),
  },
  returns: terminalState,
  handler: async (ctx, args) => (
    await resolveDispatchMachine(args, customerRequestV2PreparationEgressPorts(ctx))
  ),
})

export const reconcileUncertain = internalMutation({
  args: {
    operationRef: v.string(), disposition: v.union(
      v.literal('released'), v.literal('not_released'), v.literal('uncertain'),
    ), providerEvidenceRef: v.string(), responseDigest: v.string(), evidenceDigest: v.string(), observedAt: v.number(),
  },
  returns: terminalState,
  handler: async (ctx, args) => (
    await reconcileUncertainMachine(args, customerRequestV2PreparationEgressPorts(ctx))
  ),
})

export const status = internalQuery({
  args: { preparationRef: v.string(), principalId: v.string() },
  returns: v.object({ operationCount: v.number(), states: v.array(v.object({
    operationRef: v.string(), state: v.union(
      v.literal('allocated'), v.literal('dispatching'), v.literal('released'),
      v.literal('not_released'), v.literal('uncertain'),
    ),
  })) }),
  handler: async (ctx, args) => (
    await egressStatusMachine(args, customerRequestV2PreparationEgressPorts(ctx)) as {
      operationCount: number
      states: Array<{
        operationRef: string
        state: 'allocated' | 'dispatching' | 'released' | 'not_released' | 'uncertain'
      }>
    }
  ),
})

export const unresolvedForRequest = internalQuery({
  args: { requestId: v.string(), principalId: v.string() },
  returns: v.array(v.object({ operationRef: v.string(), requestRevision: v.number() })),
  handler: async (ctx, args) => (
    await unresolvedForRequestMachine(args, customerRequestV2PreparationEgressPorts(ctx))
  ),
})

export const openReconciliation = internalQuery({
  args: { operationRef: v.string(), principalId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('available'), endpointUrl: v.string(), credentialRef: v.string(),
      adapterId: v.string(), configJson: v.string() }),
    v.object({ kind: v.literal('unavailable') }),
  ),
  handler: async (ctx, args) => (
    await openReconciliationMachine(args, customerRequestV2PreparationEgressPorts(ctx))
  ),
})
