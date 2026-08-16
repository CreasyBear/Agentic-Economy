import type {
  RouteTransportFetch,
  RouteTransportRuntime,
  X402RouteTransportRuntime,
} from './route-transport-runtime'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  encodeX402PaymentRequiredHeader,
  encodeX402PaymentResponseHeader,
  type X402PaymentRequired,
} from './server'
import { developmentProviderConnectionAuthorityDigest } from './development-published-operation-evidence'

export type DevelopmentEffectCounts = {
  payment: number
  provider: number
}

export type DevelopmentTransportTraceEvent = Readonly<{
  kind:
    | 'transport_request'
    | 'payment_signature_requested'
    | 'payment_signature_created'
    | 'provider_release'
    | 'provider_response'
    | 'provider_response_lost'
    | 'provider_reconciliation'
  detail: Readonly<Record<string, string | number | boolean>>
}>

export type DevelopmentTransportObserver = (event: DevelopmentTransportTraceEvent) => void

export function developmentSuccessRuntime(
  endpoint: string,
  effects: DevelopmentEffectCounts,
  observer: DevelopmentTransportObserver = () => undefined,
): X402RouteTransportRuntime {
  const send: RouteTransportFetch = async (url, init) => {
    observer({
      kind: 'transport_request',
      detail: {
        endpoint: String(url),
        method: init?.method ?? 'GET',
        paymentSignaturePresent: init?.headers?.['Payment-Signature'] !== undefined,
      },
    })
    if (init?.headers?.['Payment-Signature'] === undefined) {
      return new Response('', {
        status: 402,
        headers: {
          'payment-required': encodeX402PaymentRequiredHeader(developmentChallenge(endpoint, url)),
        },
      })
    }
    effects.provider += 1
    observer({ kind: 'provider_release', detail: { endpoint: String(url), providerCalls: effects.provider } })
    observer({ kind: 'provider_response', detail: { status: 200, evidence: 'quote_data' } })
    return new Response(JSON.stringify({
      data: {
        BTC: {
          symbol: 'BTC',
          quote: {
            USD: {
              price: 118_245.12,
              last_updated: '2026-07-19T08:00:00.000Z',
            },
          },
        },
      },
    }), {
      status: 200,
      headers: {
        'payment-response': encodeX402PaymentResponseHeader({
          success: true,
          transaction: 'development:mock-payment',
          network: developmentChallenge(endpoint, url).accepts[0]!.network,
          amount: developmentChallenge(endpoint, url).accepts[0]!.amount,
          payer: 'development:mock-payer',
        }),
        'provider-receipt': 'mock:provider-receipt',
      },
    })
  }
  const prepared = new Map<string, Readonly<{
    custodyRef: string
    authorizationDigest: string
  }>>()
  const paymentSignature = 'mock:payment-signature'
  return {
    send,
    resolveCredential: () => 'mock:server-held-credential',
    readX402PaymentCredentialRef: () => 'env:AE_X402_PAYMENT_PRIVATE_KEY',
    readProviderConnectionCredentialRef: (input) => {
      if (
        input.connectionRef !== 'connection:mock-provider'
        || input.providerRef !== 'provider:mock-provider'
        || input.adapterId !== 'x402-fetch:v2'
        || input.authorityGeneration !== 1
      ) return { kind: 'unavailable' as const, reason: 'stale_generation' as const }
      const authorityDigest = developmentProviderConnectionAuthorityDigest({
        connectionRef: 'connection:mock-provider',
        businessId: 'mock:business:published-api',
        providerRef: 'provider:mock-provider',
        adapterId: 'x402-fetch:v2',
      })
      return input.authorityDigest === authorityDigest
        ? { kind: 'resolved' as const, credentialRef: 'connection:mock-provider' }
        : { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
    },
    validateProviderConnectionAuthority: (input) =>
      input.connectionRef === 'connection:mock-provider'
        && input.providerRef === 'provider:mock-provider'
        && input.adapterId === 'x402-fetch:v2'
        && input.authorityGeneration === 1
        ? { kind: 'valid' as const }
        : { kind: 'unavailable' as const, reason: 'stale_generation' as const },
    x402PaymentSigningAvailable: () => true,
    verifyX402Settlement: async () => true,
    prepareX402PaymentAuthorization: async (request) => {
      const identity = canonicalDigest({
        paymentIdentifier: request.paymentIdentifier,
        challengeDigest: request.challengeDigest,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      })
      const existing = prepared.get(identity)
      if (existing !== undefined) return existing
      observer({
        kind: 'payment_signature_requested',
        detail: {
          network: request.selectedRequirement.network,
          asset: request.selectedRequirement.asset,
          payTo: request.selectedRequirement.payTo,
          amount: request.selectedRequirement.amount,
        },
      })
      effects.payment += 1
      observer({ kind: 'payment_signature_created', detail: { paymentAttempts: effects.payment } })
      const authorization = {
        custodyRef: canonicalDigest({
          kind: 'development-x402-custody:v1',
          identity,
        } as StableHashValue),
        authorizationDigest: canonicalDigest(paymentSignature),
      }
      prepared.set(identity, authorization)
      return authorization
    },
    readX402PaymentAuthorization: async ({ custodyRef, authorizationDigest }) =>
      [...prepared.values()].some((value) =>
        value.custodyRef === custodyRef && value.authorizationDigest === authorizationDigest)
        ? paymentSignature
        : undefined,
    readX402PaymentAuthorizationByDigest: async ({ authorizationDigest }) =>
      authorizationDigest === canonicalDigest(paymentSignature) ? paymentSignature : undefined,
  }
}

export function developmentPreflightRefusalRuntime(
  endpoint: string,
  effects: DevelopmentEffectCounts,
): RouteTransportRuntime {
  const base = developmentSuccessRuntime(endpoint, effects)
  return {
    ...base,
    x402PaymentSigningAvailable: () => false,
  }
}

export function developmentLostResponseRuntime(
  endpoint: string,
  effects: DevelopmentEffectCounts,
  observer: DevelopmentTransportObserver = () => undefined,
): RouteTransportRuntime {
  const base = developmentSuccessRuntime(endpoint, effects, observer)
  let sends = 0
  return {
    ...base,
    send: async (url, init) => {
      sends += 1
      if (sends === 2) {
        observer({
          kind: 'transport_request',
          detail: { endpoint: String(url), method: init?.method ?? 'GET', paymentSignaturePresent: true },
        })
        effects.provider += 1
        observer({ kind: 'provider_release', detail: { endpoint: String(url), providerCalls: effects.provider } })
        observer({ kind: 'provider_response_lost', detail: { attempt: sends } })
        throw new Error('lost_x402_response')
      }
      return await base.send(url, init)
    },
  }
}

export function developmentProviderTimeoutRuntime(
  endpoint: string,
  effects: DevelopmentEffectCounts,
): RouteTransportRuntime {
  const base = developmentSuccessRuntime(endpoint, effects)
  let sends = 0
  return {
    ...base,
    send: async (url, init) => {
      sends += 1
      if (sends === 2) {
        effects.provider += 1
        return await new Promise<never>(() => {})
      }
      return await base.send(url, init)
    },
  }
}

export function developmentReleasedRefusalRuntime(
  endpoint: string,
  effects: DevelopmentEffectCounts,
): RouteTransportRuntime {
  const base = developmentSuccessRuntime(endpoint, effects)
  return {
    ...base,
    send: async (url, init) => {
      if (init?.headers?.['Payment-Signature'] === undefined) {
        return await base.send(url, init)
      }
      effects.provider += 1
      const [requirement] = developmentChallenge(endpoint, url).accepts
      if (requirement === undefined) {
        throw new Error('development_challenge_missing_requirement')
      }
      // Settlement must verify so the refusal is attributable to the invalid
      // body rather than to an undecodable payment proof.
      return new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: {
          'payment-response': encodeX402PaymentResponseHeader({
            success: true,
            transaction: 'development:mock-payment-refusal',
            network: requirement.network,
            amount: requirement.amount,
            payer: 'development:mock-payer',
          }),
          'provider-receipt': 'mock:provider-refusal-receipt',
        },
      })
    },
  }
}

function developmentChallenge(endpoint: string, requestUrl?: string | URL): X402PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: requestUrl === undefined ? `${endpoint}?symbol=BTC&convert=USD` : String(requestUrl) },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '10000',
      asset: '0xmock-usdc',
      payTo: '0xmock-provider-recipient',
      maxTimeoutSeconds: 30,
      extra: {},
    }],
  }
}

