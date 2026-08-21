import {
  decodePaymentSignatureHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http'
import { declarePaymentIdentifierExtension, extractPaymentIdentifier } from '@x402/extensions/payment-identifier'
import { describe, expect, it } from 'vitest'

import {
  createSandboxEvmX402PaymentSignature,
  readX402PaymentPayerAndNonce,
} from '@/modules/capability-supply/internal/x402-payment-signer'

describe('x402 route payment signer', () => {
  it('uses the official v2 exact EVM mechanism and preserves the operation identity', async () => {
    const selectedRequirement = {
      scheme: 'exact', network: 'eip155:84532' as const, amount: '10000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C', maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }
    const signature = await createSandboxEvmX402PaymentSignature({
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
    expect(readX402PaymentPayerAndNonce(signature ?? '')).toMatchObject({
      payer: expect.stringMatching(/^0x[0-9a-f]{40}$/i),
      nonce: expect.stringMatching(/^0x[0-9a-f]{64}$/i),
    })
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
  it('refuses to sign when the challenge does not bind the payment identifier extension', async () => {
    const requirement = {
      scheme: 'exact',
      network: 'eip155:84532' as const,
      amount: '10000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
      maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }
    await expect(createSandboxEvmX402PaymentSignature({
      credential: `0x${'11'.repeat(32)}`,
      paymentIdentifier: `sha256:${'ab'.repeat(32)}`,
      selectedRequirement: requirement,
      challenge: {
        x402Version: 2,
        resource: { url: 'https://provider.example/paid' },
        accepts: [requirement],
      },
    })).resolves.toBeUndefined()
  })

  it('rejects malformed and Permit2 payloads as EIP-3009 authorization identity', () => {
    const accepted = {
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '1',
      asset: '0x833589fCD6e5BebaC2B0b6B4D8e5cD5B5C3aA123',
      payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
      maxTimeoutSeconds: 60,
      extra: {},
    } as const
    const base = {
      x402Version: 2 as const,
      accepted,
    }
    expect(readX402PaymentPayerAndNonce(encodePaymentSignatureHeader({
      ...base,
      payload: {
        signature: '0x1234',
        authorization: { from: '0x0000000000000000000000000000000000000001' },
      },
    }))).toBeUndefined()
    expect(readX402PaymentPayerAndNonce(encodePaymentSignatureHeader({
      ...base,
      payload: {
        signature: `0x${'11'.repeat(65)}`,
        permit2Authorization: {
          from: '0x0000000000000000000000000000000000000001',
          permitted: { token: accepted.asset, amount: '1' },
          spender: accepted.payTo,
          nonce: '1',
          deadline: '2',
          witness: { to: accepted.payTo, validAfter: '0' },
        },
      },
    }))).toBeUndefined()
  })
})
