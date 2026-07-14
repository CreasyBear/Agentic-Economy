import { x402Client } from '@x402/core/client'
import { x402HTTPClient } from '@x402/core/http'
import type { PaymentRequired } from '@x402/core/types'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { appendPaymentIdentifierToExtensions } from '@x402/extensions/payment-identifier'
import { privateKeyToAccount } from 'viem/accounts'

import type { X402PaymentSignatureRequest } from '../route-transport-runtime'

const privateKeyPattern = /^0x[0-9a-fA-F]{64}$/

export async function createEvmX402PaymentSignature(
  request: X402PaymentSignatureRequest,
): Promise<string | undefined> {
  if (!privateKeyPattern.test(request.credential)) return undefined
  try {
    const extensions = request.challenge.extensions === undefined
      ? undefined
      : structuredClone(request.challenge.extensions)
    if (extensions !== undefined) {
      appendPaymentIdentifierToExtensions(extensions, paymentIdentifier(request.paymentIdentifier))
    }
    const required: PaymentRequired = {
      x402Version: request.challenge.x402Version,
      resource: { ...request.challenge.resource },
      accepts: [{ ...request.selectedRequirement, extra: { ...request.selectedRequirement.extra } }],
      ...(extensions === undefined ? {} : { extensions }),
    }
    const signer = privateKeyToAccount(request.credential as `0x${string}`)
    const core = new x402Client().register(request.selectedRequirement.network, new ExactEvmScheme(signer))
    const client = new x402HTTPClient(core)
    const payload = await client.createPaymentPayload(required)
    return client.encodePaymentSignatureHeader(payload)['PAYMENT-SIGNATURE']
  } catch {
    return undefined
  }
}

function paymentIdentifier(operationKeyDigest: string): string {
  const normalized = `ae_${operationKeyDigest.replace(/[^A-Za-z0-9_-]/g, '_')}`
  return normalized.slice(0, 128).padEnd(16, '_')
}
