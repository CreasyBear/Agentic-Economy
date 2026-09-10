import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'

import {
  canonicalEvmAddress,
  evmAddressEquals,
  isNonzeroEvmAddress,
  utf8ToHex,
  verifyEip191Message,
} from '@/modules/capability-supply/public'

const PRIVATE_KEY = `0x${'11'.repeat(32)}` as const

describe('x402 EVM protocol adapter', () => {
  it('canonicalizes valid addresses and refuses malformed or zero payees', () => {
    const lowercase = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'
    const canonical = canonicalEvmAddress(lowercase)

    expect(canonical).toBe('0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A')
    expect(evmAddressEquals(lowercase, canonical ?? '')).toBe(true)
    expect(canonicalEvmAddress('not-an-address')).toBeUndefined()
    expect(isNonzeroEvmAddress('0x0000000000000000000000000000000000000000')).toBe(false)
  })

  it('encodes and verifies the exact EIP-191 seller claim message', async () => {
    const account = privateKeyToAccount(PRIVATE_KEY)
    const message = 'Agentic Economy seller claim'
    const signature = await account.signMessage({ message })

    expect(utf8ToHex(message)).toBe('0x4167656e7469632045636f6e6f6d792073656c6c657220636c61696d')
    await expect(verifyEip191Message({
      address: account.address,
      message,
      signature,
    })).resolves.toBe(true)
    await expect(verifyEip191Message({
      address: account.address,
      message: `${message} altered`,
      signature,
    })).resolves.toBe(false)
    await expect(verifyEip191Message({
      address: account.address,
      message,
      signature: '0xdeadbeef',
    })).resolves.toBe(false)
  })
})
