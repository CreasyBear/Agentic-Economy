import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type ProviderConnectionAuthorityLookup,
  type RouteTransportInvocation,
  type RouteTransportRuntime,
  type X402PaymentSignatureRequest,
  type X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export const authorityCommon = {
  attemptRef: 'route-step-attempt:v1:attempt',
  operationKeyDigest: 'sha256:operation',
  mandateDigest: 'sha256:mandate',
  grantDigest: 'sha256:grant',
  capabilityContractDigest: 'sha256:contract',
  maximumSpend: { currency: 'USD', units: '125', exponent: 2 },
  expiresAt: Date.now() + 60 * 60 * 1_000,
  callIdentity: {
    keyId: 'route-calls:2026-07',
    signature: 'hmac-sha256:signed-call',
  },
} as const
export const providerAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:test-provider',
  providerRef: 'provider:test',
} as const
export const authority = {
  ...authorityCommon,
  authorityGeneration: 1,
  authorityDigest: canonicalDigest({
    connectionRef: providerAuthority.connectionRef,
    providerRef: providerAuthority.providerRef,
    authorityGeneration: 1,
  }),
} as const
export const keylessAuthority = { kind: 'public_upstream' } as const

type ProviderInvocation = Extract<
  RouteTransportInvocation,
  {
    readonly binding: {
      readonly authority: { readonly kind: 'provider_connection' }
    }
  }
>
type KeylessInvocation = Extract<
  RouteTransportInvocation,
  { readonly binding: { readonly authority: { readonly kind: 'public_upstream' } } }
>
type ProviderInvocationOverrides = Readonly<{
  binding?: ProviderInvocation['binding']
  authority?: ProviderInvocation['authority']
  inputJson?: string
}>
type KeylessInvocationOverrides = Readonly<{
  binding?: KeylessInvocation['binding']
  authority?: KeylessInvocation['authority']
  inputJson?: string
}>

