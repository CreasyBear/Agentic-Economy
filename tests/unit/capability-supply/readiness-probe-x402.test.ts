import { describe, expect, it, vi } from 'vitest'
import { validatePaymentRequired } from '@x402/core/schemas'

import { encodeX402PaymentRequiredHeader, type X402PaymentRequired } from '@/modules/capability-supply/server'
import { runCapabilityReadinessProbe } from '@/modules/capability-supply/internal/readiness-probe'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import timezoneX402PaymentRequiredPin from '@/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json'

import { keylessAuthority, target } from './readiness-probe-harness'

function colonSeparatedNetwork(value: string): `${string}:${string}` {
  const separator = value.indexOf(':')
  if (separator <= 0 || separator >= value.length - 1) {
    throw new Error(`x402_network_not_colon_separated:${value}`)
  }
  return `${value.slice(0, separator)}:${value.slice(separator + 1)}`
}

function pinPaymentRequired(value: unknown): string {
  const paymentRequired = validatePaymentRequired(value)
  if (paymentRequired.x402Version !== 2) {
    throw new Error('x402_payment_required_v2_expected')
  }
  return stableStringify(paymentRequired as StableHashValue)
}

describe('capability readiness probe', () => {
  it('validates an x402 PaymentRequired challenge and exact amount', async () => {
    const paymentRequired: X402PaymentRequired = {
      x402Version: 2,
      resource: { url: target.endpointUrl },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '12000000',
        asset: '0xasset',
        payTo: '0xpayee',
        maxTimeoutSeconds: 30,
        extra: {},
      }],
    }
    const challenge = encodeX402PaymentRequiredHeader(paymentRequired)
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('POST')
      await expect(request.json()).resolves.toMatchObject({ operation: 'quote' })
      expect(request.headers.has('Payment-Signature')).toBe(false)
      return new Response(null, { status: 402, headers: { 'Payment-Required': challenge } })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'x402-fetch:v2',
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact',
        network: 'eip155:8453', currency: 'USD', routeAmountExponent: 2,
        assetAmountExponent: 6, asset: '0xasset', payTo: '0xpayee',
        paymentRequiredJson: pinPaymentRequired(paymentRequired),
      }),
      expectedPaymentJson: JSON.stringify({
        scheme: 'exact', network: 'eip155:8453', asset: '0xasset', payTo: '0xpayee',
        currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
        paidAmount: { currency: 'USD', units: '1200', exponent: 2 },
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      targetDigest: target.targetDigest,
      responseStatus: 402,
      outcome: 'healthy',
      credentialState: 'ready',
      healthState: 'healthy',
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:x402_payment_required_valid'],
    })
    expect(result.requestDigest).toMatch(/^sha256:/)
    expect(result.responseDigest).toMatch(/^sha256:/)
  })

  it('rejects an x402 challenge with a mismatched payee or amount', async () => {
    const intendedPaymentRequired = {
      x402Version: 2,
      resource: { url: target.endpointUrl },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '12000000',
        asset: '0xasset',
        payTo: '0xpayee',
        maxTimeoutSeconds: 30,
        extra: {},
      }],
    } as const
    const challenge = encodeX402PaymentRequiredHeader({
      x402Version: 2,
      resource: { url: target.endpointUrl },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1',
        asset: '0xasset',
        payTo: '0xother',
        maxTimeoutSeconds: 30,
        extra: {},
      }],
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'x402-fetch:v2',
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact',
        network: 'eip155:8453', currency: 'USD', routeAmountExponent: 2,
        assetAmountExponent: 6, asset: '0xasset', payTo: '0xpayee',
        paymentRequiredJson: pinPaymentRequired(intendedPaymentRequired),
      }),
      expectedPaymentJson: JSON.stringify({
        scheme: 'exact', network: 'eip155:8453', asset: '0xasset', payTo: '0xpayee',
        currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
        paidAmount: { currency: 'USD', units: '1200', exponent: 2 },
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(null, { status: 402, headers: { 'Payment-Required': challenge } }),
      now: () => 10_000,
    })
    expect(result.outcome).toBe('response_invalid')
    expect(result.evidenceRefs).toContain('probe:x402_payment_required_mismatch')
  })
  it('rejects a malformed x402 PaymentRequired header', async () => {
    const paymentRequired = {
      x402Version: 2,
      resource: { url: target.endpointUrl },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '12000000',
        asset: '0xasset',
        payTo: '0xpayee',
        maxTimeoutSeconds: 30,
        extra: {},
      }],
    } as const
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'x402-fetch:v2',
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact',
        network: 'eip155:8453', currency: 'USD', routeAmountExponent: 2,
        assetAmountExponent: 6, asset: '0xasset', payTo: '0xpayee',
        paymentRequiredJson: pinPaymentRequired(paymentRequired),
      }),
      expectedPaymentJson: JSON.stringify({
        scheme: 'exact', network: 'eip155:8453', asset: '0xasset', payTo: '0xpayee',
        currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
        paidAmount: { currency: 'USD', units: '1200', exponent: 2 },
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(null, { status: 402, headers: { 'Payment-Required': 'not-base64' } }),
      now: () => 10_000,
    })
    expect(result.outcome).toBe('response_invalid')
    expect(result.evidenceRefs).toContain('probe:x402_payment_required_invalid')
  })

  it('matches a GET x402 PaymentRequired resource URL that includes the probe query', async () => {
    const paymentRequired = validatePaymentRequired(timezoneX402PaymentRequiredPin.paymentRequired)
    if (paymentRequired.x402Version !== 2) throw new Error('pin missing v2')
    const accepted = timezoneX402PaymentRequiredPin.paymentRequired.accepts[0]
    if (accepted === undefined) throw new Error('pin missing accepts')
    const challenge = encodeX402PaymentRequiredHeader({
      x402Version: 2,
      resource: { url: timezoneX402PaymentRequiredPin.paymentRequired.resource.url },
      accepts: [{
        scheme: 'exact',
        network: colonSeparatedNetwork(accepted.network),
        amount: accepted.amount,
        asset: accepted.asset,
        payTo: accepted.payTo,
        maxTimeoutSeconds: accepted.maxTimeoutSeconds,
        extra: accepted.extra,
      }],
    })
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('GET')
      expect(request.url).toBe(timezoneX402PaymentRequiredPin.paymentRequired.resource.url)
      expect(request.headers.has('Payment-Signature')).toBe(false)
      return new Response(null, { status: 402, headers: { 'Payment-Required': challenge } })
    })
    const result = await runCapabilityReadinessProbe({
      publicationRef: 'offering:timezone:convert',
      revision: 1,
      bindingId: 'binding:timezone:x402',
      capabilityId: 'timezone-convert-x402',
      endpointUrl: 'https://402timezones.vercel.app/api/convert-timezone',
      authority: keylessAuthority,
      adapterId: 'x402-fetch:v2',
      probeMethod: 'GET',
      probeInputJson: JSON.stringify({ from: 'UTC', to: 'America/New_York', time: '12:00' }),
      transportConfigJson: JSON.stringify({
        method: 'GET',
        requestTimeoutMs: 5_000,
        query: [
          { parameter: 'from', inputPointer: '/from' },
          { parameter: 'to', inputPointer: '/to' },
          { parameter: 'time', inputPointer: '/time' },
        ],
        scheme: 'exact',
        network: accepted.network,
        currency: 'USD',
        routeAmountExponent: 3,
        assetAmountExponent: 6,
        asset: accepted.asset,
        payTo: accepted.payTo,
        paymentRequiredJson: pinPaymentRequired(paymentRequired),
      }),
      expectedPaymentJson: JSON.stringify({
        scheme: 'exact',
        network: accepted.network,
        asset: accepted.asset,
        payTo: accepted.payTo,
        currency: 'USD',
        routeAmountExponent: 3,
        assetAmountExponent: 6,
        paidAmount: { currency: 'USD', units: '1', exponent: 3 },
      }),
      targetDigest: canonicalDigest({
        publicationRef: 'offering:timezone:convert',
        revision: 1,
        bindingId: 'binding:timezone:x402',
        capabilityId: 'timezone-convert-x402',
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      outcome: 'healthy',
      credentialState: 'ready',
      healthState: 'healthy',
      responseStatus: 402,
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:x402_payment_required_valid'],
    })
  })
})
