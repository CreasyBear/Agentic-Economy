"use node";

import { v } from 'convex/values'
import { Agent, fetch as guardedFetch } from 'undici'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type X402PaymentSignatureRequest,
  type X402PreparedAuthorization,
  type X402RouteTransportRuntime,
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

export const run = internalAction({
  args: { dispatchRef: v.string() },
  returns: workerResult,
  handler: async (ctx, args) => {
    const opened: {
      kind: 'available'
      invocation: {
        dispatchRef: string; attemptRef: string; runRef: string; operationKeyDigest: string
        inputJson: string; inputDigest: string
        binding: {
          adapterId: string; endpointUrl: string; credentialRef: string
          configJson: string; configDigest: string
        }
        authority: {
          mandateDigest: string; grantDigest: string; capabilityContractDigest: string
          maximumSpend: { currency: string; amountMinor: number }; expiresAt: number
        }
      }
    } | { kind: 'unavailable' } = await ctx.runQuery(
      internal.customerRequestRouteExecution.openDispatch,
      { dispatchRef: args.dispatchRef },
    )
    if (opened.kind !== 'available') return { kind: 'none' as const }

    if (opened.invocation.authority.expiresAt <= Date.now()) {
      await ctx.runMutation(internal.customerRequestRouteExecution.recordNotReleased, {
        dispatchRef: opened.invocation.dispatchRef,
        attemptRef: opened.invocation.attemptRef,
        observationJson: JSON.stringify({
          transport: 'unknown',
          disposition: 'refused',
          releaseStarted: false,
          requestDigest: opened.invocation.inputDigest,
          failureCode: 'authority_expired_before_release',
        }),
      })
      return { kind: 'completed' as const, disposition: 'refused' as const }
    }

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
        observationJson: JSON.stringify(observation),
      })
      return { kind: 'completed' as const, disposition: 'refused' as const }
    }

    const released: { kind: 'recorded' | 'replayed' | 'refused' } = await ctx.runMutation(
      internal.customerRequestRouteExecution.markDispatched,
      {
        dispatchRef: opened.invocation.dispatchRef,
        attemptRef: opened.invocation.attemptRef,
      },
    )
    if (released.kind !== 'recorded') return { kind: 'refused' as const }

    const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
    const fetch: RouteTransportFetch = async (input, init) => await guardedFetch(input, {
      ...init, dispatcher,
    })
    const runtime: X402RouteTransportRuntime = {
      send: fetch,
      resolveCredential,
      x402PaymentSigningAvailable: ({ credentialRef }) =>
        credentialFromEnvironment(credentialRef) !== undefined,
      prepareX402PaymentAuthorization: async (request) => {
        if (credentialFromEnvironment(opened.invocation.binding.credentialRef) === undefined) {
          return undefined
        }
        return await ctx.runMutation(
          internal.customerRequestRouteExecution.prepareX402PaymentAuthorization,
          {
            dispatchRef: opened.invocation.dispatchRef,
            attemptRef: opened.invocation.attemptRef,
            effectGeneration: request.effectGeneration,
            paymentIdentifier: request.paymentIdentifier,
            operationKeyDigest: opened.invocation.operationKeyDigest,
            challengeDigest: request.challengeDigest,
            challengeJson: JSON.stringify(request.challenge),
            selectedRequirementJson: JSON.stringify(request.selectedRequirement),
            providerEndpoint: request.challenge.resource.url,
            credentialRef: opened.invocation.binding.credentialRef,
            scheme: request.selectedRequirement.scheme,
            network: request.selectedRequirement.network,
            asset: request.selectedRequirement.asset,
            payTo: request.selectedRequirement.payTo,
            amount: request.selectedRequirement.amount,
          },
        )
      },
      readX402PaymentAuthorization: async (prepared) =>
        await readX402Authorization(ctx, prepared, false),
      readX402PaymentAuthorizationByDigest: async (prepared) =>
        await readX402Authorization(ctx, prepared, true),
      markX402PaymentPossiblySubmitted: async (event) => {
        await ctx.runMutation(internal.customerRequestRouteExecution.markX402PaymentPossiblySubmitted, {
          dispatchRef: opened.invocation.dispatchRef,
          effectGeneration: 0,
          ...event,
        })
      },
      observeX402PaymentAttempt: async (event) => {
        await ctx.runMutation(internal.customerRequestRouteExecution.observeX402PaymentAttempt, {
          dispatchRef: opened.invocation.dispatchRef,
          effectGeneration: 0,
          ...event,
          evidenceRefs: [...event.evidenceRefs],
        })
      },
    }
    try {
      const observation = await invokePreparedRouteTransport(preparation.prepared, runtime)
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

function routeCallSigningKey(): Readonly<{ keyId: string; secret: string }> | undefined {
  const secret = env.AE_ROUTE_CALL_SIGNING_SECRET
  const keyId = env.AE_ROUTE_CALL_SIGNING_KEY_ID
  return secret === undefined || keyId === undefined ? undefined : { keyId, secret }
}

function credentialFromEnvironment(reference: string): string | undefined {
  const match = /^env:([A-Z][A-Z0-9_]{1,199})$/.exec(reference)
  return match?.[1] === undefined ? undefined : process.env[match[1]]
}
async function readX402Authorization(
  ctx: ActionCtx,
  prepared: X402PreparedAuthorization,
  byDigest: boolean,
): Promise<string | undefined> {
  const material = byDigest
    ? await ctx.runQuery(
        internal.customerRequestRouteExecution.readX402PaymentAuthorizationByDigest,
        prepared,
      )
    : await ctx.runQuery(
        internal.customerRequestRouteExecution.readX402PaymentAuthorization,
        prepared,
      )
  if (material === null || material.state !== 'prepared') return undefined
  const credential = credentialFromEnvironment(material.credentialRef)
  if (credential === undefined) return undefined
  try {
    const challenge = JSON.parse(material.challengeJson) as X402PaymentSignatureRequest['challenge']
    const selectedRequirement = JSON.parse(
      material.selectedRequirementJson,
    ) as X402PaymentSignatureRequest['selectedRequirement']
    if (canonicalDigest(challenge as StableHashValue) !== material.challengeDigest) return undefined
    return await createEvmX402PaymentSignature({
      challenge,
      credential,
      paymentIdentifier: material.paymentIdentifier,
      selectedRequirement,
    })
  } catch {
    return undefined
  }
}
