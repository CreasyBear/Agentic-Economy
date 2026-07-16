"use node";

import { v } from 'convex/values'
import { Agent, fetch as guardedFetch } from 'undici'

import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
} from '@/modules/capability-supply/route-transport-runtime'
import { createEvmX402PaymentSignature, signRouteTransportCall } from '@/modules/capability-supply/server'

import { internal } from './_generated/api'
import { env, internalAction, type ActionCtx } from './_generated/server'

const workerResult = v.union(
  v.object({ kind: v.literal('none') }),
  v.object({ kind: v.literal('completed'), disposition: v.union(
    v.literal('succeeded'), v.literal('refused'), v.literal('partial'), v.literal('unknown'),
  ) }),
  v.object({ kind: v.literal('refused') }),
)

export const runNext = internalAction({
  args: { workerId: v.string() },
  returns: workerResult,
  handler: async (ctx, args) => {
    const leased: Awaited<ReturnType<typeof leaseNext>> = await leaseNext(ctx, args.workerId)
    if (leased.kind !== 'leased') return { kind: 'none' as const }
    const opened: Awaited<ReturnType<typeof openLease>> = await openLease(ctx, leased.dispatch.dispatchRef, args.workerId)
    if (opened.kind !== 'available') return { kind: 'refused' as const }
    const signing = routeCallSigningKey()
    const callIdentity = signing === undefined ? undefined : signRouteTransportCall({
      dispatchRef: opened.invocation.dispatchRef,
      attemptRef: opened.invocation.attemptRef,
      operationKeyDigest: opened.invocation.operationKeyDigest,
      mandateDigest: opened.invocation.authority.mandateDigest,
      grantDigest: opened.invocation.authority.grantDigest,
      capabilityContractDigest: opened.invocation.authority.capabilityContractDigest,
      inputDigest: opened.invocation.inputDigest,
      binding: opened.invocation.binding,
      maximumSpend: opened.invocation.authority.maximumSpend,
      expiresAt: opened.invocation.authority.expiresAt,
    }, signing)
    const invocation: RouteTransportInvocation | undefined = callIdentity === undefined ? undefined : {
      binding: opened.invocation.binding,
      inputJson: opened.invocation.inputJson,
      authority: {
        attemptRef: opened.invocation.attemptRef,
        operationKeyDigest: opened.invocation.operationKeyDigest,
        mandateDigest: opened.invocation.authority.mandateDigest,
        grantDigest: opened.invocation.authority.grantDigest,
        capabilityContractDigest: opened.invocation.authority.capabilityContractDigest,
        maximumSpend: opened.invocation.authority.maximumSpend,
        expiresAt: opened.invocation.authority.expiresAt,
        callIdentity,
      },
    }
    const resolveCredential = (reference: string) => credentialFromEnvironment(reference)
    const preparation = invocation === undefined
      ? undefined
      : prepareRegisteredRouteTransportInvocation(invocation, resolveCredential)
    if (preparation === undefined || preparation.kind === 'refused'
      || !await isPublicHttpTarget(preparation.prepared.endpoint, defaultDnsResolver)) {
      const observation = preparation?.kind === 'refused' ? preparation.observation : {
        transport: 'unknown' as const, disposition: 'refused' as const, releaseStarted: false,
        requestDigest: opened.invocation.inputDigest,
        failureCode: preparation === undefined ? 'call_signing_unavailable' : 'endpoint_not_public',
      }
      await ctx.runMutation(internal.customerRequestRouteExecution.recordNotReleased, {
        dispatchRef: opened.invocation.dispatchRef,
        attemptRef: opened.invocation.attemptRef,
        workerId: args.workerId,
        observationJson: JSON.stringify(observation),
      })
      return { kind: 'completed' as const, disposition: 'refused' as const }
    }
    const released: { kind: 'recorded' | 'replayed' | 'refused' } = await ctx.runMutation(
      internal.customerRequestRouteExecution.markDispatched,
      {
        dispatchRef: opened.invocation.dispatchRef,
        attemptRef: opened.invocation.attemptRef,
        workerId: args.workerId,
      },
    )
    if (released.kind === 'refused') return { kind: 'refused' as const }

    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    const fetch: RouteTransportFetch = async (input, init) => await guardedFetch(input, {
      ...init, dispatcher,
    })
    try {
      const observation = await invokePreparedRouteTransport(preparation.prepared, {
        send: fetch,
        resolveCredential,
        createX402PaymentSignature: createEvmX402PaymentSignature,
      })
      const outcome = observation.disposition === 'succeeded' && observation.outputJson !== undefined
        ? { kind: 'succeeded' as const, outputJson: observation.outputJson }
        : observation.disposition === 'partial' && observation.outputJson !== undefined
          ? { kind: 'partial' as const, outputJson: observation.outputJson }
        : observation.disposition === 'refused'
          ? { kind: 'failed' as const }
          : { kind: 'unknown' as const }
      await ctx.runMutation(internal.customerRequestRouteExecution.recordOutcome, {
        attemptRef: opened.invocation.attemptRef,
        operationKeyDigest: opened.invocation.operationKeyDigest,
        observationJson: JSON.stringify(observation),
        outcome,
      })
      return { kind: 'completed' as const, disposition: observation.disposition }
    } finally {
      await dispatcher.close().catch(() => undefined)
    }
  },
})

async function leaseNext(
  ctx: ActionCtx,
  workerId: string,
) {
  return await ctx.runMutation(internal.customerRequestRouteExecution.leaseNextDispatch, {
    workerId, leaseDurationMs: 60_000,
  }) as {
    kind: 'none' | 'refused' | 'leased'
    dispatch: { dispatchRef: string }
  }
}

async function openLease(
  ctx: ActionCtx,
  dispatchRef: string,
  workerId: string,
) {
  return await ctx.runQuery(internal.customerRequestRouteExecution.openLeasedDispatch, {
    dispatchRef, workerId,
  }) as {
    kind: 'available'
    invocation: {
      dispatchRef: string; attemptRef: string; runRef: string; operationKeyDigest: string
      inputJson: string; inputDigest: string
      binding: { adapterId: string; endpointUrl: string; credentialRef: string; configJson: string; configDigest: string }
      authority: {
        mandateDigest: string; grantDigest: string; capabilityContractDigest: string
        maximumSpend: { currency: string; amountMinor: number }; expiresAt: number
      }
    }
  } | { kind: 'unavailable' }
}

function routeCallSigningKey(): Readonly<{ keyId: string; secret: string }> | undefined {
  const secret = env.AE_ROUTE_CALL_SIGNING_SECRET
  const keyId = env.AE_ROUTE_CALL_SIGNING_KEY_ID
  return secret === undefined || keyId === undefined ? undefined : { keyId, secret }
}

function credentialFromEnvironment(reference: string): string | undefined {
  const match = /^env:([A-Z][A-Z0-9_]{1,199})$/.exec(reference)
  return match?.[1] === undefined ? undefined : process.env[match[1]]
}
