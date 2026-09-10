import type { ExactAmount } from '@/modules/money/public'
import type {
  ProviderConnectionAuthorityValidation,
  ProviderConnectionLeaseAuthorityValidation,
} from '../provider-connection'

import type { CapabilityTransportAuthority } from './transport-terms-schema'

/**
 * Route transport invocation/authority shapes, split out of
 * `route-transport-call.ts` (and the authority half out of
 * `route-transport-http-json.ts`) so the concrete transport implementations
 * (http-json, mcp, x402, cancel) can depend on the shared invocation
 * contract directly instead of importing it back from the orchestrator -
 * avoiding an `internal/x.ts -> route-transport-call.ts -> internal/x.ts`
 * round-trip. `route-transport-call.ts` still owns dispatch and imports
 * these types from here too.
 */
export type RouteTransportAuthorityCommon = Readonly<{
  attemptRef: string
  effectGeneration?: number
  operationKeyDigest: string
  mandateDigest: string
  grantDigest: string
  capabilityContractDigest: string
  maximumSpend: ExactAmount
  expiresAt: number
  callIdentity: Readonly<{ keyId: string; signature: string }>
}>

export type PublicUpstreamRouteTransportAuthority = RouteTransportAuthorityCommon &
  Readonly<{
    authorityGeneration?: never
    authorityDigest?: never
  }>

export type ProviderRouteTransportAuthority = RouteTransportAuthorityCommon &
  Readonly<{
    authorityGeneration: number
    authorityDigest: string
    leaseRef?: string
    callRef?: string
    toolRef?: string
    grantedScopes?: readonly string[]
    grantedResources?: readonly string[]
    readinessValidUntil?: number
    readinessDigest?: string
  }>

export type RouteTransportBinding<Authority extends CapabilityTransportAuthority> =
  Readonly<{
    adapterId: string
    endpointUrl: string
    authority: Authority
    configJson: string
    configDigest: string
  }>

export type PublicUpstreamRouteTransportInvocation = Readonly<{
  binding: RouteTransportBinding<
    Extract<CapabilityTransportAuthority, { kind: 'public_upstream' }>
  >
  authority: PublicUpstreamRouteTransportAuthority
  inputJson: string
  committedPaymentRequiredJson?: string
}>

export type ProviderRouteTransportInvocation = Readonly<{
  binding: RouteTransportBinding<
    Extract<CapabilityTransportAuthority, { kind: 'provider_connection' }>
  >
  authority: ProviderRouteTransportAuthority
  inputJson: string
  committedPaymentRequiredJson?: string
}>

export type RouteTransportInvocation =
  PublicUpstreamRouteTransportInvocation | ProviderRouteTransportInvocation

type RouteTransportCancellationInvocationFor<
  Invocation extends RouteTransportInvocation,
> = Readonly<{
  binding: Invocation['binding']
  authority: Invocation['authority']
  cancellationRequestRef: string
}>

export type { RouteTransportCancellationInvocationFor }

export type RouteTransportCancellationInvocation =
  | RouteTransportCancellationInvocationFor<PublicUpstreamRouteTransportInvocation>
  | RouteTransportCancellationInvocationFor<ProviderRouteTransportInvocation>

export type ProviderConnectionAuthorityLookup = Readonly<{
  connectionRef: string
  providerRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
  leaseRef?: string
  callRef?: string
  toolRef?: string
  grantedScopes?: readonly string[]
  grantedResources?: readonly string[]
  readinessValidUntil?: number
  readinessDigest?: string
}>

export type ProviderConnectionAuthorityValidationResult =
  | ProviderConnectionAuthorityValidation
  | ProviderConnectionLeaseAuthorityValidation