export function invocation(
  overrides: ProviderInvocationOverrides = {},
): ProviderInvocation {
  const config = {
    method: 'POST' as const,
    requestTimeoutMs: 5_000,
    credential: { kind: 'bearer' as const },
  }
  return {
    binding: overrides.binding ?? {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://provider.example/run',
      authority: providerAuthority,
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: overrides.authority ?? authority,
    inputJson: overrides.inputJson ?? JSON.stringify({ destination: 'PER' }),
  }
}

export function keylessInvocation(
  overrides: KeylessInvocationOverrides = {},
): KeylessInvocation {
  const config = { method: 'POST' as const, requestTimeoutMs: 5_000 }
  return {
    binding: overrides.binding ?? {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://provider.example/run',
      authority: keylessAuthority,
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: overrides.authority ?? authorityCommon,
    inputJson: overrides.inputJson ?? JSON.stringify({ destination: 'PER' }),
  }
}

export const PROVIDER_CREDENTIAL_REF = 'env:PROVIDER_SECRET'
export const X402_PAYMENT_CREDENTIAL_REF = 'env:AE_X402_PAYMENT_PRIVATE_KEY'

export function providerCredentialReader(
  input: ProviderConnectionAuthorityLookup,
  expectedAdapterId = 'http-json:v1',
) {
  return input.connectionRef === providerAuthority.connectionRef &&
    input.providerRef === providerAuthority.providerRef &&
    input.adapterId === expectedAdapterId &&
    input.authorityGeneration === authority.authorityGeneration &&
    input.authorityDigest === authority.authorityDigest
    ? { kind: 'resolved' as const, credentialRef: PROVIDER_CREDENTIAL_REF }
    : { kind: 'unavailable' as const, reason: 'stale_generation' as const }
}
function providerAuthorityValidator(
  input: ProviderConnectionAuthorityLookup,
  expectedAdapterId = 'http-json:v1',
) {
  return input.connectionRef === providerAuthority.connectionRef &&
    input.providerRef === providerAuthority.providerRef &&
    input.adapterId === expectedAdapterId &&
    input.authorityGeneration === authority.authorityGeneration &&
    input.authorityDigest === authority.authorityDigest
    ? { kind: 'valid' as const }
    : { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
}

export async function invokeRouteTransport(
  routeInvocation: RouteTransportInvocation,
  runtime: RouteTransportRuntime,
) {
  const preparation = prepareRegisteredRouteTransportInvocation(
    routeInvocation,
    runtime.x402PaymentSigningAvailable,
  )
  if (preparation.kind === 'refused') return preparation.observation
  const effectiveRuntime =
    routeInvocation.binding.adapterId === 'x402-fetch:v2'
      ? {
          ...runtime,
          readX402PaymentCredentialRef:
            runtime.readX402PaymentCredentialRef ??
            (() => X402_PAYMENT_CREDENTIAL_REF),
        }
      : runtime
  if (routeInvocation.binding.authority.kind === 'public_upstream') {
    return invokePreparedRouteTransport(preparation.prepared, effectiveRuntime)
  }
  return invokePreparedRouteTransport(preparation.prepared, {
    ...effectiveRuntime,
    readProviderConnectionCredentialRef:
      runtime.readProviderConnectionCredentialRef ??
      ((input) =>
        providerCredentialReader(input, routeInvocation.binding.adapterId)),
    validateProviderConnectionAuthority:
      runtime.validateProviderConnectionAuthority ??
      ((input) =>
        providerAuthorityValidator(input, routeInvocation.binding.adapterId)),
  })
}

type RegisteredBinding =
  ProviderInvocation['binding'] | KeylessInvocation['binding']

export function registeredBinding(
  adapterId: string,
  endpointUrl: string,
  bindingAuthority: typeof providerAuthority,
  config: Readonly<Record<string, StableHashValue>>,
): ProviderInvocation['binding']
export function registeredBinding(
  adapterId: string,
  endpointUrl: string,
  bindingAuthority: typeof keylessAuthority,
  config: Readonly<Record<string, StableHashValue>>,
): KeylessInvocation['binding']
export function registeredBinding(
  adapterId: string,
  endpointUrl: string,
  bindingAuthority: typeof providerAuthority | typeof keylessAuthority,
  config: Readonly<Record<string, StableHashValue>>,
): RegisteredBinding {
  if (bindingAuthority.kind === 'provider_connection') {
    return {
      adapterId,
      endpointUrl,
      authority: bindingAuthority,
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    }
  }
  return {
    adapterId,
    endpointUrl,
    authority: bindingAuthority,
    configJson: JSON.stringify(config),
    configDigest: canonicalDigest(config),
  }
}

export function resolveProviderCredential(credential: string) {
  return (reference: string) =>
    reference === PROVIDER_CREDENTIAL_REF ? credential : undefined
}
export function preparedX402Custody(
  create: (request: X402PaymentSignatureRequest) => Promise<string | undefined>,
): Pick<
  X402RouteTransportRuntime,
  | 'prepareX402PaymentAuthorization'
  | 'readX402PaymentAuthorization'
  | 'readX402PaymentAuthorizationByDigest'
  | 'verifyX402Settlement'
> {
  const custody = new Map<
    string,
    Readonly<{
      authorizationDigest: string
      paymentSignature: string
    }>
  >()
  return {
    prepareX402PaymentAuthorization: async (request) => {
      const paymentSignature = await create(request)
      if (paymentSignature === undefined || paymentSignature.length === 0)
        return undefined
      const custodyRef = canonicalDigest({
        kind: 'test-x402-custody:v1',
        paymentIdentifier: request.paymentIdentifier,
        challengeDigest: request.challengeDigest,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      })
      const authorizationDigest = canonicalDigest(paymentSignature)
      custody.set(custodyRef, { authorizationDigest, paymentSignature })
      return { custodyRef, authorizationDigest }
    },
    readX402PaymentAuthorization: async ({
      custodyRef,
      authorizationDigest,
    }) => {
      const prepared = custody.get(custodyRef)
      return prepared?.authorizationDigest === authorizationDigest
        ? prepared.paymentSignature
        : undefined
    },
    readX402PaymentAuthorizationByDigest: async ({
      custodyRef,
      authorizationDigest,
    }) => {
      const prepared = custody.get(custodyRef)
      return prepared?.authorizationDigest === authorizationDigest
        ? prepared.paymentSignature
        : undefined
    },
    verifyX402Settlement: async () => true,
  }
}

export function neverEndingResponse(
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Readonly<{ response: Response; wasCanceled: () => boolean }> {
  let canceled = false
  return {
    response: new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          canceled = true
        },
      }),
      { status, headers },
    ),
    wasCanceled: () => canceled,
  }
}
