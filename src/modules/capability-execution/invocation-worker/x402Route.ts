import { Agent } from 'undici'
import type {
  ProviderConnectionAuthorityValidator,
  RouteTransportInvocation,
} from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedOperation } from '@/modules/capability-supply/public'
import type { ExactAmount } from '@/modules/money/public'
import { env, type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { OpenDispatch } from '../../../../convex/capabilityOperationInvocationProjection'
import type { ConnectionAuthority, ProviderLeaseAuthority } from './lease'
import { createX402PaymentCallbacks } from './x402Authorization'
import type { X402PaymentCallbacks } from './x402Authorization'

export {
  bestEffortReleaseX402ExternalSpend,
  configuredX402RpcUrl,
  configuredX402RpcUrls,
  externalSpendIdentityFromAttempt,
  externalSpendPaymentFactsFromDispatch,
  finalizeX402ExternalSpend,
  readX402EvmReceipt,
  recordX402TransportObservation,
  releaseX402ExternalSpendBeforeSubmission,
  reverseX402ExternalSpendForInvalidOutput,
  settleX402TransportObservation,
} from './x402Settlement'
export { createX402PaymentCallbacks, readX402Authorization } from './x402Authorization'
export type { ExternalSpendSettlement, X402TransportObservationRecord } from './x402Settlement'
export type { X402PaymentCallbacks } from './x402Authorization'

/** The only production x402 credential locator. It identifies the CDP account name, not a secret. */
export const BROKERED_X402_MANAGED_CUSTODY_REF = 'env:AE_X402_CDP_ACCOUNT_NAME' as const

type ProviderRouteBinding = Extract<
  RouteTransportInvocation['binding'],
  { readonly authority: { readonly kind: 'provider_connection' } }
>
type KeylessRouteBinding = Extract<
  RouteTransportInvocation['binding'],
  { readonly authority: { readonly kind: 'keyless' } }
>
type ProviderRouteInvocation = Extract<
  RouteTransportInvocation,
  { readonly binding: ProviderRouteBinding }
>
type KeylessRouteInvocation = Extract<
  RouteTransportInvocation,
  { readonly binding: KeylessRouteBinding }
>

export function routeCallSigningKey(): Readonly<{ keyId: string; secret: string }> | undefined {
  const keyId = env.AE_ROUTE_CALL_SIGNING_KEY_ID
  const secret = env.AE_ROUTE_CALL_SIGNING_SECRET
  return keyId === undefined || secret === undefined ? undefined : { keyId, secret }
}

export function brokeredProviderAuthorityValidator(
  ctx: ActionCtx,
  connectionAuthority: ConnectionAuthority,
): ProviderConnectionAuthorityValidator {
  return async (lookup) => {
    if (
      lookup.leaseRef !== undefined
      || lookup.connectionRef !== connectionAuthority.connectionRef
      || lookup.providerRef !== connectionAuthority.providerRef
      || lookup.adapterId !== connectionAuthority.adapterId
      || lookup.authorityGeneration !== connectionAuthority.authorityGeneration
      || lookup.authorityDigest !== connectionAuthority.authorityDigest
    ) return { kind: 'unavailable' as const, reason: 'lease_identity_mismatch' as const }
    const authority = await ctx.runQuery(internal.capabilityOperationInvocations.readProviderLeaseAuthority, {
      connectionRef: connectionAuthority.connectionRef,
      authorityGeneration: connectionAuthority.authorityGeneration,
    })
    return authority !== null
      && authority.providerRef === connectionAuthority.providerRef
      && authority.adapterId === connectionAuthority.adapterId
      && authority.authorityDigest === connectionAuthority.authorityDigest
      ? { kind: 'valid' as const }
      : { kind: 'unavailable' as const, reason: 'connection_not_found' as const }
  }
}

export function createBrokeredX402PaymentCallbacks(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    operation: PublishedOperation
    connectionAuthority: ConnectionAuthority
    durableAttemptRef: string
    effectGeneration: number
    operationKeyDigest: string
    dispatcher: Agent
    onPaymentPossiblySubmitted: () => void
  }>,
): X402PaymentCallbacks {
  return createX402PaymentCallbacks(ctx, {
    ...input,
    validateProviderAuthority: brokeredProviderAuthorityValidator(ctx, input.connectionAuthority),
    useCustodySigner: true,
  })
}

export function routeInvocation(
  baseBinding: Readonly<{
    adapterId: string
    endpointUrl: string
    authority: { kind: 'keyless' } | { kind: 'provider_connection'; connectionRef: string; providerRef: string }
    configJson: string
    configDigest: string
  }>,
  input: Record<string, unknown>,
  common: Readonly<{
    attemptRef: string
    effectGeneration: number
    operationKeyDigest: string
    mandateDigest: string
    grantDigest: string
    capabilityContractDigest: string
    maximumSpend: ExactAmount
    expiresAt: number
    callIdentity: Readonly<{ keyId: string; signature: string }>
  }>,
  leaseRef: string | undefined,
  leaseAuthority: Readonly<{
    authorityGeneration: number
    authorityDigest: string
    grantedScopes: readonly string[]
    grantedResources: readonly string[]
  }> | undefined,
  invocationRef: string,
  operationRef: string,
  readinessValidUntil: number,
  readinessDigest: string,
  connectionAuthority: ConnectionAuthority | undefined,
  paymentMaximumSpend?: ExactAmount,
): RouteTransportInvocation {
  const inputJson = JSON.stringify(input)
  if (baseBinding.authority.kind === 'keyless') {
    return {
      binding: baseBinding as KeylessRouteBinding,
      inputJson,
      authority: common,
    } as KeylessRouteInvocation
  }
  if (connectionAuthority === undefined) {
    throw new Error('provider_lease_missing')
  }
  if (leaseAuthority === undefined || leaseRef === undefined) {
    return {
      binding: baseBinding as ProviderRouteBinding,
      inputJson,
      authority: {
        ...common,
        ...(paymentMaximumSpend === undefined ? {} : { maximumSpend: paymentMaximumSpend }),
        authorityGeneration: connectionAuthority.authorityGeneration,
        authorityDigest: connectionAuthority.authorityDigest,
      },
    } as ProviderRouteInvocation
  }
  return {
    binding: baseBinding as ProviderRouteBinding,
    inputJson,
    authority: {
      ...common,
      authorityGeneration: leaseAuthority.authorityGeneration,
      authorityDigest: leaseAuthority.authorityDigest,
      leaseRef,
      invocationRef,
      operationRef,
      grantedScopes: leaseAuthority.grantedScopes,
      grantedResources: leaseAuthority.grantedResources,
      readinessValidUntil,
      readinessDigest,
    },
  } as ProviderRouteInvocation
}
