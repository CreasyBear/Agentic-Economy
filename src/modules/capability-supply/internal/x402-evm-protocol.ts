import {
  getAddress,
  isAddress,
  stringToHex,
  verifyMessage,
  zeroAddress,
} from 'viem'

import { degradeBackend } from '@/lib/observability/degrade-backend'

export type Hex = `0x${string}`
export type EvmAddress = Hex

export function canonicalEvmAddress(value: string): EvmAddress | undefined {
  return isAddress(value) ? getAddress(value) : undefined
}

export function isEvmAddress(value: string): value is EvmAddress {
  return isAddress(value)
}

export function isNonzeroEvmAddress(value: string): value is EvmAddress {
  return isAddress(value) && value.toLowerCase() !== zeroAddress
}

export function evmAddressEquals(left: string, right: string): boolean {
  const canonicalLeft = canonicalEvmAddress(left)
  const canonicalRight = canonicalEvmAddress(right)
  return canonicalLeft !== undefined
    && canonicalRight !== undefined
    && canonicalLeft === canonicalRight
}

export function utf8ToHex(value: string): Hex {
  return stringToHex(value)
}

function isEip191Signature(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{130}$/u.test(value)
}

export async function verifyEip191Message(input: Readonly<{
  address: string
  message: string
  signature: string
}>): Promise<boolean> {
  const address = canonicalEvmAddress(input.address)
  if (address === undefined || !isEip191Signature(input.signature)) {
    return false
  }
  try {
    return await verifyMessage({
      address,
      message: input.message,
      signature: input.signature,
    })
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'verifyEip191Message', reason: 'invalid_response' })
  }
}
