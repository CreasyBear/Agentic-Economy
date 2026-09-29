import { expect, it, vi } from 'vitest'

import {
  inspectLiveX402Requirement,
  persistedManagedX402Requirement,
  type LiveX402InspectionTarget,
} from '@/modules/capability-execution/live-x402-requirement'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  encodeX402PaymentRequiredHeader,
  type X402PaymentRequired,
} from '@/modules/capability-supply/server'

const endpointUrl = 'https://seller.example.test/v1/enrich'
const payTo = '0x0000000000000000000000000000000000000002'

function challenge(amount = '1000'): X402PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: endpointUrl },
    accepts: [{
      scheme: 'exact',
      network: BASE_MAINNET_NETWORK,
      amount,
      asset: BASE_MAINNET_USDC_ADDRESS,
      payTo,
      maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }] as X402PaymentRequired['accepts'],
  }
}

function operation(amount = '1000'): LiveX402InspectionTarget {
  return {
    runtimeEnvironment: 'production',
    pricingConfig: {
      version: 'pricing:v3',
      kind: 'managed_x402',
      effectTiming: 'payment_required_before_effect',
      sourceRequirement: {
        network: BASE_MAINNET_NETWORK,
        asset: BASE_MAINNET_USDC_ADDRESS,
        atomicUnits: amount,
      },
      pricingPolicyRef: 'pricing-policy:managed-x402:v1',
      publicDisplay: 'on_request',
    },
    identity: {
      endpoint: { method: 'POST', url: endpointUrl },
      payment: { kind: 'x402', payTo },
    },
    transport: {
      configJson: JSON.stringify({
        method: 'POST',
        requestTimeoutMs: 10000,
        scheme: 'exact',
        network: BASE_MAINNET_NETWORK,
        currency: 'USD',
        routeAmountExponent: 6,
        assetAmountExponent: 6,
        asset: BASE_MAINNET_USDC_ADDRESS,
        payTo,
        paymentRequiredJson: JSON.stringify(challenge(amount)),
      }),
    },
  }
}

it('prices an approval quote from the pinned requirement without contacting the provider', async () => {
  const send = vi.fn()
  const bound = persistedManagedX402Requirement(operation(), { query: 'Ada' }, 1_000)
  expect(send).not.toHaveBeenCalled()
  expect(bound.kind).toBe('observed')
  if (bound.kind !== 'observed') throw new Error('pinned requirement missing')
  const live = await inspectLiveX402Requirement(operation(), { query: 'Ada' }, {
    now: () => 1_000,
    validatePublicTarget: async () => true,
    send: async () => new Response(null, {
      status: 402,
      headers: { 'payment-required': encodeX402PaymentRequiredHeader(challenge()) },
    }),
  })
  expect(live.kind).toBe('observed')
  if (live.kind !== 'observed') throw new Error('live requirement missing')
  expect(bound.requirement.requirementDigest).toBe(live.requirement.requirementDigest)
  expect(JSON.parse(bound.requirement.requirementJson).requirement.amountUnits).toBe('1000')
})

it('refuses a pinned amount that does not match the published atomic units', () => {
  const mismatched = operation('1000')
  const pricing = mismatched.pricingConfig
  if (pricing.kind !== 'managed_x402') throw new Error('fixture')
  const refused = persistedManagedX402Requirement({
    ...mismatched,
    pricingConfig: {
      ...pricing,
      sourceRequirement: { ...pricing.sourceRequirement, atomicUnits: '100' },
    },
  }, { query: 'Ada' }, 1_000)
  expect(refused).toEqual({ kind: 'refused' })
})
