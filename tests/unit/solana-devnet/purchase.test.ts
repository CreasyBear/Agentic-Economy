import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http'
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from '@x402/core/types'
import { describe, expect, it } from 'vitest'

import { DEVNET, DEVNET_USDC_MINT, MAINNET, SOLANA_DEVNET, parseAgentId, parseCluster, type SolanaCluster } from '../../../tools/solana-devnet/devnet'
import { purchaseOnDevnet, type PurchaseDependencies } from '../../../tools/solana-devnet/purchase'
import { devnetUsdc } from '../../../tools/solana-devnet/spend-cap'

const TOOL_URL = 'http://localhost:4021/gst?amount=110.00'
const BUYER = 'DvPfonYgpQUioqHPaHuCarbEL782REoqHUtA9aXNHq2Q'
const SELLER = '6uw4oq47C5mKDUUgrTgJtDjMoBmvA9gZ9pb4MeTsgbsg'
const NOW = new Date('2026-10-12T01:00:00.000Z')

const SIGNATURE = '3wUyUNw7Wvgbhkbi5XYYTSTG9EnEp2QpkeYeGuHfn6CHGcg62bYcXnCGY1KdRRfimpgLdV1U75j2iQxjJzFqLjaq'

function requirementOn(cluster: SolanaCluster): PaymentRequirements {
  return {
    scheme: 'exact',
    network: cluster.caip2,
    asset: cluster.usdcMint,
    amount: '10000',
    payTo: SELLER,
    maxTimeoutSeconds: 60,
    extra: { feePayer: 'CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5' },
  }
}

function devnetSeller(signed: PaymentPayload[], options: { cluster?: SolanaCluster, settledPayer?: string } = {}): PurchaseDependencies {
  const cluster = options.cluster ?? DEVNET
  const requirement = requirementOn(cluster)
  const challenge: PaymentRequired = { x402Version: 2, resource: { url: TOOL_URL }, accepts: [requirement] }
  return {
    now: () => NOW,
    fetch: async (_url, init) => {
      const headers = new Headers(init?.headers)
      if (!headers.has('PAYMENT-SIGNATURE')) {
        return new Response('{}', { status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(challenge) } })
      }
      return Response.json({ gstAud: '10.00' }, {
        headers: {
          'PAYMENT-RESPONSE': encodePaymentResponseHeader({
            success: true,
            transaction: SIGNATURE,
            network: cluster.caip2,
            payer: options.settledPayer ?? BUYER,
          }),
        },
      })
    },
    payer: {
      address: async () => BUYER,
      createPaymentPayload: async () => {
        const payload: PaymentPayload = { x402Version: 2, accepted: requirement, payload: { transaction: 'signed' } }
        signed.push(payload)
        return payload
      },
    },
  }
}

