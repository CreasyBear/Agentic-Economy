"use node";

import { v } from 'convex/values'
import { Agent, fetch as guardedFetch } from 'undici'

import {
  invokeRegisteredRouteCancellation,
  type RouteTransportCancellationInvocation,
  type RouteTransportFetch,
} from '@/modules/capability-supply/route-transport-runtime'
import { signRouteTransportCall } from '@/modules/capability-supply/server'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'

import { internal } from './_generated/api'
import { env, internalAction, type ActionCtx } from './_generated/server'

export const run = internalAction({
  args: { cancellationRef: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const opened = await openCancellation(ctx, args.cancellationRef)
    if (opened.kind !== 'available') return null
    const signing = routeCallSigningKey()
    const callIdentity = signing === undefined ? undefined : signRouteTransportCall({
      dispatchRef: opened.invocation.cancellationRef,
      attemptRef: opened.invocation.attemptRef,
      operationKeyDigest: opened.invocation.operationKeyDigest,
      mandateDigest: opened.invocation.authority.mandateDigest,
      grantDigest: opened.invocation.authority.grantDigest,
      capabilityContractDigest: opened.invocation.authority.capabilityContractDigest,
      inputDigest: opened.invocation.cancellationRef,
      binding: opened.invocation.binding,
      maximumSpend: opened.invocation.authority.maximumSpend,
      expiresAt: opened.invocation.authority.expiresAt,
    }, signing)
    const endpoint = safeUrl(opened.invocation.binding.endpointUrl)
    const publicTarget = endpoint !== undefined && await isPublicHttpTarget(endpoint, defaultDnsResolver)
    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    const send: RouteTransportFetch = async (input, init) => await guardedFetch(input, {
      ...init, dispatcher,
    })
    const observation = callIdentity === undefined || !publicTarget
      ? {
          disposition: 'unknown' as const,
          requestDigest: opened.invocation.cancellationRef,
          failureCode: callIdentity === undefined ? 'call_signing_unavailable' : 'endpoint_not_public',
        }
      : await invokeRegisteredRouteCancellation(
          {
            binding: opened.invocation.binding,
            authority: { ...opened.invocation.authority, attemptRef: opened.invocation.attemptRef,
              operationKeyDigest: opened.invocation.operationKeyDigest, callIdentity },
            cancellationRequestRef: opened.invocation.cancellationRef,
          } satisfies RouteTransportCancellationInvocation,
          {
            send,
            resolveCredential: credentialFromEnvironment,
            createX402PaymentSignature: async () => undefined,
          },
        )
    try {
      await ctx.runMutation(internal.customerRequestRouteExecution.resolveCancellationAttempt, {
        cancellationRef: args.cancellationRef,
        observation,
      })
      return null
    } finally {
      await dispatcher.close().catch(() => undefined)
    }
  },
})

async function openCancellation(ctx: ActionCtx, cancellationRef: string) {
  return await ctx.runQuery(internal.customerRequestRouteExecution.openCancellationAttempt, {
    cancellationRef,
  }) as {
    kind: 'available'
    invocation: {
      cancellationRef: string; attemptRef: string; operationKeyDigest: string
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

function safeUrl(value: string): URL | undefined {
  try { return new URL(value) } catch { return undefined }
}
