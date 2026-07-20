import type {
  RouteTransportFetch,
  RouteTransportRuntime,
} from './route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'

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
): RouteTransportRuntime {
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
      return response(402, '', {
        'payment-required': Buffer.from(JSON.stringify(
          developmentChallenge(endpoint, url),
        )).toString('base64'),
      })
    }
    effects.provider += 1
    observer({ kind: 'provider_release', detail: { endpoint: String(url), providerCalls: effects.provider } })
    observer({ kind: 'provider_response', detail: { status: 200, evidence: 'quote_data' } })
    return response(200, JSON.stringify({
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
      'payment-response': 'mock:payment-proof',
      'provider-receipt': 'mock:provider-receipt',
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
    x402PaymentSigningAvailable: () => true,
    createX402PaymentSignature: async (request) => {
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
      return paymentSignature
    },
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
        custodyRef: `development-custody:${identity}`,
        authorizationDigest: canonicalDigest(paymentSignature),
      }
      prepared.set(identity, authorization)
      return authorization
    },
    readX402PaymentAuthorization: async ({ authorizationDigest }) =>
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
    resolveCredential: () => undefined,
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

export function developmentReconciliableLostResponseRuntime(
  endpoint: string,
  effects: DevelopmentEffectCounts,
  expectedAttemptRef: string,
  observer: DevelopmentTransportObserver = () => undefined,
): Readonly<{
  runtime: RouteTransportRuntime
  reconcile: (attemptRef: string) => Readonly<{
    resolution: 'released'
    evidence: 'provider_ledger'
    attemptRef: string
  }> | undefined
}> {
  const releasedAttempts = new Set<string>()
  const base = developmentLostResponseRuntime(endpoint, effects, (event) => {
    observer(event)
    if (event.kind === 'provider_release') {
      releasedAttempts.add(expectedAttemptRef)
    }
  })
  return {
    runtime: base,
    reconcile: (attemptRef) => {
      observer({
        kind: 'provider_reconciliation',
        detail: { attemptRef, released: releasedAttempts.has(attemptRef), automated: true },
      })
      return releasedAttempts.has(attemptRef)
        ? { resolution: 'released', evidence: 'provider_ledger', attemptRef }
        : undefined
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
      return response(200, JSON.stringify({ unexpected: true }), {
        'payment-response': 'mock:payment-proof',
        'provider-receipt': 'mock:provider-refusal-receipt',
      })
    },
  }
}

function developmentChallenge(endpoint: string, requestUrl?: string | URL) {
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

function response(status: number, body: string, headers: Record<string, string>) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  }
}