describe('Solana x402 purchase', () => {
  it('refuses a Call priced over the per-Call cap before anything is signed', async () => {
    const signed: PaymentPayload[] = []
    const receipt = await purchaseOnDevnet(
      { cluster: DEVNET, agentId: parseAgentId('demo'), toolUrl: TOOL_URL, cap: { perCall: devnetUsdc('0.005'), daily: devnetUsdc('1') }, spentToday: devnetUsdc('0') },
      devnetSeller(signed),
    )

    expect(signed).toEqual([])
    expect(receipt).toEqual({
      network: 'solana-devnet',
      caip2: SOLANA_DEVNET,
      agentId: 'demo',
      toolUrl: TOOL_URL,
      priceUsdc: '0.010000',
      priceAtomic: '10000',
      asset: DEVNET_USDC_MINT,
      payTo: SELLER,
      capCheck: {
        outcome: 'refused',
        reason: 'over_per_call_cap',
        perCallCapUsdc: '0.005000',
        dailyCapUsdc: '1.000000',
        spentTodayUsdc: '0.000000',
      },
      requestedAt: '2026-10-12T01:00:00.000Z',
      capCheckedAt: '2026-10-12T01:00:00.000Z',
      outcome: 'refused',
    })
  })

  it('refuses a Call that would take the day over the daily cap before anything is signed', async () => {
    const signed: PaymentPayload[] = []
    const receipt = await purchaseOnDevnet(
      { cluster: DEVNET, agentId: parseAgentId('demo'), toolUrl: TOOL_URL, cap: { perCall: devnetUsdc('0.05'), daily: devnetUsdc('0.015') }, spentToday: devnetUsdc('0.01') },
      devnetSeller(signed),
    )

    expect(signed).toEqual([])
    expect([receipt.outcome, receipt.capCheck.reason]).toEqual(['refused', 'over_daily_cap'])
  })

  it('signs once and records the settlement when the price fits both caps', async () => {
    const signed: PaymentPayload[] = []
    const receipt = await purchaseOnDevnet(
      { cluster: DEVNET, agentId: parseAgentId('demo'), toolUrl: TOOL_URL, cap: { perCall: devnetUsdc('0.01'), daily: devnetUsdc('0.02') }, spentToday: devnetUsdc('0.01') },
      devnetSeller(signed),
    )

    expect(signed).toHaveLength(1)
    expect(receipt).toMatchObject({
      outcome: 'settled',
      payer: BUYER,
      signature: SIGNATURE,
      explorerUrl: `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet`,
      toolResponse: { gstAud: '10.00' },
      discrepancies: [],
    })
  })

  it('pays mainnet USDC on the mainnet network with an explorer link without a cluster parameter', async () => {
    const signed: PaymentPayload[] = []
    const receipt = await purchaseOnDevnet(
      { cluster: parseCluster('mainnet'), agentId: parseAgentId('demo'), toolUrl: TOOL_URL, cap: { perCall: devnetUsdc('0.01'), daily: devnetUsdc('0.02') }, spentToday: devnetUsdc('0') },
      devnetSeller(signed, { cluster: MAINNET }),
    )

    expect(signed).toHaveLength(1)
    expect(receipt).toMatchObject({
      network: 'solana',
      caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      outcome: 'settled',
      explorerUrl: `https://explorer.solana.com/tx/${SIGNATURE}`,
      discrepancies: [],
    })
  })

  it('refuses a mainnet Call over the per-Call cap before anything is signed', async () => {
    const signed: PaymentPayload[] = []
    const receipt = await purchaseOnDevnet(
      { cluster: MAINNET, agentId: parseAgentId('demo'), toolUrl: TOOL_URL, cap: { perCall: devnetUsdc('0.005'), daily: devnetUsdc('0.02') }, spentToday: devnetUsdc('0') },
      devnetSeller(signed, { cluster: MAINNET }),
    )

    expect(signed).toEqual([])
    expect([receipt.network, receipt.outcome, receipt.capCheck.reason]).toEqual(['solana', 'refused', 'over_per_call_cap'])
  })

  it('rejects a devnet-only challenge when the agent is on mainnet, before signing', async () => {
    const signed: PaymentPayload[] = []
    await expect(purchaseOnDevnet(
      { cluster: MAINNET, agentId: parseAgentId('demo'), toolUrl: TOOL_URL, cap: { perCall: devnetUsdc('0.01'), daily: devnetUsdc('0.02') }, spentToday: devnetUsdc('0') },
      devnetSeller(signed),
    )).rejects.toThrow(/offers no exact solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp USDC payment/)
    expect(signed).toEqual([])
  })

  it('records a settlement payer mismatch in the receipt instead of throwing after money moved', async () => {
    const signed: PaymentPayload[] = []
    const receipt = await purchaseOnDevnet(
      { cluster: MAINNET, agentId: parseAgentId('demo'), toolUrl: TOOL_URL, cap: { perCall: devnetUsdc('0.01'), daily: devnetUsdc('0.02') }, spentToday: devnetUsdc('0') },
      devnetSeller(signed, { cluster: MAINNET, settledPayer: SELLER }),
    )

    expect(receipt).toMatchObject({
      outcome: 'settled',
      signature: SIGNATURE,
      payer: BUYER,
      discrepancies: [`settlement payer ${SELLER} is not the agent wallet ${BUYER}`],
    })
  })

  it('rejects an unknown --network value', () => {
    expect(() => parseCluster('testnet')).toThrow(/devnet or mainnet/)
  })
})
