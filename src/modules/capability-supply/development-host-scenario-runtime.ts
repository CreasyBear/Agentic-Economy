import type {
  RouteTransportFetch,
  RouteTransportRuntime,
} from './route-transport-runtime'

export type DevelopmentEffectCounts = {
  payment: number
  provider: number
}

export function developmentSuccessRuntime(
  endpoint: string,
  effects: DevelopmentEffectCounts,
): RouteTransportRuntime {
  const challenge = developmentChallenge(endpoint)
  const send: RouteTransportFetch = async (_url, init) => {
    if (init?.headers?.['Payment-Signature'] === undefined) {
      return response(402, '', {
        'payment-required': Buffer.from(JSON.stringify(challenge)).toString('base64'),
      })
    }
    effects.provider += 1
    return response(200, JSON.stringify({ data: { BTC: { price: 1 } } }), {
      'payment-response': 'mock:payment-proof',
      'provider-receipt': 'mock:provider-receipt',
    })
  }
  return {
    send,
    resolveCredential: () => 'mock:server-held-credential',
    x402PaymentSigningAvailable: () => true,
    createX402PaymentSignature: async () => {
      effects.payment += 1
      return 'mock:payment-signature'
    },
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
): RouteTransportRuntime {
  const base = developmentSuccessRuntime(endpoint, effects)
  let sends = 0
  return {
    ...base,
    send: async (url, init) => {
      sends += 1
      if (sends === 2) {
        effects.provider += 1
        throw new Error('lost_x402_response')
      }
      return await base.send(url, init)
    },
  }
}

function developmentChallenge(endpoint: string) {
  return {
    x402Version: 2,
    resource: { url: `${endpoint}?symbol=BTC&convert=USD` },
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
