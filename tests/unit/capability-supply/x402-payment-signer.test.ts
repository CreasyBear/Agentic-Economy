import { decodePaymentSignatureHeader } from '@x402/core/http'
import { declarePaymentIdentifierExtension, extractPaymentIdentifier } from '@x402/extensions/payment-identifier'
import { describe, expect, it } from 'vitest'

import { createEvmX402PaymentSignature } from '@/modules/capability-supply/internal/x402-payment-signer'

describe('x402 route payment signer', () => {
  it('uses the official v2 exact EVM mechanism and preserves the operation identity', async () => {
    const selectedRequirement = {
      scheme: 'exact', network: 'eip155:84532' as const, amount: '10000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C', maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }
    const signature = await createEvmX402PaymentSignature({
      credential: `0x${'11'.repeat(32)}`,
      paymentIdentifier: `sha256:${'ab'.repeat(32)}`,
      selectedRequirement,
      challenge: {
        x402Version: 2,
        resource: { url: 'https://provider.example/paid', description: 'Paid result', mimeType: 'application/json' },
        accepts: [selectedRequirement],
        extensions: { 'payment-identifier': declarePaymentIdentifierExtension(true) },
      },
    })

    expect(signature).toEqual(expect.any(String))
    const payload = decodePaymentSignatureHeader(signature ?? '')
    expect(payload).toMatchObject({
      x402Version: 2,
      accepted: selectedRequirement,
      payload: {
        signature: expect.stringMatching(/^0x[0-9a-f]{130}$/i),
        authorization: {
          from: expect.stringMatching(/^0x[0-9a-f]{40}$/i),
          to: selectedRequirement.payTo,
          value: selectedRequirement.amount,
        },
      },
    })
    expect(extractPaymentIdentifier(payload)).toBe(`ae_sha256_${'ab'.repeat(32)}`)
  })
})
