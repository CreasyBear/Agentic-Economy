import { encodePaymentResponseHeader } from '@x402/core/http'
import type { PaymentRequirements } from '@x402/core/types'
import {
  createOfferEIP712,
  createOfferJWS,
  createReceiptEIP712,
  type SignTypedDataFn,
} from '@x402/extensions/offer-receipt'
import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { verifyX402SignedOffer, verifyX402SignedReceipt } from '@/modules/capability-supply/internal/x402-offer-receipt'

const now = Math.floor(Date.now() / 1000)
const resourceUrl = 'https://provider.example/weather'
const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const otherAccount = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const requirement = {
  scheme: 'exact', network: 'eip155:8453', amount: '100',
  asset: '0x833589fCD6e5BebaC2B0b6B4D8e5cD5B5C3aA123', payTo: account.address,
  maxTimeoutSeconds: 60, extra: {},
} as const

const signer = (selected = account): SignTypedDataFn =>
  async (input) => await selected.signTypedData(input)

const offer = async (
  validitySeconds = 30,
  selected = account,
) => await createOfferEIP712(
  resourceUrl,
  { acceptIndex: 0, ...requirement, offerValiditySeconds: validitySeconds },
  signer(selected),
)

function challenge(
  signedOffers: readonly unknown[],
  accepts: readonly PaymentRequirements[] = [requirement],
) {
  return {
    x402Version: 2 as const,
    resource: { url: resourceUrl },
    accepts: [...accepts],
    extensions: { 'offer-receipt': { info: { offers: [...signedOffers] } } },
  }
}

function receiptResponse(receipt: unknown): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'PAYMENT-RESPONSE': encodePaymentResponseHeader({
        success: true,
        transaction: '0xsettled',
        network: requirement.network,
        extensions: { 'offer-receipt': { info: { receipt } } },
      }),
    },
  })
}

async function verifiedOffer() {
  const result = await verifyX402SignedOffer({
    paymentRequired: challenge([await offer()]),
    selectedRequirement: requirement,
    resourceUrl,
    nowSeconds: now,
  })
  if (result.kind !== 'verified') throw new Error(`offer_fixture_${result.code}`)
  return result.context
}

describe('x402 signed offer and receipt adapter', () => {
  afterEach(() => vi.useRealTimers())

  it('verifies an official EIP-712 offer and receipt round trip', async () => {
    vi.setSystemTime(now * 1_000)
    const context = await verifiedOffer()
    const receipt = await createReceiptEIP712(
      { resourceUrl, payer: account.address, network: requirement.network },
      signer(),
    )
    await expect(verifyX402SignedReceipt({
      response: receiptResponse(receipt),
      offer: context,
      payer: account.address,
      nowSeconds: now,
    })).resolves.toMatchObject({ kind: 'verified' })
  })

  it('refuses absent, tampered, duplicate, wrong-signer, and invalid-validity offers', async () => {
    vi.setSystemTime(now * 1_000)
    const signedOffer = await offer()
    const tampered = { ...signedOffer, signature: `0x${'00'.repeat(65)}` }
    const differentRequirement = { ...requirement, amount: '101' }
    const cases = [
      [challenge([signedOffer], [differentRequirement]), signedOffer, 'offer_requirement_mismatch'],
      [challenge([tampered]), tampered, 'offer_signature_invalid'],
      [challenge([signedOffer, signedOffer]), signedOffer, 'offer_duplicate'],
      [challenge([await offer(30, otherAccount)]), signedOffer, 'offer_signer_mismatch'],
      [challenge([await offer(-1)]), signedOffer, 'offer_expired'],
      [challenge([await offer(61)]), signedOffer, 'offer_validity_invalid'],
    ] as const
    for (const [paymentRequired, , code] of cases) {
      await expect(verifyX402SignedOffer({
        paymentRequired,
        selectedRequirement: requirement,
        resourceUrl,
        nowSeconds: now,
      })).resolves.toEqual({ kind: 'refused', code })
    }
  })

  it('refuses missing, mismatched, future, and stale receipts with exact codes', async () => {
    vi.setSystemTime(now * 1_000)
    const context = await verifiedOffer()
    await expect(verifyX402SignedReceipt({
      response: new Response(null),
      offer: context,
      payer: account.address,
      nowSeconds: now,
    })).resolves.toEqual({ kind: 'refused', code: 'receipt_missing' })

    const receiptCases = [
      [
        await createReceiptEIP712(
          { resourceUrl, payer: account.address, network: requirement.network },
          signer(otherAccount),
        ),
        account.address,
        now,
        'receipt_signer_mismatch',
      ],
      [
        await createReceiptEIP712(
          { resourceUrl, payer: otherAccount.address, network: requirement.network },
          signer(),
        ),
        account.address,
        now,
        'receipt_payload_mismatch',
      ],
      [
        await createReceiptEIP712(
          { resourceUrl: `${resourceUrl}/wrong`, payer: account.address, network: requirement.network },
          signer(),
        ),
        account.address,
        now,
        'receipt_payload_mismatch',
      ],
      [
        await createReceiptEIP712(
          { resourceUrl, payer: account.address, network: 'eip155:1' },
          signer(),
        ),
        account.address,
        now,
        'receipt_payload_mismatch',
      ],
    ] as const
    for (const [receipt, payer, observedAt, code] of receiptCases) {
      await expect(verifyX402SignedReceipt({
        response: receiptResponse(receipt),
        offer: context,
        payer,
        nowSeconds: observedAt,
      })).resolves.toEqual({ kind: 'refused', code })
    }

    vi.setSystemTime((now + 1) * 1_000)
    const futureReceipt = await createReceiptEIP712(
      { resourceUrl, payer: account.address, network: requirement.network },
      signer(),
    )
    await expect(verifyX402SignedReceipt({
      response: receiptResponse(futureReceipt),
      offer: context,
      payer: account.address,
      nowSeconds: now,
    })).resolves.toEqual({ kind: 'refused', code: 'receipt_future' })

    vi.setSystemTime((now - 61) * 1_000)
    const staleReceipt = await createReceiptEIP712(
      { resourceUrl, payer: account.address, network: requirement.network },
      signer(),
    )
    vi.setSystemTime(now * 1_000)
    await expect(verifyX402SignedReceipt({
      response: receiptResponse(staleReceipt),
      offer: context,
      payer: account.address,
      nowSeconds: now,
    })).resolves.toEqual({ kind: 'refused', code: 'receipt_stale' })
  })

  it('refuses a JWS offer whose kid is not did:web before key resolution', async () => {
    vi.setSystemTime(now * 1_000)
    const signedOffer = await createOfferJWS(
      resourceUrl,
      { acceptIndex: 0, ...requirement, offerValiditySeconds: 30 },
      {
        format: 'jws',
        kid: 'did:key:unbound-provider-key',
        algorithm: 'EdDSA',
        sign: async () => 'AA',
      },
    )
    await expect(verifyX402SignedOffer({
      paymentRequired: challenge([signedOffer]),
      selectedRequirement: requirement,
      resourceUrl,
      nowSeconds: now,
    })).resolves.toEqual({ kind: 'refused', code: 'offer_signer_binding_invalid' })
  })
})
