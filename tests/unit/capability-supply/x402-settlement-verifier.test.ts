import { encodeAbiParameters, encodeEventTopics, erc20Abi } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  verifyExactEvmX402Settlement,
  type X402EvmReceipt,
} from '@/modules/capability-supply/internal/x402-settlement-verifier'

const asset = '0x0000000000000000000000000000000000000001'
const payer = '0x0000000000000000000000000000000000000002'
const payTo = '0x0000000000000000000000000000000000000003'
const transaction = `0x${'4'.repeat(64)}`
const requirement = {
  scheme: 'exact',
  network: 'eip155:8453',
  amount: '10000',
  asset,
  payTo,
}
const response = {
  success: true,
  transaction,
  network: requirement.network,
  amount: requirement.amount,
  payer,
}
const responseWithoutAmount = {
  success: true,
  transaction,
  network: requirement.network,
  payer,
}
const receipt: X402EvmReceipt = {
  transactionHash: transaction,
  status: 'success',
  confirmations: 12n,
  logs: [{
    address: asset,
    topics: encodeEventTopics({
      abi: erc20Abi,
      eventName: 'Transfer',
      args: { from: payer, to: payTo },
    }).flatMap((topic) => typeof topic === 'string' ? [topic] : []),
    data: encodeAbiParameters([{ type: 'uint256' }], [10_000n]),
  }],
}

describe('x402 EVM settlement verification', () => {
  it('accepts only the bound successful exact ERC-20 transfer', () => {
    expect(verifyExactEvmX402Settlement({ response, requirement, payer, receipt })).toBe(true)
    expect(verifyExactEvmX402Settlement({
      response,
      requirement: { ...requirement, payTo: payer },
      payer,
      receipt,
    })).toBe(false)
    expect(verifyExactEvmX402Settlement({
      response: responseWithoutAmount,
      requirement,
      payer,
      receipt,
    })).toBe(true)
    expect(verifyExactEvmX402Settlement({
      response,
      requirement,
      payer,
      receipt: { ...receipt, confirmations: 11n },
    })).toBe(false)
    expect(verifyExactEvmX402Settlement({
      response: { ...response, transaction: `0x${'5'.repeat(64)}` },
      requirement,
      payer,
      receipt,
    })).toBe(false)
  })
})
